import { renderBlockers, sceneSpecSchema } from './shotSpec'

type SceneRow = { id: string; version: number; status: string; spec: string }

const scenePath = /^\/film\/scenes\/([a-z0-9]+(?:-[a-z0-9]+)*)$/u

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

export async function filmRoute(request: Request, env: Env, path: string) {
  const match = scenePath.exec(path)
  if (!match || !['GET', 'HEAD'].includes(request.method)) return null
  const scene = await loadScene(env.FILM_DB, match[1])
  return scene
    ? Response.json(scene)
    : Response.json({ error: 'Scene not found.' }, { status: 404 })
}
