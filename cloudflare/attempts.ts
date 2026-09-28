import type {
  WorkflowSleepDuration,
  WorkflowStepConfig
} from 'cloudflare:workers'
import { z } from 'zod'

import { compileShot, isCompileTarget } from './compilers'
import type { CompileTarget } from './compilers'
import { loadScene } from './film'
import type { Input } from './graph'
import type { Defect, VisionReview } from './reviewer'

/** Render attempts: quote → owner approval → one submission → review → owner
 * decision. Spend happens only after an owner approves a quote that fits the
 * caps, and a submission is never repeated automatically. */

/** Owner decision (2026-09-28). Changing a cap is a code change on purpose. */
export const caps = { shotUsd: 5, episodeUsd: 50, attemptsPerShot: 3 } as const

export type RenderNode = { class_type: string; inputs: Input }
type Quote = {
  usd: number | null
  credits: string | null
  note: string | null
}
export type JobState = {
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled'
  output: string | null
  error: string | null
}

/** The provider side, injected so tests and callers never spend by accident. */
export type FilmEngine = {
  estimate(node: RenderNode): Promise<Quote>
  submit(node: RenderNode): Promise<string>
  /** Status of a job, with the first output of `node` (default "1"). */
  job(id: string, node?: string): Promise<JobState>
}

export type ReviewReport = {
  status: 'flagged' | 'no_flags' | 'error'
  flags: number
  measured: Defect[]
  vision: VisionReview | { error: string }
} & Record<string, unknown>

export type Reviewer = (input: {
  sceneId: string
  version: number
  shotId: string
  output: string
}) => Promise<ReviewReport>

const statuses = [
  'quoted',
  'approved',
  'submitting',
  'rendering',
  'rendered',
  'reviewed',
  'accepted',
  'rejected',
  'failed',
  'cancelled'
] as const
export type AttemptStatus = (typeof statuses)[number]

const nodeSchema = z.object({
  class_type: z.string(),
  inputs: z.record(z.union([z.string(), z.number(), z.boolean()]))
})
const repairSchema = z.object({
  note: z.string().nullable(),
  fixes: z.array(z.string())
})
const rowSchema = z.object({
  id: z.string(),
  film_id: z.string(),
  episode: z.number(),
  scene_id: z.string(),
  scene_version: z.number(),
  shot_id: z.string(),
  target: z.string(),
  number: z.number(),
  parent_id: z.string().nullable(),
  request: z.string(),
  repair: z.string().nullable(),
  quote_usd: z.number().nullable(),
  quote_credits: z.string().nullable(),
  quote_note: z.string().nullable(),
  status: z.enum(statuses),
  job_id: z.string().nullable(),
  output: z.string().nullable(),
  spend_usd: z.number().nullable(),
  error: z.string().nullable(),
  created_at: z.string(),
  approved_at: z.string().nullable(),
  finished_at: z.string().nullable(),
  decided_at: z.string().nullable()
})
type AttemptRow = z.infer<typeof rowSchema>

const reviewRowSchema = z.object({
  attempt_id: z.string(),
  status: z.enum(['flagged', 'no_flags', 'error']),
  flags: z.number(),
  report: z.string(),
  created_at: z.string()
})

/** A submission refused before any job existed spent nothing and uses no slot. */
// `IS 0`, not `= 0`: an unknown spend (NULL) must still count.
const refused = (a: string) =>
  `(${a}status = 'failed' AND ${a}job_id IS NULL AND ${a}spend_usd IS 0)`
/** Attempts that may have spent money. `a` is an optional table alias with its dot. */
const committed = (a = '') =>
  `${a}status NOT IN ('quoted', 'cancelled') AND NOT ${refused(a)}`
/** Attempts that use one of the shot's slots. */
const COUNTED = `status != 'cancelled' AND NOT ${refused('')}`
const OPEN = `status IN ('quoted', 'approved', 'submitting', 'rendering')`

export function attemptView(
  row: AttemptRow,
  review?: z.infer<typeof reviewRowSchema> | null
) {
  return {
    id: row.id,
    film: row.film_id,
    episode: row.episode,
    scene: row.scene_id,
    sceneVersion: row.scene_version,
    shot: row.shot_id,
    target: row.target,
    number: row.number,
    parent: row.parent_id,
    request: nodeSchema.parse(JSON.parse(row.request)),
    repair: row.repair ? repairSchema.parse(JSON.parse(row.repair)) : null,
    quote: {
      usd: row.quote_usd,
      credits: row.quote_credits,
      note: row.quote_note
    },
    status: row.status,
    job: row.job_id,
    output: row.output,
    spendUsd: row.spend_usd,
    error: row.error,
    createdAt: row.created_at,
    approvedAt: row.approved_at,
    finishedAt: row.finished_at,
    decidedAt: row.decided_at,
    review: review
      ? {
          status: review.status,
          flags: review.flags,
          report: z.record(z.unknown()).parse(JSON.parse(review.report)),
          createdAt: review.created_at
        }
      : null
  }
}

export class AttemptError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409 | 503 = 409
  ) {
    super(message)
  }
}

/** The engine refused before any job existed (the job ledger's queue_full),
 * so nothing was spent. Every other submission error is an unknown outcome. */
export class RefusedError extends AttemptError {}

async function getRow(db: D1Database, id: string) {
  const row = await db
    .prepare('SELECT * FROM attempts WHERE id = ?')
    .bind(id)
    .first()
  return row ? rowSchema.parse(row) : null
}

export async function getAttempt(db: D1Database, id: string) {
  const row = await getRow(db, id)
  if (!row) return null
  const review = await db
    .prepare('SELECT * FROM reviews WHERE attempt_id = ?')
    .bind(id)
    .first()
  return attemptView(row, review ? reviewRowSchema.parse(review) : null)
}

export async function listAttempts(
  db: D1Database,
  sceneId: string,
  shotId?: string
) {
  const { results } = await db
    .prepare(
      `SELECT a.*, r.status AS review_status, r.flags AS review_flags, r.report AS review_report, r.created_at AS review_created_at
       FROM attempts a LEFT JOIN reviews r ON r.attempt_id = a.id
       WHERE a.scene_id = ?1 AND (?2 IS NULL OR a.shot_id = ?2)
       ORDER BY a.created_at, a.number`
    )
    .bind(sceneId, shotId ?? null)
    .all()
  return results.map((item) => {
    const joined = z
      .object({
        review_status: z.enum(['flagged', 'no_flags', 'error']).nullable(),
        review_flags: z.number().nullable(),
        review_report: z.string().nullable(),
        review_created_at: z.string().nullable()
      })
      .parse(item)
    const row = rowSchema.parse(item)
    return attemptView(
      row,
      joined.review_status && joined.review_report && joined.review_created_at
        ? {
            attempt_id: row.id,
            status: joined.review_status,
            flags: joined.review_flags ?? 0,
            report: joined.review_report,
            created_at: joined.review_created_at
          }
        : null
    )
  })
}

/** Spend so far: recorded spend, or the quote while spend is unknown. */
export async function spendSummary(db: D1Database, filmId: string) {
  const row = z
    .object({ total: z.number().nullable(), receipts: z.number() })
    .parse(
      await db
        .prepare(
          `SELECT SUM(COALESCE(spend_usd, quote_usd, 0)) AS total, COUNT(*) AS receipts
           FROM attempts WHERE film_id = ? AND ${committed()}`
        )
        .bind(filmId)
        .first()
    )
  return {
    total: Number((row.total ?? 0).toFixed(2)),
    currency: 'USD',
    receipts: row.receipts
  }
}

/** Render state per shot for the film overview, keyed `<scene>/<shot>`:
 * `approved` once a take is accepted, else the latest attempt's stage. */
export async function shotStates(db: D1Database, filmId: string) {
  const { results } = await db
    .prepare(
      `SELECT scene_id, shot_id, status FROM attempts WHERE film_id = ? AND status != 'cancelled'
       ORDER BY created_at, number`
    )
    .bind(filmId)
    .all()
  const states = new Map<
    string,
    'approved' | 'review' | 'rendering' | 'quoted' | 'failed'
  >()
  const stage = {
    quoted: 'quoted',
    approved: 'rendering',
    submitting: 'rendering',
    rendering: 'rendering',
    rendered: 'review',
    reviewed: 'review',
    rejected: 'failed',
    failed: 'failed'
  } as const
  for (const item of results) {
    const row = z
      .object({
        scene_id: z.string(),
        shot_id: z.string(),
        status: z.enum(statuses)
      })
      .parse(item)
    const key = `${row.scene_id}/${row.shot_id}`
    if (states.get(key) === 'approved') continue
    states.set(
      key,
      row.status === 'accepted'
        ? 'approved'
        : stage[row.status === 'cancelled' ? 'failed' : row.status]
    )
  }
  return states
}

/** Quotes a node. A quote without a dollar amount can't be checked against the
 * caps, so it can never be approved. */
async function quote(engine: FilmEngine, node: RenderNode) {
  const result = await engine.estimate(node)
  return {
    usd:
      result.usd !== null && Number.isFinite(result.usd) && result.usd >= 0
        ? result.usd
        : null,
    credits: result.credits,
    note: result.note
  }
}

type NewAttempt = {
  scene: { id: string; version: number; film: string; episode: number }
  shotId: string
  target: CompileTarget
  node: RenderNode
  parentId: string | null
  repair: z.infer<typeof repairSchema> | null
}

async function insertAttempt(
  db: D1Database,
  engine: FilmEngine,
  input: NewAttempt
) {
  const { scene } = input
  const priced = await quote(engine, input.node)
  const id = crypto.randomUUID()
  // One statement: at most one open attempt per shot, and at most three that count.
  const row = await db
    .prepare(
      `INSERT INTO attempts (id, film_id, episode, scene_id, scene_version, shot_id, target, number,
         parent_id, request, repair, quote_usd, quote_credits, quote_note, status)
       SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7,
         (SELECT COUNT(*) FROM attempts WHERE scene_id = ?4 AND shot_id = ?6 AND ${COUNTED}) + 1,
         ?8, ?9, ?10, ?11, ?12, ?13, 'quoted'
       WHERE (SELECT COUNT(*) FROM attempts WHERE scene_id = ?4 AND shot_id = ?6 AND ${COUNTED}) < ?14
         AND NOT EXISTS (SELECT 1 FROM attempts WHERE scene_id = ?4 AND shot_id = ?6 AND ${OPEN})
       RETURNING *`
    )
    .bind(
      id,
      scene.film,
      scene.episode,
      scene.id,
      scene.version,
      input.shotId,
      input.target,
      input.parentId,
      JSON.stringify(input.node),
      input.repair ? JSON.stringify(input.repair) : null,
      priced.usd,
      priced.credits,
      priced.note,
      caps.attemptsPerShot
    )
    .first()
  if (row) return rowSchema.parse(row)
  const open = await db
    .prepare(
      `SELECT id FROM attempts WHERE scene_id = ? AND shot_id = ? AND ${OPEN}`
    )
    .bind(scene.id, input.shotId)
    .first()
  throw new AttemptError(
    open
      ? 'This shot already has an attempt waiting or rendering. Finish or cancel it first.'
      : `This shot has used its ${caps.attemptsPerShot} attempts. It comes back to you: revise the spec or references.`
  )
}

/** Compiles the latest scene version's shot and quotes it. Nothing is submitted. */
export async function createAttempt(
  db: D1Database,
  engine: FilmEngine,
  input: { sceneId: string; shotId: string; target: string }
) {
  if (!isCompileTarget(input.target))
    throw new AttemptError('Unknown render target.', 400)
  const scene = await loadScene(db, input.sceneId)
  if (!scene || !scene.valid)
    throw new AttemptError('Scene not found or invalid.', 404)
  const shot = scene.resolved.find((item) => item.id === input.shotId)
  if (!shot) throw new AttemptError('Shot not found.', 404)
  let compiled
  try {
    compiled = compileShot(shot, input.target)
  } catch (error) {
    throw new AttemptError(
      error instanceof Error ? error.message : 'Compile failed.',
      409
    )
  }
  return insertAttempt(db, engine, {
    scene: {
      id: scene.id,
      version: scene.version,
      film: scene.scene.film,
      episode: scene.scene.episode
    },
    shotId: shot.id,
    target: input.target,
    node: { class_type: compiled.class_type, inputs: compiled.inputs },
    parentId: null,
    repair: null
  })
}

/** Owner approval. One statement checks the status, the quote, and both caps. */
export async function approveAttempt(db: D1Database, id: string) {
  const row = await db
    .prepare(
      `UPDATE attempts SET status = 'approved', approved_at = datetime('now')
       WHERE id = ?1 AND status = 'quoted' AND quote_usd IS NOT NULL
         AND quote_usd + (SELECT COALESCE(SUM(COALESCE(o.spend_usd, o.quote_usd, 0)), 0) FROM attempts o
           WHERE o.scene_id = attempts.scene_id AND o.shot_id = attempts.shot_id AND o.id != ?1 AND ${committed('o.')}) <= ?2
         AND quote_usd + (SELECT COALESCE(SUM(COALESCE(o.spend_usd, o.quote_usd, 0)), 0) FROM attempts o
           WHERE o.film_id = attempts.film_id AND o.episode = attempts.episode AND o.id != ?1 AND ${committed('o.')}) <= ?3
       RETURNING *`
    )
    .bind(id, caps.shotUsd, caps.episodeUsd)
    .first()
  if (row) return rowSchema.parse(row)
  const current = await getRow(db, id)
  if (!current) throw new AttemptError('Attempt not found.', 404)
  if (current.status !== 'quoted')
    throw new AttemptError(
      `The attempt is ${current.status}, not waiting for approval.`
    )
  if (current.quote_usd === null)
    throw new AttemptError(
      'The quote has no dollar amount, so the caps cannot be checked. It cannot be approved.'
    )
  throw new AttemptError(
    `Approving would cross a cap ($${caps.shotUsd} per shot, $${caps.episodeUsd} per episode). It comes back to you.`
  )
}

/** Puts an approval back when the render could not be told to start. */
export async function unapproveAttempt(db: D1Database, id: string) {
  await db
    .prepare(
      "UPDATE attempts SET status = 'quoted', approved_at = NULL WHERE id = ? AND status = 'approved'"
    )
    .bind(id)
    .run()
}

export async function cancelAttempt(
  db: D1Database,
  id: string,
  reason = 'Cancelled by the owner.'
) {
  const row = await db
    .prepare(
      `UPDATE attempts SET status = 'cancelled', error = ?2, finished_at = datetime('now')
       WHERE id = ?1 AND status IN ('quoted', 'approved') RETURNING *`
    )
    .bind(id, reason)
    .first()
  if (row) return rowSchema.parse(row)
  const current = await getRow(db, id)
  if (!current) throw new AttemptError('Attempt not found.', 404)
  throw new AttemptError(
    `The attempt is ${current.status}; only a quote that hasn't started can be cancelled.`
  )
}

/** Workflow step: claims the approval and submits once. Returns the job id, or
 * null when there is nothing to submit. A failure is recorded, never retried.
 * The job id is written by a separate step, so a failed write can't lose it. */
async function claimAndSubmit(db: D1Database, engine: FilmEngine, id: string) {
  const claimed = await db
    .prepare(
      "UPDATE attempts SET status = 'submitting' WHERE id = ? AND status = 'approved' RETURNING *"
    )
    .bind(id)
    .first()
  if (!claimed) return null
  const row = rowSchema.parse(claimed)
  try {
    return await engine.submit(nodeSchema.parse(JSON.parse(row.request)))
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Submission failed.'
    const refused = error instanceof RefusedError
    await db
      .prepare(
        `UPDATE attempts SET status = 'failed', error = ?2, spend_usd = ?3, finished_at = datetime('now')
         WHERE id = ?1 AND status = 'submitting'`
      )
      .bind(
        id,
        refused
          ? message
          : `${message} The outcome is unknown: check the job history before trying again. Nothing was retried.`,
        refused ? 0 : null
      )
      .run()
    return null
  }
}

/** Workflow step (retried): records the submitted job. */
async function recordJob(db: D1Database, id: string, jobId: string) {
  await db
    .prepare(
      "UPDATE attempts SET status = 'rendering', job_id = ?2 WHERE id = ?1 AND status = 'submitting'"
    )
    .bind(id, jobId)
    .run()
}

/** Both submission steps in one call, for callers outside a Workflow. */
export async function submitAttempt(
  db: D1Database,
  engine: FilmEngine,
  id: string
) {
  const jobId = await claimAndSubmit(db, engine, id)
  if (jobId) await recordJob(db, id, jobId)
  return jobId
}

/** Workflow step: reads the job and records the result. Returns the new status. */
export async function syncAttempt(
  db: D1Database,
  engine: FilmEngine,
  id: string
): Promise<AttemptStatus> {
  const row = await getRow(db, id)
  if (!row || row.status !== 'rendering' || !row.job_id)
    return row?.status ?? 'failed'
  const job = await engine.job(row.job_id)
  if (job.status === 'pending' || job.status === 'in_progress')
    return 'rendering'
  const done = job.status === 'completed' && job.output
  // The quote is the recorded spend: the provider reports status, not cost.
  await db
    .prepare(
      `UPDATE attempts SET status = ?2, output = ?3, error = ?4, spend_usd = quote_usd, finished_at = datetime('now')
       WHERE id = ?1 AND status = 'rendering'`
    )
    .bind(
      id,
      done ? 'rendered' : 'failed',
      done ? job.output : null,
      done ? null : (job.error ?? `The render ended as ${job.status}.`)
    )
    .run()
  return done ? 'rendered' : 'failed'
}

/** Owner-triggered "Check again" for a render whose tracking paused. */
export async function refreshAttempt(
  db: D1Database,
  engine: FilmEngine,
  reviewer: Reviewer,
  id: string
) {
  const status = await syncAttempt(db, engine, id)
  if (status === 'rendered') await reviewAttempt(db, reviewer, id)
}

/** Workflow step: stores the automated review. The owner still decides. */
async function reviewAttempt(db: D1Database, reviewer: Reviewer, id: string) {
  const row = await getRow(db, id)
  if (!row || row.status !== 'rendered' || !row.output) return
  let report: ReviewReport
  try {
    report = await reviewer({
      sceneId: row.scene_id,
      version: row.scene_version,
      shotId: row.shot_id,
      output: row.output
    })
  } catch (error) {
    report = {
      status: 'error',
      flags: 0,
      measured: [],
      vision: {
        error: error instanceof Error ? error.message : 'Review failed.'
      }
    }
  }
  await db.batch([
    db
      .prepare(
        'INSERT OR REPLACE INTO reviews (attempt_id, status, flags, report) VALUES (?, ?, ?, ?)'
      )
      .bind(id, report.status, report.flags, JSON.stringify(report)),
    db
      .prepare(
        "UPDATE attempts SET status = 'reviewed' WHERE id = ? AND status = 'rendered'"
      )
      .bind(id)
  ])
}

/** Owner decision on a finished take. Accepting one retires any earlier accepted take of the shot. */
export async function decideAttempt(
  db: D1Database,
  id: string,
  decision: 'accept' | 'reject'
) {
  const current = await getRow(db, id)
  if (!current) throw new AttemptError('Attempt not found.', 404)
  if (
    ![
      'rendered',
      'reviewed',
      ...(decision === 'reject' ? ['accepted'] : [])
    ].includes(current.status)
  )
    throw new AttemptError(
      `The attempt is ${current.status}; only a finished take can be ${decision}ed.`
    )
  const status = decision === 'accept' ? 'accepted' : 'rejected'
  const statements = [
    ...(decision === 'accept'
      ? [
          db
            .prepare(
              `UPDATE attempts SET status = 'rejected', decided_at = datetime('now')
               WHERE scene_id = ? AND shot_id = ? AND status = 'accepted' AND id != ?`
            )
            .bind(current.scene_id, current.shot_id, id)
        ]
      : []),
    db
      .prepare(
        `UPDATE attempts SET status = ?2, decided_at = datetime('now')
         WHERE id = ?1 AND status IN ('rendered', 'reviewed', 'accepted') RETURNING *`
      )
      .bind(id, status)
  ]
  const results = await db.batch(statements)
  const updated = results.at(-1)?.results[0]
  if (!updated)
    throw new AttemptError('The attempt changed; reload and try again.')
  return rowSchema.parse(updated)
}

const fixFor: Record<Defect['kind'], string> = {
  missed_action:
    'Make every beat visibly happen on screen, in order, within the shot.',
  still_stretch: 'Keep continuous natural motion; no frozen or stalled frames.',
  no_ending_hold: 'End by holding the final pose steadily for the last second.',
  color_drift:
    'Keep the lighting and colour consistent with the start frame throughout.',
  duration_mismatch: 'Fill the full shot duration with the described action.'
}

/** Turns a review and an owner note into prompt changes. Pure, so it is easy to audit. */
export function repairPlan(report: ReviewReport | null, note: string | null) {
  const fixes = new Set<string>()
  for (const defect of report?.measured ?? []) fixes.add(fixFor[defect.kind])
  if (report && 'observations' in report.vision) {
    for (const observation of report.vision.observations)
      if (observation.result === 'not_met')
        fixes.add(`Must: ${observation.criterion}`)
    if (report.vision.face_visible !== 'most_frames')
      fixes.add(
        "Keep the person's face clearly visible and identical to the start frame."
      )
  }
  return { note: note?.trim() || null, fixes: [...fixes] }
}

const promptLimit: Record<string, number> = {
  HiggsfieldKlingDraft: 2500,
  HiggsfieldAnimate: 5000
}

export function applyRepair(
  node: RenderNode,
  plan: z.infer<typeof repairSchema>
): RenderNode {
  const lines = [
    ...plan.fixes,
    ...(plan.note ? [`Director's note: ${plan.note}`] : [])
  ]
  if (!lines.length) return node
  const base = typeof node.inputs.prompt === 'string' ? node.inputs.prompt : ''
  const limit = promptLimit[node.class_type] ?? 2500
  const prompt = `${base} ${lines.join(' ')}`.slice(0, limit)
  return { ...node, inputs: { ...node.inputs, prompt } }
}

/** A follow-up attempt from a finished or failed one: same shot, target and
 * scene version, with fixes from its review and the owner's note. Still needs approval. */
export async function repairAttempt(
  db: D1Database,
  engine: FilmEngine,
  id: string,
  note: string | null
) {
  const parent = await getAttempt(db, id)
  if (!parent) throw new AttemptError('Attempt not found.', 404)
  if (!['rendered', 'reviewed', 'rejected', 'failed'].includes(parent.status))
    throw new AttemptError(
      `The attempt is ${parent.status}; repair a finished, rejected or failed take.`
    )
  const report = parent.review
    ? reviewReportSchema.safeParse(parent.review.report)
    : null
  const plan = repairPlan(report?.success ? report.data : null, note)
  if (!plan.fixes.length && !plan.note)
    throw new AttemptError(
      'Nothing to repair yet: add a note describing what to change.',
      400
    )
  if (!isCompileTarget(parent.target))
    throw new AttemptError('Unknown render target.', 400)
  if (parent.status !== 'rejected' && parent.status !== 'failed')
    await decideAttempt(db, id, 'reject')
  return insertAttempt(db, engine, {
    scene: {
      id: parent.scene,
      version: parent.sceneVersion,
      film: parent.film,
      episode: parent.episode
    },
    shotId: parent.shot,
    target: parent.target,
    node: applyRepair(parent.request, plan),
    parentId: parent.id,
    repair: plan
  })
}

const reviewReportSchema: z.ZodType<ReviewReport> = z
  .object({
    status: z.enum(['flagged', 'no_flags', 'error']),
    flags: z.number(),
    measured: z.array(
      z.object({
        kind: z.enum([
          'color_drift',
          'still_stretch',
          'missed_action',
          'no_ending_hold',
          'duration_mismatch'
        ]),
        at: z.number(),
        until: z.number().optional(),
        note: z.string()
      })
    ),
    vision: z.union([
      z.object({
        observations: z.array(
          z.object({
            criterion: z.string(),
            result: z.enum(['met', 'not_met', 'unclear']),
            at: z.number().nullable(),
            note: z.string()
          })
        ),
        face_visible: z.enum(['most_frames', 'some_frames', 'no_frames']),
        reads_as: z.string()
      }),
      z.object({ error: z.string() })
    ])
  })
  .passthrough()

/** The durable part of an attempt. `step` is Cloudflare's WorkflowStep; tests
 * pass a small stand-in. */
export type StepLike = {
  do<T extends Rpc.Serializable<T>>(
    name: string,
    config: WorkflowStepConfig,
    fn: () => Promise<T>
  ): Promise<T>
  sleep(name: string, duration: WorkflowSleepDuration): Promise<void>
  waitForEvent(
    name: string,
    options: { type: string; timeout?: WorkflowSleepDuration }
  ): Promise<unknown>
}

const once = {
  retries: { limit: 0, delay: '1 second' },
  timeout: '2 minutes'
} as const
const read = {
  retries: { limit: 3, delay: '10 seconds', backoff: 'exponential' },
  timeout: '2 minutes'
} as const

export async function runAttempt(
  id: string,
  step: StepLike,
  deps: { db: D1Database; engine: FilmEngine; reviewer: Reviewer }
) {
  try {
    await step.waitForEvent('owner approval', {
      type: 'approve',
      timeout: '7 days'
    })
  } catch {
    await step.do('expire', once, async () => {
      await deps.db
        .prepare(
          `UPDATE attempts SET status = 'cancelled', error = 'The quote expired without approval.', finished_at = datetime('now')
           WHERE id = ? AND status = 'quoted'`
        )
        .bind(id)
        .run()
    })
    return 'cancelled'
  }
  const job = await step.do('submit', once, () =>
    claimAndSubmit(deps.db, deps.engine, id)
  )
  if (!job) return 'not submitted'
  // The job id lives in this Workflow's step state; keep trying to record it
  // (for about a day) rather than lose track of a paid job.
  for (let tries = 0; ; tries++) {
    try {
      await step.do(tries ? `record-job-${tries}` : 'record-job', read, () =>
        recordJob(deps.db, id, job)
      )
      break
    } catch {
      if (tries >= 48) return 'submitting'
      await step.sleep(`record-wait-${tries}`, '30 minutes')
    }
  }
  let status: AttemptStatus = 'rendering'
  let outage = 0
  for (let tick = 0; tick < 360 && status === 'rendering'; tick++) {
    await step.sleep(`wait-${tick}`, '20 seconds')
    try {
      status = await step.do(`check-${tick}`, read, () =>
        syncAttempt(deps.db, deps.engine, id)
      )
      outage = 0
    } catch {
      // Status reads failed even after retries; keep tracking rather than give up.
      if (++outage >= 30) break
    }
  }
  if (status === 'rendering') {
    // The render may still finish: keep it open (its quote counts) and say how to resume.
    await step.do('tracking-paused', once, async () => {
      await deps.db
        .prepare(
          `UPDATE attempts SET error = 'Tracking paused before the render finished. Use Check again; nothing was retried.'
           WHERE id = ? AND status = 'rendering'`
        )
        .bind(id)
        .run()
    })
    return 'rendering'
  }
  if (status !== 'rendered') return status
  await step.do(
    'review',
    { retries: { limit: 1, delay: '30 seconds' }, timeout: '10 minutes' },
    () => reviewAttempt(deps.db, deps.reviewer, id)
  )
  return 'reviewed'
}
