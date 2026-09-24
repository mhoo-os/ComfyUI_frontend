import { build } from 'esbuild'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { beforeAll, describe, expect, it, onTestFinished } from 'vitest'

let script: string
beforeAll(async () => {
  const result = await build({
    entryPoints: ['cloudflare/testing/harness.ts'],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    external: ['cloudflare:workers'],
    target: 'es2022'
  })
  script = result.outputFiles[0].text
})
const requestId = '2bf4de45-6926-4b44-bd5a-62d6e72537b1'
const graph = {
  '1': { class_type: 'HiggsfieldSoul', inputs: { prompt: 'A mountain lake' } }
}
async function runtime(handler: (request: Request) => Promise<Response>) {
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script,
      compatibilityDate: '2026-09-24',
      compatibilityFlags: ['nodejs_compat'],
      kvNamespaces: ['COMFY_STATE'],
      durableObjects: {
        COMFY_JOBS: { className: 'TestJobs', useSQLite: true }
      },
      outboundService: handler
    })
  )
  onTestFinished(() => mf.dispose())
  await mf.ready
  return mf
}
async function queue(mf: Miniflare, prompt: unknown = graph) {
  const response = await mf.dispatchFetch('https://test/prompt', {
    method: 'POST',
    body: JSON.stringify({ prompt })
  })
  expect(response.status).toBe(200)
  return response.json() as Promise<{ prompt_id: string }>
}
async function tick(mf: Miniflare) {
  return mf.dispatchFetch('https://test/test/tick')
}
async function jobs(mf: Miniflare) {
  return (await mf.dispatchFetch('https://test/jobs')).json()
}

describe('Durable workflow lifecycle', () => {
  it('submits once, keeps polling and returns all completed media in history', async () => {
    let submissions = 0
    let polls = 0
    const mf = await runtime(async (request) => {
      if (request.method === 'POST') {
        submissions++
        return Response.json({ request_id: requestId, status: 'queued' })
      }
      polls++
      return Response.json({
        request_id: requestId,
        status: polls === 1 ? 'in_progress' : 'completed',
        images:
          polls === 1 ? null : [{ url: 'https://cdn.example.com/result.png' }],
        video: null
      })
    })
    await queue(mf)
    await tick(mf)
    expect(await jobs(mf)).toMatchObject({ jobs: [{ status: 'in_progress' }] })
    await tick(mf)
    expect(submissions).toBe(1)
    expect(await jobs(mf)).toMatchObject({
      jobs: [
        {
          status: 'completed',
          outputs_count: 1,
          outputs: { '1': { images: [{ type: 'output' }] } }
        }
      ]
    })
  })
  it('never resubmits after an ambiguous provider submission failure', async () => {
    let submissions = 0
    const mf = await runtime(async () => {
      submissions++
      return new Response('Unavailable', { status: 503 })
    })
    await queue(mf)
    await tick(mf)
    await tick(mf)
    expect(submissions).toBe(1)
    expect(await jobs(mf)).toMatchObject({ jobs: [{ status: 'failed' }] })
  })
  it('cancels only the targeted queued job using the native per-job route', async () => {
    let cancels = 0
    const mf = await runtime(async (request) => {
      if (new URL(request.url).pathname.endsWith('/cancel')) {
        cancels++
        return new Response(null, { status: 202 })
      }
      return Response.json({ request_id: requestId, status: 'queued' })
    })
    const job = await queue(mf)
    await tick(mf)
    await mf.dispatchFetch('https://test/jobs/unrelated/cancel', {
      method: 'POST'
    })
    await tick(mf)
    expect(cancels).toBe(0)
    await mf.dispatchFetch(`https://test/jobs/${job.prompt_id}/cancel`, {
      method: 'POST'
    })
    await tick(mf)
    expect(cancels).toBe(1)
    expect(await jobs(mf)).toMatchObject({ jobs: [{ status: 'cancelled' }] })
  })
  it('does not launch the next paid node after cancellation between nodes', async () => {
    let submissions = 0
    const mf = await runtime(async (request) => {
      if (request.method === 'POST') {
        submissions++
        return Response.json({ request_id: requestId, status: 'queued' })
      }
      return Response.json({
        request_id: requestId,
        status: 'completed',
        images: [{ url: 'https://cdn.example.com/image.png' }]
      })
    })
    const job = await queue(mf, {
      ...graph,
      '2': { class_type: 'HiggsfieldAnimate', inputs: { image_url: ['1', 0] } }
    })
    await tick(mf)
    await mf.dispatchFetch(`https://test/jobs/${job.prompt_id}/cancel`, {
      method: 'POST'
    })
    await tick(mf)
    expect(submissions).toBe(1)
    expect(await jobs(mf)).toMatchObject({
      jobs: [{ status: 'cancelled', outputs_count: 1 }]
    })
  })
  it('saves, lists relative paths, reloads and deletes workflow files', async () => {
    const mf = await runtime(async () => new Response(null, { status: 404 }))
    const workflow = { nodes: [], links: [], version: 0.4 }
    const file = 'https://test/userdata/workflows%2Fstarter.json'
    const saved = await mf.dispatchFetch(file + '?full_info=true', {
      method: 'POST',
      body: JSON.stringify(workflow)
    })
    expect(saved.status).toBe(200)
    const listed = await mf.dispatchFetch(
      'https://test/userdata?dir=workflows&full_info=true'
    )
    expect(await listed.json()).toMatchObject([{ path: 'starter.json' }])
    expect(await (await mf.dispatchFetch(file)).json()).toEqual(workflow)
    expect((await mf.dispatchFetch(file, { method: 'DELETE' })).status).toBe(
      204
    )
    expect((await mf.dispatchFetch(file)).status).toBe(404)
  })
})
