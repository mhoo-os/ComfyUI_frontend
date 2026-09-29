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
import { compileTargets } from './compilers'
import { createCut, listCuts } from './cuts'
import type { CutEngine, CutNode } from './cuts'
import { boundedJson } from './http'
import { isQueueFull, jobState } from './jobLedger'
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

/** The render engine is the existing job ledger (ComfyJobs): a few active jobs
 * at once, reference re-approval before submission, and no automatic
 * resubmission. A full ledger refuses, and the attempt waits for a slot. */
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
    // Only the ledger's explicit queue_full is known to have created no job.
    if (isQueueFull(response.status, body))
      throw new RefusedError(
        message(body, 'Every render slot is busy. Try again when one finishes.')
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
      return jobState(await response.json(), node)
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
  // Called by the Workflows runtime (wrangler.jsonc binding FILM_RENDER), not from our code.
  // fallow-ignore-next-line unused-class-member
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
const attemptPath = new RegExp(`^/film/attempts/${uuid}$`, 'u')
const actionPath = new RegExp(
  `^/film/attempts/${uuid}/(approve|cancel|accept|reject|repair|refresh)$`,
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

const badRequest = (error: string) => Response.json({ error }, { status: 400 })

async function quoteRoute(
  request: Request,
  env: Env,
  sceneId: string,
  shotId: string
) {
  const body = createBody.safeParse(await boundedJson(request, 4096))
  if (!body.success)
    return badRequest(
      `Use { "target": ${compileTargets.map((target) => `"${target}"`).join(' | ')} }.`
    )
  const row = await createAttempt(env.FILM_DB, comfyEngine(env), {
    sceneId,
    shotId,
    target: body.data.target
  })
  await startWorkflow(env, row.id)
  return Response.json(attemptView(row), { status: 201 })
}

async function approveRoute(env: Env, id: string) {
  await approveAttempt(env.FILM_DB, id)
  try {
    await (
      await env.FILM_RENDER.get(id)
    ).sendEvent({ type: 'approve', payload: {} })
  } catch {
    await unapproveAttempt(env.FILM_DB, id)
    throw new AttemptError(
      'Could not start the render. The approval was undone; nothing was submitted.',
      503
    )
  }
}

async function repairRoute(request: Request, env: Env, id: string) {
  const body = repairBody.safeParse(await boundedJson(request, 4096))
  if (!body.success) return badRequest('Use { "note": "…" } (optional).')
  const row = await repairAttempt(
    env.FILM_DB,
    comfyEngine(env),
    id,
    body.data.note ?? null
  )
  await startWorkflow(env, row.id)
  return Response.json(attemptView(row), { status: 201 })
}

/** Owner actions on one attempt. Each returns a response, or undefined to answer with the attempt. */
const actions: Record<
  string,
  (request: Request, env: Env, id: string) => Promise<Response | void>
> = {
  approve: (_request, env, id) => approveRoute(env, id),
  cancel: async (_request, env, id) => {
    await cancelAttempt(env.FILM_DB, id)
    await env.FILM_RENDER.get(id)
      .then((instance) => instance.terminate())
      .catch(() => {})
  },
  refresh: (_request, env, id) =>
    refreshAttempt(env.FILM_DB, comfyEngine(env), comfyReviewer(env), id),
  accept: async (_request, env, id) => {
    await decideAttempt(env.FILM_DB, id, 'accept')
  },
  reject: async (_request, env, id) => {
    await decideAttempt(env.FILM_DB, id, 'reject')
  },
  repair: repairRoute
}

type Route = {
  method: 'GET' | 'POST'
  pattern: RegExp
  handle: (
    request: Request,
    env: Env,
    match: RegExpExecArray
  ) => Promise<Response>
}

const attemptOrMissing = async (env: Env, id: string) => {
  const attempt = await getAttempt(env.FILM_DB, id)
  return attempt
    ? Response.json(attempt)
    : Response.json({ error: 'Attempt not found.' }, { status: 404 })
}

const routes: Route[] = [
  {
    method: 'POST',
    pattern: createPath,
    handle: (request, env, m) => quoteRoute(request, env, m[1], m[2])
  },
  {
    method: 'GET',
    pattern: listPath,
    handle: async (request, env, m) =>
      Response.json({
        scene: m[1],
        attempts: await listAttempts(
          env.FILM_DB,
          m[1],
          new URL(request.url).searchParams.get('shot') ?? undefined
        )
      })
  },
  {
    method: 'POST',
    pattern: cutsPath,
    handle: async (_request, env, m) =>
      Response.json(await createCut(env.FILM_DB, comfyEngine(env), m[1]), {
        status: 201
      })
  },
  {
    method: 'GET',
    pattern: cutsPath,
    handle: async (_request, env, m) =>
      Response.json({
        scene: m[1],
        cuts: await listCuts(env.FILM_DB, comfyEngine(env), m[1])
      })
  },
  {
    method: 'GET',
    pattern: attemptPath,
    handle: (_request, env, m) => attemptOrMissing(env, m[1])
  },
  {
    method: 'POST',
    pattern: actionPath,
    handle: async (request, env, m) =>
      (await actions[m[2]](request, env, m[1])) ?? attemptOrMissing(env, m[1])
  }
]

const findRoute = (method: string, path: string) => {
  for (const route of routes) {
    const match = route.method === method ? route.pattern.exec(path) : null
    if (match) return { route, match }
  }
  return null
}

/** Attempt routes. The Worker has already required the owner and, for writes, the same origin. */
export async function attemptRoute(request: Request, env: Env, path: string) {
  const found = findRoute(request.method, path)
  if (!found) return null
  try {
    return await found.route.handle(request, env, found.match)
  } catch (error) {
    if (error instanceof AttemptError)
      return Response.json({ error: error.message }, { status: error.status })
    throw error
  }
}
