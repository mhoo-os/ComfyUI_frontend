import { z } from 'zod'

import { compileShot, compileTargets, isCompileTarget } from './compilers'
import { boundedJson } from './http'
import { renderBlockers, sceneSpecSchema } from './shotSpec'

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

/** Reads a stored scene spec, re-validates it and reports per-shot readiness.
 * The database is private owner data; nothing here submits a generation. */
export async function loadScene(db: D1Database, id: string) {
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
  return {
    id: row.id,
    version: row.version,
    status: row.status,
    valid: true as const,
    scene: parsed.data,
    readiness: parsed.data.shots.map((shot) => ({
      shot: shot.id,
      blockers: renderBlockers(shot)
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

/** The film with every episode's breakdown state. Spend is summed from render
 * receipts only; there are none until the render slice, so it is 0. */
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
        'SELECT DISTINCT id, episode FROM scenes WHERE film_id = ? ORDER BY episode, id'
      )
      .bind(id)
  ])
  return Response.json({
    id: film.id,
    title: film.title,
    status: film.status,
    spend: { total: 0, currency: 'USD', receipts: 0 },
    episodes: await Promise.all(
      episodes.map(async (episode) => {
        const sceneId = scenes.find(
          (scene) => scene.episode === episode.number
        )?.id
        const scene = sceneId ? await loadScene(db, sceneId) : null
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
  const row = await db
    .prepare('SELECT * FROM cast_members WHERE id = ?')
    .bind(id)
    .first<CastRow>()
  if (!row) return notFound('Cast member')
  if (action === 'revoke')
    await db
      .prepare(
        "UPDATE cast_members SET status = 'revoked', approved_at = NULL WHERE id = ?"
      )
      .bind(id)
      .run()
  else {
    const source = body.data.sourceRef ?? row.source_ref
    if (row.kind === 'era_look' && !source)
      return badRequest('An era look needs a source image before approval.')
    await db
      .prepare(
        "UPDATE cast_members SET status = 'approved', source_ref = ?, approved_at = datetime('now') WHERE id = ?"
      )
      .bind(source, id)
      .run()
  }
  const updated = await db
    .prepare('SELECT * FROM cast_members WHERE id = ?')
    .bind(id)
    .first<CastRow>()
  return Response.json(updated ? castMember(updated) : null)
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
  const film = await db
    .prepare('SELECT id FROM films WHERE id = ?')
    .bind(spec.film)
    .first()
  if (!film) return notFound('Film')
  try {
    const row = await db
      .prepare(
        `INSERT INTO scenes (id, version, film_id, episode, title, status, spec)
         SELECT ?, COALESCE(MAX(version), 0) + 1, ?, ?, ?, 'draft', ?
         FROM scenes WHERE id = ?
         RETURNING version`
      )
      .bind(id, spec.film, spec.episode, spec.title, JSON.stringify(spec), id)
      .first<{ version: number }>()
    return Response.json({ id, version: row?.version }, { status: 201 })
  } catch (error) {
    // Two saves raced for the same version number; the other one won.
    if (error instanceof Error && /UNIQUE|PRIMARY KEY/u.test(error.message))
      return Response.json(
        { error: 'Another version was saved at the same time. Retry.' },
        { status: 409 }
      )
    throw error
  }
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
    shots: scene.scene.shots.map((shot) => {
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
