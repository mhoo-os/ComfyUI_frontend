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
type Job = {
  id: string
  graph: Graph
  order: string[]
  workflow: unknown
  clientId: string
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled'
  created: number
  updated: number
  index: number
  outputs: Record<string, Media[]>
  edits?: Record<string, EditValue>
  rendering?: boolean
  runner?: 'workflow'
  workflowDelay?: number
  workflowStarts?: number
  plannedScenes?: Record<string, string>
  requestId?: string
  providerRequests?: Record<string, string>
  submitting?: boolean
  cancelRequested?: boolean
  error?: string
  pollErrors?: number
  lastPollError?: string
  providerStatus?: string
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
  return {
    id: job.id,
    runner: job.runner ?? 'durable-object',
    provider_request_id: job.requestId,
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
        node_id: job.order[job.index] ?? '',
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
  private async status() {
    const active = await this.ctx.storage.get<string>('active')
    return { exec_info: { queue_remaining: active ? 1 : 0 } }
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
      if ((await this.ctx.storage.get<string>('active')) !== job.id)
        return false
      job.status = status
      job.error = error
      job.updated = Date.now()
      await this.ctx.storage.put(`job:${job.id}`, job)
      await this.ctx.storage.delete('active')
      await this.ctx.storage.deleteAlarm()
      return true
    })
    if (!finished) return
    if (status === 'completed')
      this.broadcast('execution_success', {
        prompt_id: job.id,
        timestamp: Date.now()
      })
    else
      this.broadcast('execution_error', {
        prompt_id: job.id,
        node_id: job.order[job.index],
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
          if (await this.ctx.storage.get('active'))
            return json(
              {
                error: {
                  type: 'queue_full',
                  message:
                    'A workflow is already running. Wait for it to finish.',
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
            outputs: {},
            ...(order.some(
              (node) => graph[node].class_type === 'HiggsfieldTalkingShot'
            ) && { runner: 'workflow' as const })
          }
          await this.save(job)
          await this.ctx.storage.put('active', id)
          await this.ctx.storage.setAlarm(Date.now() + 1000)
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
        return this.ctx.blockConcurrencyWhile(async () => {
          const id = await this.ctx.storage.get<string>('active')
          const job = id
            ? await this.ctx.storage.get<Job>(`job:${id}`)
            : undefined
          if (!job) return json({})
          const target = /^\/jobs\/[^/]+\/cancel$/.test(path)
            ? path.split('/')[2]
            : body.prompt_id
          if (
            (target && target !== id) ||
            (body.job_ids && !body.job_ids.includes(job.id))
          )
            return json({})
          job.cancelRequested = true
          await this.ctx.storage.put(`job:${job.id}`, job)
          if (job.runner !== 'workflow' && !(await this.ctx.storage.getAlarm()))
            await this.ctx.storage.setAlarm(Date.now() + 1000)
          return json({ cancel_requested: true })
        })
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
  private workflowInFlight?: {
    id: string
    promise: Promise<{ done: boolean; status: string; delay: number }>
  }

  private async schedule(job: Job, delay: number) {
    if (job.runner === 'workflow') {
      job.workflowDelay = delay
      await this.save(job)
    } else await this.ctx.storage.setAlarm(Date.now() + delay)
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
    if (this.workflowInFlight) {
      if (this.workflowInFlight.id !== id)
        throw new Error('Another workflow step is completing.')
      return this.workflowInFlight.promise
    }
    const run = async () => {
      const job = await this.ctx.storage.get<Job>(`job:${id}`)
      if (!job || job.runner !== 'workflow')
        throw new Error('Workflow job not found.')
      if (
        ['pending', 'in_progress'].includes(job.status) &&
        (await this.ctx.storage.get<string>('active')) === id
      )
        await this.advance(job)
      const current = await this.ctx.storage.get<Job>(`job:${id}`)
      return {
        done: !current || !['pending', 'in_progress'].includes(current.status),
        status: current?.status ?? 'failed',
        delay: current?.workflowDelay ?? 5000
      }
    }
    this.workflowInFlight = { id, promise: run() }
    try {
      return await this.workflowInFlight.promise
    } finally {
      this.workflowInFlight = undefined
    }
  }

  async alarm() {
    const id = await this.ctx.storage.get<string>('active')
    const job = id ? await this.ctx.storage.get<Job>(`job:${id}`) : undefined
    if (!job) return
    if (job.runner !== 'workflow') return this.advance(job)
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
        current.requestId
      )
        return
      job.workflowStarts = (current.workflowStarts ?? 0) + 1
      if (job.workflowStarts >= 12)
        await this.workflowFailed(
          job.id,
          'Could not start the durable workflow. Check workflow and provider history before rerunning.'
        )
      else {
        await this.save(job)
        await this.ctx.storage.setAlarm(Date.now() + 5000)
      }
    }
  }

  private async advance(job: Job) {
    if (job.rendering) {
      await this.finish(
        job,
        'failed',
        'Render was interrupted. Completed generation outputs remain in history; rerun a finishing-only workflow to avoid generating again.'
      )
      return
    }
    if (job.submitting) {
      await this.finish(
        job,
        'failed',
        'Submission outcome is unknown. Check Higgsfield request history before rerunning; no automatic retry was made.'
      )
      return
    }
    if (Date.now() - job.created > 60 * 60 * 1000) {
      await this.finish(
        job,
        'failed',
        'Polling stopped after one hour. The provider may still be running; check Higgsfield before rerunning.'
      )
      return
    }
    if (job.cancelRequested) {
      if (job.requestId) {
        try {
          await provider(this.env, `requests/${job.requestId}/cancel`, {})
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
      return
    }
    const nodeId = job.order[job.index]
    const originalNode = job.graph[nodeId]
    const node = job.plannedScenes?.[nodeId]
      ? {
          ...originalNode,
          inputs: { ...originalNode.inputs, scene: job.plannedScenes[nodeId] }
        }
      : originalNode
    try {
      if (
        node.class_type === 'HiggsfieldTalkingShot' &&
        node.inputs.planner === 'jev_astra' &&
        !job.plannedScenes?.[nodeId]
      )
        throw new Error('The creative plan is missing; no video was submitted.')
      if (isFinishing(node.class_type)) {
        if (job.index === 0)
          this.broadcast('execution_start', {
            prompt_id: job.id,
            timestamp: Date.now()
          })
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
        this.broadcast('executed', {
          node: nodeId,
          display_node: nodeId,
          prompt_id: job.id,
          output: outputFor(job, nodeId)
        })
        job.index++
        job.providerStatus = undefined
        await this.save(job)
        const current = await this.ctx.storage.get<Job>(`job:${job.id}`)
        if (current?.cancelRequested)
          await this.finish(
            job,
            'cancelled',
            'Workflow cancelled. Completed outputs remain in history.'
          )
        else if (job.index >= job.order.length)
          await this.finish(job, 'completed')
        else await this.schedule(job, 100)
        return
      }
      if (!job.requestId) {
        if (job.index === 0)
          this.broadcast('execution_start', {
            prompt_id: job.id,
            timestamp: Date.now()
          })
        job.status = 'in_progress'
        job.submitting = true
        await this.save(job)
        this.broadcast('executing', { node: nodeId, prompt_id: job.id })
        const result = await new ReferenceLibrary(
          this.ctx.storage,
          this.env
        ).submit(
          resolveInputs(node, job.outputs),
          Object.hasOwn(models[node.class_type].schema.properties, 'prompt')
            ? (models[node.class_type].schema.properties.prompt.maxLength ??
                8000)
            : 8000,
          async (input) =>
            resultSchema.parse(
              await provider(this.env, models[node.class_type].endpoint, input)
            )
        )
        job.requestId = result.request_id
        job.providerRequests = {
          ...job.providerRequests,
          [nodeId]: result.request_id
        }
        job.submitting = false
        await this.save(job)
      }
      const result = resultSchema.parse(
        await provider(this.env, `requests/${job.requestId}/status`)
      )
      job.providerStatus = result.status
      await this.save(job)
      if (['failed', 'nsfw', 'canceled'].includes(result.status)) {
        await this.finish(
          job,
          result.status === 'canceled' ? 'cancelled' : 'failed',
          providerFailure(result)
        )
        return
      }
      if (result.status === 'completed') {
        const media = resultMedia(result)
        if (!media.length)
          throw new Error(
            'Higgsfield completed without supported media outputs.'
          )
        job.outputs[nodeId] = media
        await this.save(job)
        job.outputs[nodeId] = await Promise.all(
          media.map((item, index) =>
            archiveMedia(this.env, item, `outputs/${job.id}/${nodeId}/${index}`)
          )
        )
        job.requestId = undefined
        job.providerStatus = undefined
        job.pollErrors = 0
        job.lastPollError = undefined
        this.broadcast('executed', {
          node: nodeId,
          display_node: nodeId,
          prompt_id: job.id,
          output: outputFor(job, nodeId)
        })
        job.index++
        await this.save(job)
        if (job.index >= job.order.length) {
          await this.finish(job, 'completed')
          return
        }
      }
      job.pollErrors = 0
      job.lastPollError = undefined
      await this.save(job)
      await this.schedule(job, 5000)
    } catch (error) {
      job.pollErrors = (job.pollErrors ?? 0) + 1
      job.lastPollError =
        error instanceof Error ? error.message : 'Provider status unavailable'
      if (job.requestId && job.pollErrors < 12) {
        await this.save(job)
        await this.schedule(job, 15000)
        return
      }
      await this.finish(
        job,
        'failed',
        error instanceof Error
          ? error.message
          : 'Higgsfield request failed. Check provider history before rerunning.'
      )
    }
  }
}
