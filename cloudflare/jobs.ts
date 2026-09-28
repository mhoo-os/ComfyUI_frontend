import { ReferenceLibrary } from './references'
import { DurableObject } from 'cloudflare:workers'
import { z } from 'zod'

import { isFinishing, resolveFinishing, renderPlanSchema } from './finishing'
import type { EditValue } from './finishing'
import { renderVideo } from './rendering'
import { models, planGraph, resolveInputs } from './graph'
import type { Graph, Media } from './graph'
import { archiveMedia, readMedia } from './media'
import { talkingShotSchema } from './talkingShot'
import {
  provider,
  providerFailure,
  resultMedia,
  resultSchema
} from './provider'
import { boundedJson, json } from './http'

export { boundedJson, json }

const submissionSchema = z.object({
  prompt: z.unknown(),
  client_id: z.string().max(100).default(''),
  extra_data: z
    .object({ extra_pnginfo: z.object({ workflow: z.unknown() }).optional() })
    .optional()
})
/** How many jobs may run at once. A further submission is refused with queue_full. */
const maxActiveJobs = 4
/** How many paid nodes of one job may be at the provider at once. */
const maxNodesInFlight = 4

/** One paid node at the provider. `submitting` is set before the request is
 * sent, so finding it set later means the outcome is unknown. */
type NodeRun = { requestId?: string; submitting?: boolean; status?: string }
type Job = {
  id: string
  graph: Graph
  order: string[]
  workflow: unknown
  clientId: string
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled'
  created: number
  updated: number
  /** Completed node count, kept alongside `done` for older readers. */
  index: number
  done?: string[]
  running?: Record<string, NodeRun>
  /** When the alarm should next advance this job. */
  due?: number
  /** Set when a node failed: nothing new is submitted, running nodes are
   * followed to the end, then the job finishes with this error. */
  halted?: { status: 'failed' | 'cancelled'; error: string; node: string }
  outputs: Record<string, Media[]>
  edits?: Record<string, EditValue>
  rendering?: boolean
  runner?: 'workflow'
  workflowDelay?: number
  workflowStarts?: number
  plannedScenes?: Record<string, string>
  /** Single-node state written before concurrent jobs; read by `upgrade`. */
  requestId?: string
  submitting?: boolean
  providerRequests?: Record<string, string>
  cancelRequested?: boolean
  error?: string
  pollErrors?: number
  lastPollError?: string
  providerStatus?: string
}
type Active = Job & { done: string[]; running: Record<string, NodeRun> }

/** The node a single-node ledger job had at the provider, if any. */
function legacyRun(job: Job): Record<string, NodeRun> {
  const node = job.order.at(job.index)
  if (!node || !(job.requestId || job.submitting)) return {}
  return {
    [node]: {
      requestId: job.requestId,
      submitting: job.submitting,
      status: job.providerStatus
    }
  }
}

/** Moves a job saved by the single-node ledger onto per-node state. */
function upgrade(job: Job): Active {
  if (job.done && job.running)
    return { ...job, done: job.done, running: job.running }
  return {
    ...job,
    done: job.order.slice(0, job.index),
    running: legacyRun(job),
    requestId: undefined,
    submitting: undefined
  }
}

const links = (job: Job, id: string) =>
  Object.values(job.graph[id].inputs).flatMap((value) =>
    Array.isArray(value) ? [value[0]] : []
  )

/** Nodes whose inputs are all done and which have not started. */
function readyNodes(job: Active) {
  return job.order.filter(
    (id) =>
      !job.done.includes(id) &&
      !Object.hasOwn(job.running, id) &&
      links(job, id).every((link) => job.done.includes(link))
  )
}

/** The node an error or progress report refers to. */
function currentNode(job: Job) {
  if (job.halted) return job.halted.node
  const { done, running } = upgrade(job)
  const pending = job.order.filter((id) => !done.includes(id))
  return [...Object.keys(running), ...pending].at(0) ?? ''
}
function outputFor(job: Job, node: string) {
  const media = job.outputs[node] ?? []
  return {
    images: media.flatMap((item, i) =>
      item.kind === 'image'
        ? [
            {
              filename: `${job.id}/${node}/${i}.png`,
              type: 'output',
              subfolder: ''
            }
          ]
        : []
    ),
    video: media.flatMap((item, i) =>
      item.kind === 'video'
        ? [
            {
              filename: `${job.id}/${node}/${i}.mp4`,
              type: 'output',
              subfolder: ''
            }
          ]
        : []
    ),
    text: media.map((item) => item.url)
  }
}
function jobDetail(job: Job) {
  const first = Object.entries(job.outputs).find(([, media]) => media.length)
  const outputs = Object.fromEntries(
    Object.keys(job.outputs).map((node) => [node, outputFor(job, node)])
  )
  const count = Object.values(job.outputs).reduce(
    (total, media) => total + media.length,
    0
  )
  const running = Object.values(job.running ?? {})
  return {
    id: job.id,
    runner: job.runner ?? 'durable-object',
    provider_request_id:
      running.find((run) => run.requestId)?.requestId ?? job.requestId,
    provider_requests: job.providerRequests ?? {},
    last_poll_error: job.lastPollError,
    provider_status: job.providerStatus,
    current_step: Math.min(job.index + 1, job.order.length),
    total_steps: job.order.length,
    update_time: job.updated,
    status: job.status,
    create_time: job.created,
    execution_start_time: job.created,
    execution_end_time: ['completed', 'failed', 'cancelled'].includes(
      job.status
    )
      ? job.updated
      : null,
    outputs_count: count,
    previewable_outputs_count: count,
    preview_output: first
      ? {
          filename: `${job.id}/${first[0]}/0${first[1][0].kind === 'video' ? '.mp4' : '.png'}`,
          subfolder: '',
          type: 'output',
          nodeId: first[0],
          mediaType: first[1][0].kind === 'image' ? 'images' : 'video'
        }
      : null,
    workflow: { extra_data: { extra_pnginfo: { workflow: job.workflow } } },
    outputs,
    ...(job.error && {
      execution_error: {
        node_id: currentNode(job),
        node_type: 'Higgsfield',
        exception_message: job.error,
        exception_type: 'HiggsfieldError',
        traceback: [],
        current_inputs: null,
        current_outputs: null
      }
    })
  }
}

// The job tests drive this class through Miniflare (jobs.test.ts), which
// static analysis can't follow, so its complexity is judged as untested.
export class ComfyJobs extends DurableObject<Env> {
  private broadcast(type: string, data: unknown) {
    for (const socket of this.ctx.getWebSockets()) {
      try {
        socket.send(JSON.stringify({ type, data }))
      } catch {
        socket.close(1011, 'Reconnect')
      }
    }
  }
  /** Active job ids. Older ledgers stored a single id. */
  private async active() {
    const value = await this.ctx.storage.get<string | string[]>('active')
    if (typeof value === 'string') return [value]
    return Array.isArray(value) ? value : []
  }
  private async setActive(ids: string[]) {
    if (ids.length) await this.ctx.storage.put('active', ids)
    else await this.ctx.storage.delete('active')
  }
  private async activeJobs() {
    const ids = await this.active()
    const jobs = await this.ctx.storage.get<Job>(ids.map((id) => `job:${id}`))
    return [...jobs.values()]
  }
  /** Sets the alarm for the earliest due job, or clears it. */
  private async arm() {
    const due = (await this.activeJobs()).flatMap((job) =>
      job.due === undefined ? [] : [job.due]
    )
    if (due.length) await this.ctx.storage.setAlarm(Math.min(...due))
    else await this.ctx.storage.deleteAlarm()
  }
  private async status() {
    return { exec_info: { queue_remaining: (await this.active()).length } }
  }
  private async save(job: Job) {
    await this.ctx.blockConcurrencyWhile(async () => {
      const saved = await this.ctx.storage.get<Job>(`job:${job.id}`)
      if (saved?.cancelRequested) job.cancelRequested = true
      job.updated = Date.now()
      await this.ctx.storage.put(`job:${job.id}`, job)
    })
  }
  private async finish(job: Job, status: Job['status'], error?: string) {
    const finished = await this.ctx.blockConcurrencyWhile(async () => {
      const ids = await this.active()
      if (!ids.includes(job.id)) return false
      job.status = status
      job.error = error
      job.due = undefined
      job.updated = Date.now()
      await this.ctx.storage.put(`job:${job.id}`, job)
      await this.setActive(ids.filter((id) => id !== job.id))
      return true
    })
    if (!finished) return
    await this.arm()
    if (status === 'completed')
      this.broadcast('execution_success', {
        prompt_id: job.id,
        timestamp: Date.now()
      })
    else
      this.broadcast('execution_error', {
        prompt_id: job.id,
        node_id: currentNode(job),
        node_type: 'Higgsfield',
        exception_message: error ?? 'Generation cancelled.',
        exception_type: 'HiggsfieldError',
        traceback: [],
        executed: Object.keys(job.outputs),
        timestamp: Date.now()
      })
    this.broadcast('executing', { node: null, prompt_id: job.id })
    this.broadcast('status', { status: await this.status() })
  }
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const path = url.pathname
    try {
      if (path === '/character-assets' || path.startsWith('/character-assets/'))
        return await new ReferenceLibrary(this.ctx.storage, this.env).handle(
          request
        )
      if (
        path === '/ws' &&
        request.headers.get('Upgrade')?.toLowerCase() === 'websocket'
      ) {
        if (this.ctx.getWebSockets().length >= 10)
          return json({ error: 'Too many tabs.' }, 429)
        const pair = new WebSocketPair()
        this.ctx.acceptWebSocket(pair[1])
        pair[1].send(
          JSON.stringify({
            type: 'status',
            data: {
              sid: url.searchParams.get('clientId') || crypto.randomUUID(),
              status: await this.status()
            }
          })
        )
        pair[1].send(JSON.stringify({ type: 'feature_flags', data: {} }))
        return new Response(null, { status: 101, webSocket: pair[0] })
      }
      if (path === '/prompt' && request.method === 'GET')
        return json(await this.status())
      if (path === '/prompt' && request.method === 'POST') {
        const body = submissionSchema.parse(await boundedJson(request))
        const { graph, order } = planGraph(body.prompt)
        for (const node of Object.values(graph)) {
          for (const value of Object.values(node.inputs)) {
            if (typeof value === 'string' && value.startsWith('mhoo-asset:'))
              await new ReferenceLibrary(this.ctx.storage, this.env).resolve(
                { image_url: value },
                true
              )
          }
        }
        return await this.ctx.blockConcurrencyWhile(async () => {
          const ids = await this.active()
          if (ids.length >= maxActiveJobs)
            return json(
              {
                error: {
                  type: 'queue_full',
                  message: `${maxActiveJobs} workflows are already running. Wait for one to finish.`,
                  details: ''
                }
              },
              409
            )
          const id = crypto.randomUUID()
          const job: Job = {
            id,
            graph,
            order,
            workflow: body.extra_data?.extra_pnginfo?.workflow,
            clientId: body.client_id,
            status: 'pending',
            created: Date.now(),
            updated: Date.now(),
            index: 0,
            done: [],
            running: {},
            due: Date.now() + 1000,
            outputs: {},
            ...(order.some(
              (node) => graph[node].class_type === 'HiggsfieldTalkingShot'
            ) && { runner: 'workflow' as const })
          }
          await this.save(job)
          await this.setActive([...ids, id])
          await this.arm()
          this.broadcast('status', { status: await this.status() })
          return json({ prompt_id: id, number: job.created, node_errors: {} })
        })
      }
      if (path === '/higgsfield/estimate' && request.method === 'POST') {
        const { prompt } = submissionSchema.parse(await boundedJson(request))
        const { graph, order } = planGraph(prompt)
        if (order.length !== 1)
          return json({ error: 'Estimate one node at a time.' }, 400)
        const node = graph[order[0]]
        if (isFinishing(node.class_type))
          return json({
            type: 'description',
            pricing_description:
              'Uses Cloudflare rendering compute, not Higgsfield credits.'
          })
        return json(
          await provider(
            this.env,
            `estimate/${models[node.class_type].endpoint}`,
            await new ReferenceLibrary(this.ctx.storage, this.env).resolve(
              resolveInputs(node, {}),
              true,
              Object.hasOwn(models[node.class_type].schema.properties, 'prompt')
                ? (models[node.class_type].schema.properties.prompt.maxLength ??
                    8000)
                : 8000
            )
          )
        )
      }
      if (path === '/jobs' && request.method === 'GET') {
        const jobs = [
          ...(await this.ctx.storage.list<Job>({ prefix: 'job:' })).values()
        ]
        const statuses = url.searchParams.get('status')?.split(',')
        const filtered = jobs
          .filter((job) => !statuses || statuses.includes(job.status))
          .sort((a, b) => b.created - a.created)
        const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0)
        const limit = Math.min(
          200,
          Math.max(1, Number(url.searchParams.get('limit')) || 50)
        )
        return json({
          jobs: filtered.slice(offset, offset + limit).map(jobDetail),
          pagination: {
            offset,
            limit,
            total: filtered.length,
            has_more: offset + limit < filtered.length
          }
        })
      }
      if (/^\/jobs\/[^/]+$/.test(path) && request.method === 'GET') {
        const job = await this.ctx.storage.get<Job>(`job:${path.split('/')[2]}`)
        return job
          ? json(jobDetail(job))
          : json({ error: 'Job not found' }, 404)
      }
      if (/^\/jobs\/[^/]+\/assets$/.test(path)) {
        const id = path.split('/')[2]
        const job = await this.ctx.storage.get<Job>(`job:${id}`)
        if (!job) return json({ error: 'Job not found' }, 404)
        return json({
          job_id: id,
          assets: Object.entries(job.outputs).flatMap(([node, media]) =>
            media.map((item, i) => ({
              id: `${id}/${node}/${i}`,
              name: `${isFinishing(job.graph[node].class_type) ? 'Finished video' : models[job.graph[node].class_type].title} ${i + 1}`,
              preview_url: item.storageKey
                ? `/00/comfy/api/view?filename=${id}/${node}/${i}`
                : item.url,
              mime_type: item.kind === 'image' ? 'image/jpeg' : 'video/mp4',
              node_id: node,
              output_key: item.kind === 'image' ? 'images' : 'video',
              output_index: i
            }))
          )
        })
      }
      if (path === '/view') {
        const [id, node, index] = (
          url.searchParams.get('filename') ?? ''
        ).split('/')
        const job = await this.ctx.storage.get<Job>(`job:${id}`)
        const media = job?.outputs[node]?.[parseInt(index, 10)]
        if (!media) return json({ error: 'Media not found' }, 404)
        return media.storageKey
          ? readMedia(this.env, media.storageKey, request)
          : Response.redirect(media.url, 302)
      }
      if (
        path === '/interrupt' ||
        path === '/jobs/cancel' ||
        /^\/jobs\/[^/]+\/cancel$/.test(path)
      ) {
        if (request.method !== 'POST')
          return json({ error: 'Method not allowed' }, 405)
        const body = request.body
          ? z
              .object({
                job_ids: z.array(z.string()).optional(),
                prompt_id: z.string().optional()
              })
              .parse(await boundedJson(request))
          : {}
        const target = /^\/jobs\/[^/]+\/cancel$/.test(path)
          ? path.split('/')[2]
          : body.prompt_id
        const requested = await this.ctx.blockConcurrencyWhile(async () => {
          const jobs = (await this.activeJobs()).filter(
            (job) =>
              (!target || target === job.id) &&
              (!body.job_ids || body.job_ids.includes(job.id))
          )
          for (const job of jobs) {
            job.cancelRequested = true
            if (job.runner !== 'workflow')
              job.due = Math.min(job.due ?? Infinity, Date.now() + 1000)
            await this.ctx.storage.put(`job:${job.id}`, job)
          }
          return jobs.length
        })
        if (!requested) return json({})
        await this.arm()
        return json({ cancel_requested: true })
      }
      if (path === '/queue')
        return json({ queue_running: [], queue_pending: [] })
      if (path === '/history') return json({})
      return json({ error: 'Not found' }, 404)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Request failed'
      return json(
        {
          error: { type: 'higgsfield_error', message, details: '' },
          node_errors: {}
        },
        400
      )
    }
  }
  webSocketMessage() {}
  webSocketClose(socket: WebSocket) {
    socket.close()
  }
  private workflowInFlight = new Map<
    string,
    Promise<{ done: boolean; status: string; delay: number }>
  >()

  private async schedule(job: Job, delay: number) {
    if (job.runner === 'workflow') {
      job.workflowDelay = delay
      await this.save(job)
      return
    }
    job.due = Date.now() + delay
    await this.save(job)
    await this.arm()
  }

  async workflowPlans(id: string) {
    const job = await this.ctx.storage.get<Job>(`job:${id}`)
    if (!job || job.runner !== 'workflow')
      throw new Error('Workflow job not found.')
    return job.order.flatMap((nodeId) => {
      const node = job.graph[nodeId]
      if (
        node.class_type !== 'HiggsfieldTalkingShot' ||
        node.inputs.planner !== 'jev_astra'
      )
        return []
      return [{ nodeId, shot: talkingShotSchema.parse(node.inputs) }]
    })
  }

  async applyWorkflowScene(id: string, nodeId: string, scene: string) {
    await this.ctx.blockConcurrencyWhile(async () => {
      const job = await this.ctx.storage.get<Job>(`job:${id}`)
      if (
        !job ||
        job.runner !== 'workflow' ||
        job.cancelRequested ||
        job.status !== 'pending'
      )
        throw new Error('The production job is no longer waiting for a plan.')
      const node = job.graph[nodeId]
      if (
        !Object.hasOwn(job.graph, nodeId) ||
        node.class_type !== 'HiggsfieldTalkingShot'
      )
        throw new Error('Talking-shot node not found.')
      const shot = talkingShotSchema.parse({ ...node.inputs, scene })
      job.plannedScenes = { ...job.plannedScenes, [nodeId]: shot.scene }
      await this.ctx.storage.put(`job:${id}`, job)
    })
  }

  async workflowFailed(id: string, error: string) {
    const job = await this.ctx.storage.get<Job>(`job:${id}`)
    if (
      job?.runner === 'workflow' &&
      ['pending', 'in_progress'].includes(job.status)
    )
      await this.finish(job, 'failed', error)
  }

  async workflowTick(id: string) {
    const inFlight = this.workflowInFlight.get(id)
    if (inFlight) return inFlight
    const run = async () => {
      const job = await this.ctx.storage.get<Job>(`job:${id}`)
      if (!job || job.runner !== 'workflow')
        throw new Error('Workflow job not found.')
      if (
        ['pending', 'in_progress'].includes(job.status) &&
        (await this.active()).includes(id)
      )
        await this.advance(job)
      const current = await this.ctx.storage.get<Job>(`job:${id}`)
      return {
        done: !current || !['pending', 'in_progress'].includes(current.status),
        status: current?.status ?? 'failed',
        delay: current?.workflowDelay ?? 5000
      }
    }
    const promise = run()
    this.workflowInFlight.set(id, promise)
    try {
      return await promise
    } finally {
      this.workflowInFlight.delete(id)
    }
  }

  // Called by the Durable Objects runtime when the alarm fires, not from our code.
  // fallow-ignore-next-line unused-class-member
  async alarm() {
    await this.runDue(Date.now())
  }

  /** Advances every active job due by `now`. One job's failure never stops
   * the others; each keeps a fallback wake-up in case its run dies. */
  protected async runDue(now: number) {
    // A job saved by the single-slot ledger has no due time: wake it now.
    const due = (await this.activeJobs()).filter(
      (job) => (job.due ?? (job.done ? Infinity : 0)) <= now
    )
    await Promise.allSettled(due.map((job) => this.wake(job)))
    await this.arm()
  }

  private async wake(job: Job) {
    job.due = Date.now() + 60_000
    await this.save(job)
    if (job.runner === 'workflow') return this.startWorkflow(job)
    return this.advance(job)
  }

  /** Starts (or checks) the durable workflow that drives a talking-shot job. */
  // fallow-ignore-next-line complexity
  private async startWorkflow(job: Job) {
    job.due = undefined
    await this.save(job)
    try {
      try {
        const instance = await this.env.COMFY_PRODUCTION.get(job.id)
        const status = await instance.status()
        if (['errored', 'terminated', 'complete'].includes(status.status))
          await this.workflowFailed(
            job.id,
            'Workflow stopped before the job was finalized. Check provider history before rerunning.'
          )
        return
      } catch {
        await this.env.COMFY_PRODUCTION.create({
          id: job.id,
          params: { jobId: job.id, owner: 'owner' }
        })
      }
    } catch {
      const current = await this.ctx.storage.get<Job>(`job:${job.id}`)
      if (
        !current ||
        current.status !== 'pending' ||
        current.submitting ||
        current.requestId ||
        Object.keys(current.running ?? {}).length
      )
        return
      job.workflowStarts = (current.workflowStarts ?? 0) + 1
      if (job.workflowStarts >= 12)
        await this.workflowFailed(
          job.id,
          'Could not start the durable workflow. Check workflow and provider history before rerunning.'
        )
      else {
        job.due = Date.now() + 5000
        await this.save(job)
      }
    }
  }

  // fallow-ignore-next-line complexity
  private async advance(stored: Job) {
    const job = upgrade(stored)
    const stop = stopReason(job)
    if (stop) return this.finish(job, 'failed', stop)
    haltUnknownSubmissions(job)
    if (job.halted && !Object.keys(job.running).length)
      return this.finish(job, job.halted.status, job.halted.error)
    if (job.cancelRequested) return this.cancel(job)
    const ready = job.halted ? [] : readyNodes(job)
    const finishing = ready.find((id) => isFinishing(job.graph[id].class_type))
    try {
      if (finishing) await this.runFinishing(job, finishing)
      else await this.submitReady(job, ready)
    } catch (error) {
      return this.finish(
        job,
        'failed',
        error instanceof Error
          ? error.message
          : 'Higgsfield request failed. Check provider history before rerunning.'
      )
    }
    if (!(await this.pollRunning(job))) return
    await this.settle(job, finishing || readyNodes(job).length ? 100 : 5000)
  }

  /** Finishes the job once nothing is left to follow, else schedules the next tick. */
  private async settle(job: Active, delay: number) {
    if (job.done.length >= job.order.length)
      return this.finish(job, 'completed')
    if (job.halted && !Object.keys(job.running).length)
      return this.finish(job, job.halted.status, job.halted.error)
    await this.schedule(job, delay)
  }

  private async cancel(job: Active) {
    for (const run of Object.values(job.running)) {
      if (!run.requestId) continue
      try {
        await provider(this.env, `requests/${run.requestId}/cancel`, {})
      } catch {
        job.cancelRequested = false
        await this.ctx.storage.put(`job:${job.id}`, job)
        this.broadcast('notification', {
          value:
            'Higgsfield could not cancel this request. It may already be processing; tracking continues.'
        })
        await this.schedule(job, 5000)
        return
      }
    }
    await this.finish(
      job,
      'cancelled',
      'Workflow cancelled. Completed nodes remain in history.'
    )
  }

  private started(job: Active) {
    if (job.done.length || Object.keys(job.running).length) return
    this.broadcast('execution_start', {
      prompt_id: job.id,
      timestamp: Date.now()
    })
  }

  private complete(job: Active, nodeId: string) {
    delete job.running[nodeId]
    job.done = [...job.done, nodeId]
    job.index = job.done.length
    this.broadcast('executed', {
      node: nodeId,
      display_node: nodeId,
      prompt_id: job.id,
      output: outputFor(job, nodeId)
    })
  }

  private async runFinishing(job: Active, nodeId: string) {
    const node = job.graph[nodeId]
    this.started(job)
    job.status = 'in_progress'
    job.providerStatus =
      node.class_type === 'MhooExport' ? 'rendering' : 'preparing edit'
    this.broadcast('executing', { node: nodeId, prompt_id: job.id })
    const value = resolveFinishing(node, job.edits ?? {}, job.outputs)
    if (node.class_type === 'MhooExport') {
      job.rendering = true
      await this.save(job)
      job.outputs[nodeId] = [
        await renderVideo(
          this.env,
          renderPlanSchema.parse(value),
          `outputs/${job.id}/${nodeId}/0`
        )
      ]
      job.rendering = false
    } else {
      job.edits = { ...job.edits, [nodeId]: value }
    }
    this.complete(job, nodeId)
    job.providerStatus = undefined
    await this.save(job)
  }

  /** Submits ready paid nodes, each exactly once, up to the in-flight limit. */
  private async submitReady(job: Active, ready: string[]) {
    const room = maxNodesInFlight - Object.keys(job.running).length
    for (const nodeId of ready.slice(0, Math.max(0, room))) {
      if (job.halted || job.cancelRequested) return
      await this.submitNode(job, nodeId)
    }
  }

  // fallow-ignore-next-line complexity
  private async submitNode(job: Active, nodeId: string) {
    const original = job.graph[nodeId]
    const node = job.plannedScenes?.[nodeId]
      ? {
          ...original,
          inputs: { ...original.inputs, scene: job.plannedScenes[nodeId] }
        }
      : original
    if (
      node.class_type === 'HiggsfieldTalkingShot' &&
      node.inputs.planner === 'jev_astra' &&
      !job.plannedScenes?.[nodeId]
    )
      throw new Error('The creative plan is missing; no video was submitted.')
    this.started(job)
    job.status = 'in_progress'
    job.running[nodeId] = { submitting: true }
    await this.save(job)
    this.broadcast('executing', { node: nodeId, prompt_id: job.id })
    const maxLength = Object.hasOwn(
      models[node.class_type].schema.properties,
      'prompt'
    )
      ? (models[node.class_type].schema.properties.prompt.maxLength ?? 8000)
      : 8000
    try {
      const result = await new ReferenceLibrary(
        this.ctx.storage,
        this.env
      ).submit(resolveInputs(node, job.outputs), maxLength, async (input) =>
        resultSchema.parse(
          await provider(this.env, models[node.class_type].endpoint, input)
        )
      )
      job.running[nodeId] = { requestId: result.request_id }
      job.providerRequests = {
        ...job.providerRequests,
        [nodeId]: result.request_id
      }
    } catch (error) {
      // The request may have reached the provider: never resubmit it.
      delete job.running[nodeId]
      job.halted = {
        status: 'failed',
        error:
          error instanceof Error
            ? error.message
            : 'Higgsfield request failed. Check provider history before rerunning.',
        node: nodeId
      }
    }
    await this.save(job)
  }

  /** Polls every submitted node. Returns false when the job already ended or
   * a status read failed (the next tick is then already scheduled). */
  // fallow-ignore-next-line complexity
  private async pollRunning(job: Active) {
    let failure: unknown
    for (const [nodeId, run] of Object.entries(job.running)) {
      if (!run.requestId) continue
      try {
        await this.pollNode(job, nodeId, run.requestId)
      } catch (error) {
        failure = error
      }
    }
    if (failure === undefined) {
      job.pollErrors = 0
      job.lastPollError = undefined
      return true
    }
    job.pollErrors = (job.pollErrors ?? 0) + 1
    job.lastPollError =
      failure instanceof Error ? failure.message : 'Provider status unavailable'
    if (job.pollErrors < 12) {
      await this.schedule(job, 15000)
      return false
    }
    await this.finish(job, 'failed', job.lastPollError)
    return false
  }

  // fallow-ignore-next-line complexity
  private async pollNode(job: Active, nodeId: string, requestId: string) {
    const result = resultSchema.parse(
      await provider(this.env, `requests/${requestId}/status`)
    )
    job.running[nodeId] = { ...job.running[nodeId], status: result.status }
    job.providerStatus = result.status
    await this.save(job)
    if (['failed', 'nsfw', 'canceled'].includes(result.status)) {
      delete job.running[nodeId]
      job.halted ??= {
        status: result.status === 'canceled' ? 'cancelled' : 'failed',
        error: providerFailure(result),
        node: nodeId
      }
      await this.save(job)
      return
    }
    if (result.status !== 'completed') return
    const media = resultMedia(result)
    if (!media.length)
      throw new Error('Higgsfield completed without supported media outputs.')
    job.outputs[nodeId] = media
    await this.save(job)
    job.outputs[nodeId] = await Promise.all(
      media.map((item, index) =>
        archiveMedia(this.env, item, `outputs/${job.id}/${nodeId}/${index}`)
      )
    )
    this.complete(job, nodeId)
    job.providerStatus = undefined
    await this.save(job)
  }
}

function stopReason(job: Job) {
  if (job.rendering)
    return 'Render was interrupted. Completed generation outputs remain in history; rerun a finishing-only workflow to avoid generating again.'
  if (Date.now() - job.created > 60 * 60 * 1000)
    return 'Polling stopped after one hour. The provider may still be running; check Higgsfield before rerunning.'
  return null
}

/** A node still marked as submitting was cut off mid-request: its outcome is
 * unknown, so it is never resubmitted and the job ends once the rest settle. */
function haltUnknownSubmissions(job: Active) {
  for (const [nodeId, run] of Object.entries(job.running)) {
    if (!run.submitting) continue
    delete job.running[nodeId]
    job.halted ??= {
      status: 'failed',
      error:
        'Submission outcome is unknown. Check Higgsfield request history before rerunning; no automatic retry was made.',
      node: nodeId
    }
  }
}
