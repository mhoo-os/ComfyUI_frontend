import { z } from 'zod'

import { AttemptError } from './attempts'
import type { JobState } from './attempts'
import { loadScene } from './film'

/** Episode cuts: the accepted take of every shot, in scene order, through the
 * finishing nodes (Clip → Sequence → Compose → Export). Rendering uses
 * Cloudflare compute, not provider credits. VO and overlays come later. */

export type CutNode = {
  class_type: 'MhooClip' | 'MhooSequence' | 'MhooCompose' | 'MhooExport'
  inputs: Record<string, string | number | [string, number]>
}
export type CutEngine = {
  submitGraph(graph: Record<string, CutNode>): Promise<string>
  job(id: string, node?: string): Promise<JobState>
}

/** The finishing sequence takes at most 8 clips and 120 seconds. */
const limits = { clips: 8, seconds: 120, clipSeconds: 30 } as const

const takeSchema = z.object({
  shot: z.string(),
  attempt: z.string(),
  output: z.string(),
  seconds: z.number()
})
const cutRowSchema = z.object({
  id: z.string(),
  film_id: z.string(),
  episode: z.number(),
  scene_id: z.string(),
  scene_version: z.number(),
  takes: z.string(),
  status: z.enum(['rendering', 'done', 'failed']),
  job_id: z.string().nullable(),
  export_node: z.string(),
  output: z.string().nullable(),
  error: z.string().nullable(),
  created_at: z.string(),
  finished_at: z.string().nullable()
})
type CutRow = z.infer<typeof cutRowSchema>

const cutView = (row: CutRow) => ({
  id: row.id,
  film: row.film_id,
  episode: row.episode,
  scene: row.scene_id,
  sceneVersion: row.scene_version,
  takes: z.array(takeSchema).parse(JSON.parse(row.takes)),
  status: row.status,
  job: row.job_id,
  output: row.output,
  error: row.error,
  createdAt: row.created_at,
  finishedAt: row.finished_at
})

/** Builds the finishing graph. Pure, so the timeline is easy to check. */
export function cutGraph(
  takes: z.infer<typeof takeSchema>[],
  aspect: '9:16' | '16:9'
) {
  const graph: Record<string, CutNode> = {}
  takes.forEach((take, index) => {
    graph[String(index + 1)] = {
      class_type: 'MhooClip',
      inputs: {
        video_url: `mhoo-media:outputs/${take.output}`,
        start: 0,
        duration: Math.min(take.seconds, limits.clipSeconds)
      }
    }
  })
  const sequence = String(takes.length + 1)
  const compose = String(takes.length + 2)
  const exportNode = String(takes.length + 3)
  graph[sequence] = {
    class_type: 'MhooSequence',
    inputs: {
      transition: 'cut',
      ...Object.fromEntries(
        takes.map((_, index): [string, [string, number]] => [
          `clip_${index + 1}`,
          [String(index + 1), 0]
        ])
      )
    }
  }
  graph[compose] = {
    class_type: 'MhooCompose',
    inputs: {
      sequence: [sequence, 0],
      caption: '',
      music_url: '',
      logo_url: '',
      clip_volume: 1,
      music_volume: 0.25
    }
  }
  graph[exportNode] = {
    class_type: 'MhooExport',
    inputs: { edit: [compose, 0], aspect, resolution: '1080p' }
  }
  return { graph, exportNode }
}

/** Starts a cut of the scene's current version. Every shot needs an accepted take. */
export async function createCut(
  db: D1Database,
  engine: CutEngine,
  sceneId: string
) {
  const scene = await loadScene(db, sceneId)
  if (!scene || !scene.valid)
    throw new AttemptError('Scene not found or invalid.', 404)
  const { results } = await db
    .prepare(
      "SELECT id, shot_id, output FROM attempts WHERE scene_id = ? AND scene_version = ? AND status = 'accepted' AND output IS NOT NULL"
    )
    // Only takes accepted against this version: a revised shot needs a new take.
    .bind(scene.id, scene.version)
    .all()
  const accepted = new Map(
    results.map((item) => {
      const row = z
        .object({ id: z.string(), shot_id: z.string(), output: z.string() })
        .parse(item)
      return [row.shot_id, row] as const
    })
  )
  const missing = scene.scene.shots.filter((shot) => !accepted.has(shot.id))
  if (missing.length)
    throw new AttemptError(
      `Every shot needs a take accepted for spec v${scene.version}. Missing: ${missing.map((shot) => shot.id).join(', ')}.`
    )
  const takes = scene.scene.shots.map((shot) => {
    const take = accepted.get(shot.id)
    if (!take) throw new AttemptError(`Missing take for ${shot.id}.`)
    return {
      shot: shot.id,
      attempt: take.id,
      output: take.output,
      seconds: shot.duration
    }
  })
  if (takes.length > limits.clips)
    throw new AttemptError(
      `A cut holds at most ${limits.clips} shots; this scene has ${takes.length}.`,
      400
    )
  if (
    takes.reduce(
      (sum, take) => sum + Math.min(take.seconds, limits.clipSeconds),
      0
    ) > limits.seconds
  )
    throw new AttemptError(`A cut is at most ${limits.seconds} seconds.`, 400)
  const running = await db
    .prepare("SELECT id FROM cuts WHERE scene_id = ? AND status = 'rendering'")
    .bind(scene.id)
    .first()
  if (running)
    throw new AttemptError('A cut of this scene is already rendering.')
  const aspect = scene.scene.shots[0].aspects[0]
  const { graph, exportNode } = cutGraph(takes, aspect)
  const jobId = await engine.submitGraph(graph)
  const row = await db
    .prepare(
      `INSERT INTO cuts (id, film_id, episode, scene_id, scene_version, takes, status, job_id, export_node)
       VALUES (?, ?, ?, ?, ?, ?, 'rendering', ?, ?) RETURNING *`
    )
    .bind(
      crypto.randomUUID(),
      scene.scene.film,
      scene.scene.episode,
      scene.id,
      scene.version,
      JSON.stringify(takes),
      jobId,
      exportNode
    )
    .first()
  return cutView(cutRowSchema.parse(row))
}

/** Lists a scene's cuts, first bringing any rendering cut up to date. */
export async function listCuts(
  db: D1Database,
  engine: CutEngine,
  sceneId: string
) {
  const { results } = await db
    .prepare('SELECT * FROM cuts WHERE scene_id = ? ORDER BY created_at DESC')
    .bind(sceneId)
    .all()
  const rows = results.map((item) => cutRowSchema.parse(item))
  for (const row of rows) {
    if (row.status !== 'rendering' || !row.job_id) continue
    const job = await engine.job(row.job_id, row.export_node)
    if (job.status === 'pending' || job.status === 'in_progress') continue
    const done = job.status === 'completed' && job.output
    row.status = done ? 'done' : 'failed'
    row.output = done ? job.output : null
    row.error = done ? null : (job.error ?? `The cut ended as ${job.status}.`)
    await db
      .prepare(
        "UPDATE cuts SET status = ?2, output = ?3, error = ?4, finished_at = datetime('now') WHERE id = ?1 AND status = 'rendering'"
      )
      .bind(row.id, row.status, row.output, row.error)
      .run()
  }
  return rows.map(cutView)
}
