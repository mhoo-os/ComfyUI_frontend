import { compileShot, compileTargets, isCompileTarget } from './compilers'
import { renderBlockers, sceneSpecSchema } from './shotSpec'

type SceneRow = { id: string; version: number; status: string; spec: string }

const scenePath =
  /^\/film\/scenes\/([a-z0-9]+(?:-[a-z0-9]+)*)(?:\/compile\/([a-z0-9.-]+))?$/u

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
