import { build } from 'esbuild'
import { z } from 'zod'
import type { Request as MiniflareRequest } from 'miniflare'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { beforeAll, describe, expect, it, onTestFinished, vi } from 'vitest'

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
      bindings: {
        PLANNER_GATEWAY_URL:
          'https://gateway.ai.cloudflare.com/v1/faca04363f6ba617faedaae7d3493769/default'
      },
      r2Buckets: ['COMFY_MEDIA'],
      durableObjects: {
        COMFY_JOBS: { className: 'TestJobs', useSQLite: true },
        COMFY_RENDERER: { className: 'TestRenderer', useSQLite: true }
      },
      workflows: {
        COMFY_PRODUCTION: {
          name: 'test-production',
          className: 'ComfyProduction'
        }
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

describe('Production finishing', () => {
  it('rejects a production upload whose declared length is smaller than its body', async () => {
    const mf = await runtime(async () => {
      throw new Error('No provider call expected')
    })
    const response = await mf.dispatchFetch('https://test/test/short-upload', {
      method: 'POST',
      headers: { 'content-type': 'video/mp4' },
      body: 'too-large'
    })
    expect(response.status).toBeGreaterThanOrEqual(400)
    expect(
      (await (await mf.getR2Bucket('COMFY_MEDIA')).list()).objects
    ).toHaveLength(0)
  })

  it('renders private uploaded clips and keeps the finished MP4 playable without submitting to Higgsfield', async () => {
    const mf = await runtime(async (request) => {
      expect(new URL(request.url).hostname).toBe('renderer.example.com')
      const form = await request.formData()
      expect(JSON.parse(String(form.get('manifest')))).toMatchObject({
        width: 1280,
        height: 720,
        clips: [{ start: 0.5, duration: 2 }],
        caption: 'Coffee time',
        originalVolume: 1
      })
      const clip = form.get('clip0')
      expect(
        typeof clip === 'object' && clip !== null && (await clip.text())
      ).toBe('test-video')
      return new Response('finished-mp4', {
        headers: { 'content-type': 'video/mp4', 'content-length': '12' }
      })
    })
    const upload = await mf.dispatchFetch('https://test/production/upload', {
      method: 'POST',
      headers: { 'content-type': 'video/mp4', 'content-length': '10' },
      body: 'test-video'
    })
    const asset = z.object({ url: z.string() }).parse(await upload.json())
    const job = await queue(mf, {
      '1': {
        class_type: 'MhooClip',
        inputs: { video_url: asset.url, start: 0.5, duration: 2 }
      },
      '2': {
        class_type: 'MhooSequence',
        inputs: { clip_1: ['1', 0], transition: 'cut' }
      },
      '3': {
        class_type: 'MhooCompose',
        inputs: { sequence: ['2', 0], caption: 'Coffee time' }
      },
      '4': { class_type: 'MhooExport', inputs: { edit: ['3', 0] } }
    })
    for (let i = 0; i < 4; i++) await tick(mf)
    expect(await jobs(mf)).toMatchObject({
      jobs: [{ status: 'completed', outputs_count: 1 }]
    })
    const result = await mf.dispatchFetch(
      `https://test/view?filename=${job.prompt_id}/4/0.mp4`,
      { headers: { Range: 'bytes=0-7' } }
    )
    expect(result.status).toBe(206)
    expect(await result.text()).toBe('finished')
  })
})

it('runs a talking shot through real Workflows and archives its video without repeat submission', async () => {
  let submissions = 0
  let polls = 0
  const mf = await runtime(
    async (request) => {
      const path = new URL(request.url).pathname
      if (path === '/bytedance/seedance-2.5/text-to-video') {
        submissions++
        const payload = await request.json()
        expect(payload).toMatchObject({ generate_audio: true, duration: 5 })
        expect(payload).not.toHaveProperty('dialogue')
        return Response.json({ request_id: requestId, status: 'queued' })
      }
      polls++
      if (polls === 1)
        return Response.json({ request_id: requestId, status: 'in_progress' })
      return Response.json({
        request_id: requestId,
        status: 'completed',
        video: { url: 'https://cdn.example.com/shot.mp4' }
      })
    },
    async () =>
      new Response('video-bytes', {
        headers: { 'content-type': 'video/mp4', 'content-length': '11' }
      })
  )
  const { prompt_id } = await queue(mf, {
    '1': {
      class_type: 'HiggsfieldTalkingShot',
      inputs: {
        scene: 'A trader holds a chip.',
        dialogue: 'Your next idea starts here.',
        duration: 5
      }
    }
  })
  await tick(mf)
  await vi.waitFor(
    async () => {
      const response = await mf.dispatchFetch(`https://test/jobs/${prompt_id}`)
      expect(await response.json()).toMatchObject({
        status: 'completed',
        runner: 'workflow'
      })
    },
    { timeout: 15000, interval: 100 }
  )
  expect(submissions).toBe(1)
  expect(polls).toBe(2)
  const media = await mf.dispatchFetch(
    `https://test/view?filename=${prompt_id}/1/0.mp4`
  )
  expect(media.status).toBe(200)
  expect(await media.text()).toBe('video-bytes')
}, 20000)

it('does not retry an ambiguous paid talking-shot submission in Workflows', async () => {
  let submissions = 0
  const mf = await runtime(async () => {
    submissions++
    return new Response('upstream response lost', { status: 502 })
  })
  const { prompt_id } = await queue(mf, {
    '1': {
      class_type: 'HiggsfieldTalkingShot',
      inputs: {
        scene: 'A trader holds a chip.',
        dialogue: 'Your next idea starts here.'
      }
    }
  })
  await tick(mf)
  await vi.waitFor(
    async () => {
      const response = await mf.dispatchFetch(`https://test/jobs/${prompt_id}`)
      expect(await response.json()).toMatchObject({
        status: 'failed',
        runner: 'workflow'
      })
    },
    { timeout: 15000, interval: 100 }
  )
  await tick(mf)
  expect(submissions).toBe(1)
}, 20000)

it('checkpoints Jev and Astra before one video submission in real Workflows', async () => {
  const calls: string[] = []
  const mf = await runtime(
    async (request) => {
      const path = new URL(request.url).pathname
      calls.push(path)
      if (path.endsWith('/systemone'))
        return Response.json({
          answers: {
            route: {
              type: 'choice',
              choice: 'single_speaker',
              confidence: 0.95
            }
          }
        })
      if (path.endsWith('/responses'))
        return Response.json({
          status: 'completed',
          output: [
            {
              type: 'message',
              content: [
                {
                  type: 'output_text',
                  text: '{"scene":"A steady close-up of the trader in amber neon."}'
                }
              ]
            }
          ]
        })
      if (path.endsWith('/text-to-video')) {
        const payload = await request.json()
        expect(payload).toMatchObject({
          prompt: expect.stringContaining('amber neon')
        })
        expect(payload).toMatchObject({
          prompt: expect.stringContaining('Your next idea starts here.')
        })
        return Response.json({ request_id: requestId, status: 'queued' })
      }
      return Response.json({
        request_id: requestId,
        status: 'completed',
        video: { url: 'https://cdn.example.com/shot.mp4' }
      })
    },
    async () =>
      new Response('video-bytes', {
        headers: { 'content-type': 'video/mp4', 'content-length': '11' }
      })
  )
  const { prompt_id } = await queue(mf, {
    '1': {
      class_type: 'HiggsfieldTalkingShot',
      inputs: {
        scene: 'A trader holds a chip.',
        dialogue: 'Your next idea starts here.',
        planner: 'jev_astra'
      }
    }
  })
  await tick(mf)
  await vi.waitFor(
    async () => {
      const response = await mf.dispatchFetch(`https://test/jobs/${prompt_id}`)
      expect(await response.json()).toMatchObject({ status: 'completed' })
    },
    { timeout: 15000, interval: 100 }
  )
  expect(calls.map((path) => path.split('/').at(-1))).toEqual([
    'systemone',
    'responses',
    'text-to-video',
    'status'
  ])
}, 20000)

describe('Private character reference review', () => {
  const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0])
  const assetSchema = z.object({
    id: z.string(),
    revision: z.number(),
    etag: z.string(),
    approval: z.unknown()
  })
  async function upload(mf: Miniflare) {
    const response = await mf.dispatchFetch('https://test/character-assets', {
      method: 'POST',
      headers: {
        'Content-Type': 'image/png',
        'X-File-Name': 'reference.png',
        'Content-Length': String(png.length)
      },
      body: png
    })
    expect(response.status).toBe(201)
    return assetSchema.parse(await response.json())
  }
  async function describeAsset(
    mf: Miniflare,
    asset: z.infer<typeof assetSchema>
  ) {
    const response = await mf.dispatchFetch(
      `https://test/character-assets/${asset.id}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          revision: asset.revision,
          metadata: {
            character: 'Test subject',
            era: '2020',
            subject: 'Left person in white shirt',
            view: 'front'
          }
        })
      }
    )
    expect(response.status).toBe(200)
    return assetSchema.parse(await response.json())
  }
  async function review(
    mf: Miniflare,
    asset: z.infer<typeof assetSchema>,
    action = 'approve'
  ) {
    return mf.dispatchFetch('https://test/character-assets/review', {
      method: 'POST',
      body: JSON.stringify({
        items: [{ id: asset.id, revision: asset.revision, etag: asset.etag }],
        action
      })
    })
  }
  function referenceGraph(asset: z.infer<typeof assetSchema>) {
    return {
      '1': {
        class_type: 'HiggsfieldCampaign',
        inputs: {
          prompt: 'A portrait',
          image_url: `mhoo-asset:${asset.id}:${asset.revision}`
        }
      }
    }
  }
  it('keeps draft bytes private, blocks draft queueing and estimates without contacting provider', async () => {
    const provider = vi.fn(async () => Response.json({}))
    const mf = await runtime(provider)
    const asset = await upload(mf)
    expect(asset.approval).toBeNull()
    const preview = await mf.dispatchFetch(
      `https://test/character-assets/${asset.id}/preview`
    )
    expect(preview.headers.get('cache-control')).toBe('private, no-store')
    expect(new Uint8Array(await preview.arrayBuffer())).toEqual(png)
    for (const path of ['/prompt', '/higgsfield/estimate']) {
      const response = await mf.dispatchFetch(`https://test${path}`, {
        method: 'POST',
        body: JSON.stringify({ prompt: referenceGraph(asset) })
      })
      expect(response.status).toBe(400)
    }
    expect(provider).not.toHaveBeenCalled()
  })
  it('estimates approved references without upload and clears approval on metadata changes', async () => {
    const paths: string[] = []
    const mf = await runtime(async (request) => {
      paths.push(new URL(request.url).pathname)
      expect(await request.json()).toMatchObject({
        image_urls: ['https://example.com/approved-reference.jpg']
      })
      return Response.json({ type: 'estimate', usd: '0.1', credits: '1' })
    })
    const draft = await upload(mf)
    const asset = await describeAsset(mf, draft)
    expect((await review(mf, asset)).status).toBe(200)
    expect(
      (
        await mf.dispatchFetch('https://test/higgsfield/estimate', {
          method: 'POST',
          body: JSON.stringify({ prompt: referenceGraph(asset) })
        })
      ).status
    ).toBe(200)
    expect(paths).toEqual(['/estimate/marketing-studio/image'])
    const changed = await describeAsset(mf, asset)
    expect(changed.approval).toBeNull()
    expect((await review(mf, asset)).status).toBe(409)
    expect(
      (
        await mf.dispatchFetch('https://test/prompt', {
          method: 'POST',
          body: JSON.stringify({ prompt: referenceGraph(asset) })
        })
      ).status
    ).toBe(400)
    expect(paths).toHaveLength(1)
  })
  it('resolves approved bytes only at execution and never sends a private token to generation', async () => {
    const paths: string[] = []
    const mf = await runtime(async (request) => {
      const path = new URL(request.url).pathname
      paths.push(path)
      if (path === '/files/generate-upload-url')
        return Response.json({
          public_url: 'https://provider.example/reference.png',
          upload_url: 'https://provider.example/upload',
          upload_headers: {}
        })
      if (path === '/upload') {
        expect(new Uint8Array(await request.arrayBuffer())).toEqual(png)
        return new Response(null, { status: 200 })
      }
      if (path === '/marketing-studio/image') {
        expect(await request.json()).toMatchObject({
          image_urls: ['https://provider.example/reference.png'],
          prompt: expect.stringContaining('Left person in white shirt')
        })
        return Response.json({ request_id: requestId, status: 'queued' })
      }
      return Response.json({ request_id: requestId, status: 'in_progress' })
    })
    const asset = await describeAsset(mf, await upload(mf))
    await review(mf, asset)
    await queue(mf, referenceGraph(asset))
    expect(paths).toEqual([])
    await tick(mf)
    expect(paths.slice(0, 3)).toEqual([
      '/files/generate-upload-url',
      '/upload',
      '/marketing-studio/image'
    ])
  })
  it('rechecks revocation after enqueue and rejects invalid image bytes', async () => {
    const provider = vi.fn(async () => Response.json({}))
    const mf = await runtime(provider)
    const invalid = await mf.dispatchFetch('https://test/character-assets', {
      method: 'POST',
      headers: { 'Content-Type': 'image/png' },
      body: 'not an image file'
    })
    expect(invalid.status).toBe(400)
    const asset = await describeAsset(mf, await upload(mf))
    await review(mf, asset)
    await queue(mf, referenceGraph(asset))
    await review(mf, asset, 'draft')
    await tick(mf)
    expect(provider).not.toHaveBeenCalled()
    expect(await jobs(mf)).toMatchObject({ jobs: [{ status: 'failed' }] })
  })
  it('rejects an entire stale batch without approving the other selected asset', async () => {
    const mf = await runtime(async () => Response.json({}))
    const first = await describeAsset(mf, await upload(mf))
    const second = await describeAsset(mf, await upload(mf))
    const response = await mf.dispatchFetch(
      'https://test/character-assets/review',
      {
        method: 'POST',
        body: JSON.stringify({
          action: 'approve',
          items: [first, { ...second, revision: 1 }].map(
            ({ id, revision, etag }) => ({ id, revision, etag })
          )
        })
      }
    )
    expect(response.status).toBe(409)
    const list = await (
      await mf.dispatchFetch('https://test/character-assets')
    ).json()
    expect(
      z
        .array(assetSchema)
        .parse(list)
        .every((asset) => asset.approval === null)
    ).toBe(true)
  })
  it('holds approval through an in-flight transfer and refuses revocation until submission ends', async () => {
    let release: () => void = () => {}
    let started: () => void = () => {}
    const blocked = new Promise<void>((resolve) => {
      release = resolve
    })
    const transferring = new Promise<void>((resolve) => {
      started = resolve
    })
    const mf = await runtime(async (request) => {
      const path = new URL(request.url).pathname
      if (path === '/files/generate-upload-url')
        return Response.json({
          public_url: 'https://provider.example/reference.png',
          upload_url: 'https://provider.example/upload',
          upload_headers: {}
        })
      if (path === '/upload') {
        started()
        await blocked
        return new Response(null)
      }
      return Response.json({ request_id: requestId, status: 'in_progress' })
    })
    const asset = await describeAsset(mf, await upload(mf))
    await review(mf, asset)
    await queue(mf, referenceGraph(asset))
    const running = tick(mf)
    await transferring
    try {
      expect((await review(mf, asset, 'draft')).status).toBe(409)
      const patch = await mf.dispatchFetch(
        `https://test/character-assets/${asset.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            revision: asset.revision,
            metadata: { character: 'Changed' }
          })
        }
      )
      expect(patch.status).toBe(409)
    } finally {
      release()
      await running
    }
    expect((await review(mf, asset, 'draft')).status).toBe(200)
  })
  it('rejects private tokens in prompts before contacting the provider', async () => {
    const provider = vi.fn(async () => Response.json({}))
    const mf = await runtime(provider)
    const asset = await describeAsset(mf, await upload(mf))
    await review(mf, asset)
    const response = await mf.dispatchFetch('https://test/prompt', {
      method: 'POST',
      body: JSON.stringify({
        prompt: {
          '1': {
            class_type: 'HiggsfieldSoul',
            inputs: { prompt: `Use mhoo-asset:${asset.id}:${asset.revision}` }
          }
        }
      })
    })
    expect(response.status).toBe(400)
    expect(provider).not.toHaveBeenCalled()
  })
  it.for([502, 200])(
    'retains the submission lock when provider acceptance is uncertain (%s)',
    async (status) => {
      const mf = await runtime(async (request) => {
        const path = new URL(request.url).pathname
        if (path === '/files/generate-upload-url')
          return Response.json({
            public_url: 'https://provider.example/reference.png',
            upload_url: 'https://provider.example/upload',
            upload_headers: {}
          })
        if (path === '/upload') return new Response(null)
        return new Response('{}', { status })
      })
      const asset = await describeAsset(mf, await upload(mf))
      await review(mf, asset)
      await queue(mf, referenceGraph(asset))
      await tick(mf)
      expect((await review(mf, asset, 'draft')).status).toBe(409)
    }
  )
  it('saves a crop as a separate draft with lineage and keeps the approved original intact', async () => {
    const provider = vi.fn(async () => Response.json({}))
    const mf = await runtime(provider)
    const original = await describeAsset(mf, await upload(mf))
    await review(mf, original)
    const crop = {
      parentId: original.id,
      parentRevision: original.revision,
      parentEtag: original.etag,
      sourceWidth: 100,
      sourceHeight: 100,
      x: 10,
      y: 20,
      width: 32,
      height: 40,
      method: 'browser-canvas-crop-v1'
    }
    const bytes = new Uint8Array(24)
    bytes.set(png)
    const view = new DataView(bytes.buffer)
    view.setUint32(16, 32)
    view.setUint32(20, 40)
    const result = await mf.dispatchFetch('https://test/character-assets', {
      method: 'POST',
      headers: {
        'Content-Type': 'image/png',
        'Content-Length': String(bytes.length),
        'X-Reference-Crop': JSON.stringify(crop)
      },
      body: bytes
    })
    expect(result.status).toBe(201)
    const child = await result.json()
    expect(child).toMatchObject({
      revision: 1,
      approval: null,
      crop,
      metadata: {
        character: 'Test subject',
        era: '2020',
        subject: '',
        view: 'unknown'
      }
    })
    const childId = assetSchema.parse(child).id
    expect(childId).not.toBe(original.id)
    const listed = z
      .array(assetSchema)
      .parse(
        await (await mf.dispatchFetch('https://test/character-assets')).json()
      )
    expect(
      listed.find((item) => item.id === original.id)?.approval
    ).toMatchObject({ revision: original.revision, etag: original.etag })
    expect(provider).not.toHaveBeenCalled()
  })
  it.for(['stale', 'outside', 'dimensions'] as const)(
    'rejects a %s crop without creating an asset',
    async (mode) => {
      const mf = await runtime(async () => Response.json({}))
      const original = await describeAsset(mf, await upload(mf))
      const crop = {
        parentId: original.id,
        parentRevision: mode === 'stale' ? 1 : original.revision,
        parentEtag: original.etag,
        sourceWidth: 100,
        sourceHeight: 100,
        x: mode === 'outside' ? 90 : 0,
        y: 0,
        width: 32,
        height: 32,
        method: 'browser-canvas-crop-v1'
      }
      const bytes = new Uint8Array(24)
      bytes.set(png)
      const view = new DataView(bytes.buffer)
      view.setUint32(16, mode === 'dimensions' ? 64 : 32)
      view.setUint32(20, 32)
      const result = await mf.dispatchFetch('https://test/character-assets', {
        method: 'POST',
        headers: {
          'Content-Type': 'image/png',
          'Content-Length': String(bytes.length),
          'X-Reference-Crop': JSON.stringify(crop)
        },
        body: bytes
      })
      expect(result.status).toBe(400)
      expect(
        z
          .array(assetSchema)
          .parse(
            await (
              await mf.dispatchFetch('https://test/character-assets')
            ).json()
          )
      ).toHaveLength(1)
    }
  )
})
