import { WorkflowEntrypoint } from 'cloudflare:workers'
import type { WorkflowEvent, WorkflowStep } from 'cloudflare:workers'
import { z } from 'zod'

import {
  AttemptError,
  RefusedError,
  approveAttempt,
  attemptView,
  cancelAttempt,
  createAttempt,
  decideAttempt,
  getAttempt,
  listAttempts,
  refreshAttempt,
  repairAttempt,
  runAttempt,
  unapproveAttempt
} from './attempts'
import type { FilmEngine, RenderNode, ReviewReport, Reviewer } from './attempts'
import { createCut, listCuts } from './cuts'
import type { CutEngine, CutNode } from './cuts'
import { boundedJson } from './http'
import { reviewOutput } from './reviewer'

const internal = 'https://mhoo.internal'
const errorSchema = z
  .object({
    error: z.union([
      z.string(),
      z.object({ type: z.string().optional(), message: z.string() })
    ])
  })
  .passthrough()
const message = (body: unknown, fallback: string) => {
  const parsed = errorSchema.safeParse(body)
  if (!parsed.success) return fallback
  return typeof parsed.data.error === 'string'
    ? parsed.data.error
    : parsed.data.error.message
}

const estimateSchema = z.union([
  z
    .object({
      type: z.literal('estimate'),
      usd: z.string(),
      credits: z.string()
    })
    .passthrough(),
  z
    .object({ type: z.literal('description'), pricing_description: z.string() })
    .passthrough()
])
const jobSchema = z
  .object({
    status: z.enum([
      'pending',
      'in_progress',
      'completed',
      'failed',
      'cancelled'
    ]),
    outputs: z.record(
      z.object({
        video: z.array(z.object({ filename: z.string() })).default([]),
        images: z.array(z.object({ filename: z.string() })).default([])
      })
    ),
    execution_error: z.object({ exception_message: z.string() }).optional()
  })
  .passthrough()

/** The render engine is the existing job ledger (ComfyJobs): one active job,
 * reference re-approval before submission, and no automatic resubmission. */
function comfyEngine(env: Env): FilmEngine & CutEngine {
  const jobs = () => env.COMFY_JOBS.getByName('owner')
  const call = (path: string, body?: unknown) =>
    jobs().fetch(
      new Request(new URL(path, internal), {
        method: body === undefined ? 'GET' : 'POST',
        headers: { 'content-type': 'application/json' },
        ...(body !== undefined && { body: JSON.stringify(body) })
      })
    )
  // A refusal means no job was created, so nothing was spent.
  const submitGraph = async (graph: Record<string, CutNode | RenderNode>) => {
    const response = await call('/prompt', { prompt: graph, client_id: 'film' })
    const body: unknown = await response.json().catch(() => null)
    if (response.status === 409)
      throw new RefusedError(
        message(body, 'Another render is running. Try again when it finishes.')
      )
    if (!response.ok)
      throw new Error(
        message(body, `The job ledger answered HTTP ${response.status}.`)
      )
    return z.object({ prompt_id: z.string() }).parse(body).prompt_id
  }
  return {
    async estimate(node: RenderNode) {
      const response = await call('/higgsfield/estimate', {
        prompt: { '1': node }
      })
      const body: unknown = await response.json().catch(() => null)
      if (!response.ok)
        throw new AttemptError(
          `Could not get a quote: ${message(body, `HTTP ${response.status}`)}`,
          503
        )
      const parsed = estimateSchema.parse(body)
      if (parsed.type === 'description')
        return { usd: null, credits: null, note: parsed.pricing_description }
      const usd = Number(parsed.usd)
      return {
        usd: Number.isFinite(usd) ? usd : null,
        credits: parsed.credits,
        note: null
      }
    },
    submit: (node: RenderNode) => submitGraph({ '1': node }),
    submitGraph,
    async job(id: string, node = '1') {
      const response = await call(`/jobs/${encodeURIComponent(id)}`)
      if (!response.ok)
        throw new Error(`Job status unavailable (HTTP ${response.status}).`)
      const job = jobSchema.parse(await response.json())
      const file =
        job.outputs[node]?.video[0]?.filename ??
        job.outputs[node]?.images[0]?.filename
      return {
        status: job.status,
        output: file ? file.replace(/\.(mp4|png)$/u, '') : null,
        error: job.execution_error?.exception_message ?? null
      }
    }
  }
}

function comfyReviewer(env: Env): Reviewer {
  return async (input) => {
    const result = await reviewOutput(env, input)
    const report: ReviewReport = {
      ...result,
      status: result.summary.status,
      flags: result.summary.flags,
      measured: result.measured,
      vision: result.vision
    }
    return report
  }
}

/** One instance per attempt, named by the attempt id. */
export class FilmRender extends WorkflowEntrypoint<Env, { attemptId: string }> {
  async run(event: WorkflowEvent<{ attemptId: string }>, step: WorkflowStep) {
    return runAttempt(event.payload.attemptId, step, {
      db: this.env.FILM_DB,
      engine: comfyEngine(this.env),
      reviewer: comfyReviewer(this.env)
    })
  }
}

const slug = '([a-z0-9]+(?:-[a-z0-9]+)*)'
const uuid = '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})'
const createPath = new RegExp(
  `^/film/scenes/${slug}/shots/${slug}/attempts$`,
  'u'
)
const listPath = new RegExp(`^/film/scenes/${slug}/attempts$`, 'u')
const cutsPath = new RegExp(`^/film/scenes/${slug}/cuts$`, 'u')
const attemptPath = new RegExp(
  `^/film/attempts/${uuid}(?:/(approve|cancel|accept|reject|repair|refresh))?$`,
  'u'
)
const createBody = z.object({ target: z.string().max(40) }).strict()
const repairBody = z.object({ note: z.string().max(1000).optional() }).strict()

async function startWorkflow(env: Env, id: string) {
  try {
    await env.FILM_RENDER.create({ id, params: { attemptId: id } })
  } catch {
    await cancelAttempt(
      env.FILM_DB,
      id,
      'Could not start the render workflow. Nothing was submitted.'
    )
    throw new AttemptError(
      'Could not start the render workflow. Nothing was submitted; try again.',
      503
    )
  }
}

/** Attempt routes. The Worker has already required the owner and, for writes, the same origin. */
export async function attemptRoute(request: Request, env: Env, path: string) {
  const db = env.FILM_DB
  try {
    const create = createPath.exec(path)
    if (create && request.method === 'POST') {
      const body = createBody.safeParse(await boundedJson(request, 4096))
      if (!body.success)
        return Response.json(
          { error: 'Use { "target": "kling-2.5-standard" | "seedance-2.5" }.' },
          { status: 400 }
        )
      const row = await createAttempt(db, comfyEngine(env), {
        sceneId: create[1],
        shotId: create[2],
        target: body.data.target
      })
      await startWorkflow(env, row.id)
      return Response.json(attemptView(row), { status: 201 })
    }
    const list = listPath.exec(path)
    if (list && request.method === 'GET')
      return Response.json({
        scene: list[1],
        attempts: await listAttempts(
          db,
          list[1],
          new URL(request.url).searchParams.get('shot') ?? undefined
        )
      })
    const cuts = cutsPath.exec(path)
    if (cuts && request.method === 'POST')
      return Response.json(await createCut(db, comfyEngine(env), cuts[1]), {
        status: 201
      })
    if (cuts && request.method === 'GET')
      return Response.json({
        scene: cuts[1],
        cuts: await listCuts(db, comfyEngine(env), cuts[1])
      })
    const match = attemptPath.exec(path)
    if (!match) return null
    const [, id, action] = match
    if (!action && request.method === 'GET') {
      const attempt = await getAttempt(db, id)
      return attempt
        ? Response.json(attempt)
        : Response.json({ error: 'Attempt not found.' }, { status: 404 })
    }
    if (!action || request.method !== 'POST') return null
    if (action === 'approve') {
      await approveAttempt(db, id)
      try {
        await (
          await env.FILM_RENDER.get(id)
        ).sendEvent({ type: 'approve', payload: {} })
      } catch {
        await unapproveAttempt(db, id)
        throw new AttemptError(
          'Could not start the render. The approval was undone; nothing was submitted.',
          503
        )
      }
    } else if (action === 'cancel') {
      await cancelAttempt(db, id)
      await env.FILM_RENDER.get(id)
        .then((instance) => instance.terminate())
        .catch(() => {})
    } else if (action === 'refresh') {
      await refreshAttempt(db, comfyEngine(env), comfyReviewer(env), id)
    } else if (action === 'accept' || action === 'reject') {
      await decideAttempt(db, id, action)
    } else {
      const body = repairBody.safeParse(await boundedJson(request, 4096))
      if (!body.success)
        return Response.json(
          { error: 'Use { "note": "…" } (optional).' },
          { status: 400 }
        )
      const row = await repairAttempt(
        db,
        comfyEngine(env),
        id,
        body.data.note ?? null
      )
      await startWorkflow(env, row.id)
      return Response.json(attemptView(row), { status: 201 })
    }
    return Response.json(await getAttempt(db, id))
  } catch (error) {
    if (error instanceof AttemptError)
      return Response.json({ error: error.message }, { status: error.status })
    throw error
  }
}
