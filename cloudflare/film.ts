import { z } from 'zod'

import { compileShot, compileTargets, isCompileTarget } from './compilers'
import { boundedJson } from './http'
import { renderBlockers, sceneSpecSchema } from './shotSpec'
import type { ShotSpec } from './shotSpec'

type SceneRow = { id: string; version: number; status: string; spec: string }

const slug = '([a-z0-9]+(?:-[a-z0-9]+)*)'
const scenePath = new RegExp(
  `^/film/scenes/${slug}(?:/compile/([a-z0-9.-]+))?$`,
  'u'
)
const versionsPath = new RegExp(`^/film/scenes/${slug}/versions$`, 'u')
const filmPath = new RegExp(`^/film/films/${slug}(/cast)?$`, 'u')
const castPath = new RegExp(`^/film/cast/${slug}/(approve|revoke)$`, 'u')

/** An approved cast image: a stored job output or a character-library token. */
const castSource = z
  .string()
  .regex(
    /^(?:mhoo-media:outputs\/[\w-]+\/[\w-]+\/\d+|mhoo-asset:[0-9a-f-]{36}:[1-9]\d*)$/u
  )
const approveBody = z.object({ sourceRef: castSource.optional() }).strict()
const episodeList = z.array(z.number().int().min(1)).catch([])

type FilmRow = { id: string; title: string; status: string }
type EpisodeRow = { number: number; title: string }
type CastRow = {
  id: string
  film_id: string
  name: string
  kind: 'anchor' | 'era_look' | 'supporting'
  era: string | null
  episodes: string
  source_ref: string | null
  status: 'draft' | 'approved' | 'revoked'
  approved_at: string | null
  note: string | null
}

type CastState = { status: string; source_ref: string | null }

/** Replaces `cast:<id>` references with the member's approved image. An
 * unapproved or unknown member stays a blocker, with a reason naming it. */
function resolveCast(shot: ShotSpec, cast: Map<string, CastState>) {
  const reasons: string[] = []
  const resolved: ShotSpec['references'] = []
  const checked: ShotSpec['references'] = []
  for (const ref of shot.references) {
    if (!ref.asset.startsWith('cast:')) {
      resolved.push(ref)
      checked.push(ref)
      continue
    }
    const id = ref.asset.slice(5)
    const member = cast.get(id)
    const frame = ref.role === 'start_frame' || ref.role === 'end_frame'
    if (
      member?.status === 'approved' &&
      member.source_ref &&
      !(frame && member.source_ref.startsWith('mhoo-media:'))
    ) {
      const usable = { ...ref, asset: member.source_ref, approved: true }
      resolved.push(usable)
      checked.push(usable)
      continue
    }
    reasons.push(
      !member
        ? `Unknown cast member ${id}.`
        : member.status === 'approved' && member.source_ref
          ? `Cast member ${id}'s image is archived media; a ${ref.role} needs a provider URL or character-library token.`
          : `Cast member ${id} needs an approved image for ${ref.role}.`
    )
    // Compilation must still refuse this reference; readiness reports it once, above.
    resolved.push({ ...ref, asset: `pending:cast-${id}`, approved: false })
    checked.push({ ...ref, approved: true })
  }
  return {
    shot: { ...shot, references: resolved },
    blockers: [...reasons, ...renderBlockers({ ...shot, references: checked })]
  }
}

/** Reads a stored scene spec, re-validates it and reports per-shot readiness.
 * `cast:` references resolve against the film's cast, so approving a member
 * updates readiness without a new scene version. Nothing here submits a
 * generation. */
export async function loadScene(
  db: D1Database,
  id: string,
  castByFilm = new Map<string, Promise<Map<string, CastState>>>()
) {
  const row = await db
    .prepare(
      'SELECT id, version, status, spec FROM scenes WHERE id = ? ORDER BY version DESC LIMIT 1'
    )
    .bind(id)
    .first<SceneRow>()
  if (!row) return null
  const parsed = sceneSpecSchema.safeParse(JSON.parse(row.spec))
  if (!parsed.success)
    return {
      id: row.id,
      version: row.version,
      status: row.status,
      valid: false as const,
      issues: parsed.error.issues.map(
        (issue) => `${issue.path.join('.')}: ${issue.message}`
      )
    }
  const usesCast = parsed.data.shots.some((shot) =>
    shot.references.some((ref) => ref.asset.startsWith('cast:'))
  )
  const film = parsed.data.film
  // One cast read per film, shared across scenes when the caller passes a cache.
  if (usesCast && !castByFilm.has(film))
    castByFilm.set(
      film,
      db
        .prepare(
          'SELECT id, status, source_ref FROM cast_members WHERE film_id = ?'
        )
        .bind(film)
        .all<CastState & { id: string }>()
        .then(({ results }) => new Map(results.map((m) => [m.id, m])))
    )
  const cast = usesCast
    ? await (castByFilm.get(film) ??
        Promise.resolve(new Map<string, CastState>()))
    : new Map<string, CastState>()
  const resolved = parsed.data.shots.map((shot) => resolveCast(shot, cast))
  return {
    id: row.id,
    version: row.version,
    status: row.status,
    valid: true as const,
    scene: parsed.data,
    resolved: resolved.map((item) => item.shot),
    readiness: resolved.map((item, index) => ({
      shot: parsed.data.shots[index].id,
      blockers: item.blockers
    }))
  }
}

const castMember = (row: CastRow) => ({
  id: row.id,
  name: row.name,
  kind: row.kind,
  era: row.era,
  episodes: episodeList.parse(JSON.parse(row.episodes)),
  sourceRef: row.source_ref,
  status: row.status,
  approvedAt: row.approved_at,
  note: row.note
})

const badRequest = (error: string, issues?: string[]) =>
  Response.json(issues ? { error, issues } : { error }, { status: 400 })
const notFound = (what: string) =>
  Response.json({ error: `${what} not found.` }, { status: 404 })

/** The film with every episode's breakdown state. Spend will come from render
 * receipts; none exist until the render slice, so it is reported as 0. */
async function filmOverview(db: D1Database, id: string) {
  const film = await db
    .prepare('SELECT id, title, status FROM films WHERE id = ?')
    .bind(id)
    .first<FilmRow>()
  if (!film) return notFound('Film')
  const [{ results: episodes }, { results: scenes }] = await db.batch<
    EpisodeRow & { id: string; episode: number }
  >([
    db
      .prepare(
        'SELECT number, title FROM episodes WHERE film_id = ? ORDER BY number'
      )
      .bind(id),
    db
      .prepare(
        `SELECT id, episode FROM scenes s WHERE film_id = ?
         AND version = (SELECT MAX(version) FROM scenes WHERE id = s.id)
         ORDER BY episode, id`
      )
      .bind(id)
  ])
  const castCache = new Map<string, Promise<Map<string, CastState>>>()
  return Response.json({
    id: film.id,
    title: film.title,
    status: film.status,
    spend: { total: 0, currency: 'USD', receipts: 0 },
    episodes: await Promise.all(
      episodes.map(async (episode) => {
        const inEpisode = scenes.filter(
          (scene) => scene.episode === episode.number
        )
        // Saving keeps one scene per episode; older data that breaks that is reported, not hidden.
        if (inEpisode.length > 1)
          return {
            number: episode.number,
            title: episode.title,
            status: 'invalid',
            scene: inEpisode[0].id,
            issues: [
              `Episode has ${inEpisode.length} scenes: ${inEpisode.map((scene) => scene.id).join(', ')}.`
            ],
            shots: []
          }
        const scene = inEpisode[0]
          ? await loadScene(db, inEpisode[0].id, castCache)
          : null
        if (!scene)
          return {
            number: episode.number,
            title: episode.title,
            status: 'not_broken_down',
            scene: null,
            shots: []
          }
        if (!scene.valid)
          return {
            number: episode.number,
            title: episode.title,
            status: 'invalid',
            scene: scene.id,
            version: scene.version,
            issues: scene.issues,
            shots: []
          }
        return {
          number: episode.number,
          title: episode.title,
          status: 'broken_down',
          scene: scene.id,
          version: scene.version,
          shots: scene.readiness.map(({ shot, blockers }) => ({
            id: shot,
            status: blockers.length ? 'blocked' : 'ready',
            blockers
          }))
        }
      })
    )
  })
}

async function castList(db: D1Database, filmId: string) {
  const film = await db
    .prepare('SELECT id FROM films WHERE id = ?')
    .bind(filmId)
    .first()
  if (!film) return notFound('Film')
  const { results } = await db
    .prepare(
      `SELECT * FROM cast_members WHERE film_id = ?
       ORDER BY CASE kind WHEN 'anchor' THEN 0 WHEN 'era_look' THEN 1 ELSE 2 END, id`
    )
    .bind(filmId)
    .all<CastRow>()
  return Response.json({ film: filmId, cast: results.map(castMember) })
}

/** Owner decisions on a cast member. The Worker already requires the owner
 * and a same-origin request for every mutation. */
async function setCastStatus(
  request: Request,
  db: D1Database,
  id: string,
  action: string
) {
  const body = approveBody.safeParse(await boundedJson(request, 4096))
  if (!body.success)
    return badRequest(
      'Use { "sourceRef": "mhoo-media:outputs/<job>/<node>/<i>" } or a character-library token.'
    )
  // One statement per decision, so overlapping requests can't write back a stale source.
  const updated =
    action === 'revoke'
      ? await db
          .prepare(
            "UPDATE cast_members SET status = 'revoked', approved_at = NULL WHERE id = ? RETURNING *"
          )
          .bind(id)
          .first<CastRow>()
      : await db
          .prepare(
            `UPDATE cast_members
             SET status = 'approved', source_ref = COALESCE(?1, source_ref), approved_at = datetime('now')
             WHERE id = ?2 AND (kind != 'era_look' OR COALESCE(?1, source_ref) IS NOT NULL)
             RETURNING *`
          )
          .bind(body.data.sourceRef ?? null, id)
          .first<CastRow>()
  if (updated) return Response.json(castMember(updated))
  const exists = await db
    .prepare('SELECT id FROM cast_members WHERE id = ?')
    .bind(id)
    .first()
  return exists
    ? badRequest('An era look needs a source image before approval.')
    : notFound('Cast member')
}

/** Stores a new scene version. Existing versions are never updated in place. */
async function createSceneVersion(
  request: Request,
  db: D1Database,
  id: string
) {
  const parsed = sceneSpecSchema.safeParse(await boundedJson(request))
  if (!parsed.success)
    return badRequest(
      'The scene spec is invalid.',
      parsed.error.issues.map(
        (issue) => `${issue.path.join('.')}: ${issue.message}`
      )
    )
  const spec = parsed.data
  if (spec.id !== id)
    return badRequest(`The spec id ${spec.id} does not match ${id}.`)
  // Check and insert in one statement: the episode must exist, an existing scene
  // keeps its film and episode, and an episode holds one scene.
  const row = await db
    .prepare(
      `INSERT INTO scenes (id, version, film_id, episode, title, status, spec)
       SELECT ?1, COALESCE((SELECT MAX(version) FROM scenes WHERE id = ?1), 0) + 1, ?2, ?3, ?4, 'draft', ?5
       WHERE EXISTS (SELECT 1 FROM episodes WHERE film_id = ?2 AND number = ?3)
         AND NOT EXISTS (SELECT 1 FROM scenes WHERE id = ?1 AND (film_id != ?2 OR episode != ?3))
         AND NOT EXISTS (SELECT 1 FROM scenes WHERE film_id = ?2 AND episode = ?3 AND id != ?1)
       RETURNING version`
    )
    .bind(id, spec.film, spec.episode, spec.title, JSON.stringify(spec))
    .first<{ version: number }>()
  if (row) return Response.json({ id, version: row.version }, { status: 201 })
  const episode = await db
    .prepare('SELECT 1 FROM episodes WHERE film_id = ? AND number = ?')
    .bind(spec.film, spec.episode)
    .first()
  if (!episode) return notFound(`Episode ${spec.episode} of ${spec.film}`)
  const existing = await db
    .prepare('SELECT film_id, episode FROM scenes WHERE id = ? LIMIT 1')
    .bind(id)
    .first<{ film_id: string; episode: number }>()
  if (
    existing &&
    (existing.film_id !== spec.film || existing.episode !== spec.episode)
  )
    return Response.json(
      {
        error: `Scene ${id} belongs to ${existing.film_id} episode ${existing.episode}; a new version can't move it.`
      },
      { status: 409 }
    )
  return Response.json(
    { error: `Episode ${spec.episode} already has a scene.` },
    { status: 409 }
  )
}

export async function filmRoute(request: Request, env: Env, path: string) {
  const db = env.FILM_DB
  const read = ['GET', 'HEAD'].includes(request.method)
  const film = filmPath.exec(path)
  if (film && read)
    return film[2] ? castList(db, film[1]) : filmOverview(db, film[1])
  const cast = castPath.exec(path)
  if (cast && request.method === 'POST')
    return setCastStatus(request, db, cast[1], cast[2])
  const versions = versionsPath.exec(path)
  if (versions && request.method === 'POST')
    return createSceneVersion(request, db, versions[1])
  const match = scenePath.exec(path)
  if (!match || !read) return null
  const [, id, target] = match
  if (target && !isCompileTarget(target))
    return Response.json(
      { error: `Unknown target. Use ${compileTargets.join(' or ')}.` },
      { status: 400 }
    )
  const scene = await loadScene(env.FILM_DB, id)
  if (!scene)
    return Response.json({ error: 'Scene not found.' }, { status: 404 })
  if (!target || !isCompileTarget(target) || !scene.valid)
    return Response.json(scene)
  return Response.json({
    id: scene.id,
    version: scene.version,
    target,
    submitted: false,
    shots: scene.resolved.map((shot) => {
      try {
        return compileShot(shot, target)
      } catch (error) {
        return {
          shot: shot.id,
          error: error instanceof Error ? error.message : 'Compile failed.'
        }
      }
    })
  })
}
