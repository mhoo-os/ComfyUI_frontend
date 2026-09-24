import { build } from 'esbuild'
import type { Request as MiniflareRequest } from 'miniflare'
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
async function runtime(
  handler: (request: MiniflareRequest) => Promise<Response>,
  mediaHandler?: (request: MiniflareRequest) => Promise<Response>
) {
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script,
      compatibilityDate: '2026-09-24',
      compatibilityFlags: ['nodejs_compat'],
      kvNamespaces: ['COMFY_STATE'],
      r2Buckets: ['COMFY_MEDIA'],
      durableObjects: {
        COMFY_JOBS: { className: 'TestJobs', useSQLite: true }
      },
      outboundService: async (request) =>
        new URL(request.url).hostname === 'cdn.example.com'
          ? mediaHandler
            ? mediaHandler(request)
            : new Response('image-bytes', {
                headers: { 'content-type': 'image/png', 'content-length': '11' }
              })
          : handler(request)
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
    const job = await queue(mf)
    await tick(mf)
    expect(await jobs(mf)).toMatchObject({ jobs: [{ status: 'in_progress' }] })
    await tick(mf)
    expect(submissions).toBe(1)
    const archived = await mf.dispatchFetch(
      `https://test/view?filename=${job.prompt_id}/1/0.png`
    )
    expect(archived.status).toBe(200)
    expect(await archived.text()).toBe('image-bytes')
    const range = await mf.dispatchFetch(
      `https://test/view?filename=${job.prompt_id}/1/0.png`,
      { headers: { Range: 'bytes=0-4' } }
    )
    expect(range.status).toBe(206)
    expect(range.headers.get('content-range')).toBe('bytes 0-4/11')
    expect(await range.text()).toBe('image')
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

describe('Reference pipeline and storage', () => {
  it('uploads with provider headers without forwarding credentials to storage', async () => {
    const mf = await runtime(async (request) => {
      if (request.url.endsWith('/files/generate-upload-url')) {
        expect(request.headers.get('authorization')).toBe('Key test-only')
        expect(await request.json()).toEqual({ content_type: 'image/png' })
        return Response.json({
          public_url: 'https://uploads.example.com/reference.png',
          upload_url: 'https://uploads.example.com/put',
          content_type: 'image/png',
          upload_headers: {
            'Content-Type': 'image/png',
            'x-amz-tagging': 'retention=temporary'
          }
        })
      }
      expect(request.method).toBe('PUT')
      expect(request.headers.get('authorization')).toBeNull()
      expect(request.headers.get('x-amz-tagging')).toBe('retention=temporary')
      expect(await request.text()).toBe('reference-bytes')
      return new Response(null, { status: 200 })
    })
    const response = await mf.dispatchFetch('https://test/higgsfield/upload', {
      method: 'POST',
      headers: { 'content-type': 'image/png' },
      body: 'reference-bytes'
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      url: 'https://uploads.example.com/reference.png'
    })
  })

  it('stops repeated archival failures while retaining the paid output URL', async () => {
    let submissions = 0
    const mf = await runtime(
      async (request) => {
        if (request.method === 'POST') submissions++
        return Response.json({
          request_id: requestId,
          status: 'completed',
          images: [{ url: 'https://cdn.example.com/image.png' }]
        })
      },
      async () => new Response(null, { status: 503 })
    )
    await queue(mf)
    for (let i = 0; i < 13; i++) await tick(mf)
    expect(submissions).toBe(1)
    expect(await jobs(mf)).toMatchObject({
      jobs: [
        {
          status: 'failed',
          outputs_count: 1,
          outputs: { '1': { text: ['https://cdn.example.com/image.png'] } }
        }
      ]
    })
  })

  it('chains a reference edit into video, archives both outputs, and never resubmits during an archive retry', async () => {
    const submitted: unknown[] = []
    let mediaReads = 0
    const mf = await runtime(
      async (request) => {
        if (request.method === 'POST') {
          submitted.push(await request.json())
          return Response.json({ request_id: requestId, status: 'queued' })
        }
        return Response.json({
          request_id: requestId,
          status: 'completed',
          ...(submitted.length === 1
            ? { images: [{ url: 'https://cdn.example.com/keyframe.png' }] }
            : { video: { url: 'https://cdn.example.com/video.mp4' } })
        })
      },
      async (request) => {
        mediaReads++
        if (mediaReads === 1) return new Response(null, { status: 503 })
        const video = request.url.endsWith('.mp4')
        return new Response('media-bytes', {
          headers: {
            'content-type': video ? 'video/mp4' : 'image/png',
            'content-length': '11'
          }
        })
      }
    )
    const job = await queue(mf, {
      '1': {
        class_type: 'HiggsfieldCampaign',
        inputs: {
          prompt: 'Restage coffee',
          image_url: 'https://uploads.example.com/reference.png'
        }
      },
      '2': {
        class_type: 'HiggsfieldAnimate',
        inputs: { image_url: ['1', 0], duration: 4 }
      }
    })
    await tick(mf)
    await tick(mf)
    await tick(mf)
    expect(submitted).toHaveLength(2)
    expect(submitted[0]).toMatchObject({
      image_urls: ['https://uploads.example.com/reference.png']
    })
    expect(submitted[1]).toMatchObject({
      image_url: 'https://cdn.example.com/keyframe.png'
    })
    expect(await jobs(mf)).toMatchObject({
      jobs: [
        {
          status: 'completed',
          outputs_count: 2,
          provider_requests: { '1': requestId, '2': requestId }
        }
      ]
    })
    const video = await mf.dispatchFetch(
      `https://test/view?filename=${job.prompt_id}/2/0.mp4`
    )
    expect(video.headers.get('content-type')).toBe('video/mp4')
    expect(await video.text()).toBe('media-bytes')
  })
})
