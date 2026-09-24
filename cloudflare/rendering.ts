import { Container } from '@cloudflare/containers'

import type { RenderPlan } from './finishing'
import type { Media } from './graph'

export class ComfyRenderer extends Container<Env> {
  defaultPort = 8080
  sleepAfter = '1m'
  enableInternet = false
}
const maxAssetSize = 80 * 1024 * 1024
export async function uploadProductionMedia(request: Request, env: Env) {
  const type = request.headers.get('content-type') ?? ''
  if (
    ![
      'video/mp4',
      'video/webm',
      'audio/mpeg',
      'audio/wav',
      'audio/x-wav',
      'audio/mp4',
      'image/png',
      'image/jpeg',
      'image/webp'
    ].includes(type)
  )
    throw new Error(
      'Upload an MP4/WebM video, MP3/WAV/M4A audio, or PNG/JPEG/WebP logo.'
    )
  const size = Number(request.headers.get('content-length'))
  if (
    !Number.isSafeInteger(size) ||
    size <= 0 ||
    size > maxAssetSize ||
    !request.body
  )
    throw new Error('Media must be between 1 byte and 80 MB.')
  const key = `uploads/${crypto.randomUUID()}`
  const bounded = new FixedLengthStream(size)
  await Promise.all([
    request.body.pipeTo(bounded.writable),
    env.COMFY_MEDIA.put(key, bounded.readable, {
      httpMetadata: { contentType: type }
    })
  ])
  return Response.json({ url: `mhoo-media:${key}` })
}
export async function renderVideo(
  env: Env,
  plan: RenderPlan,
  key: string
): Promise<Media> {
  const existing = await env.COMFY_MEDIA.head(key)
  if (existing)
    return { kind: 'video', storageKey: key, url: `mhoo-media:${key}` }
  const sources = [
    ...plan.clips.map((clip, i) => ({ name: `clip${i}`, source: clip.source })),
    ...(plan.music ? [{ name: 'music', source: plan.music }] : []),
    ...(plan.logo ? [{ name: 'logo', source: plan.logo }] : [])
  ]
  const assets = await Promise.all(
    sources.map(async (item) => {
      const object = await env.COMFY_MEDIA.get(
        item.source.replace('mhoo-media:', '')
      )
      if (!object)
        throw new Error(`Missing media: ${item.name}. Upload it again.`)
      return { ...item, object }
    })
  )
  if (
    assets.reduce((sum, asset) => sum + asset.object.size, 0) >
    480 * 1024 * 1024
  )
    throw new Error('Combined render inputs exceed 480 MB.')
  const boundary = `comfy-${crypto.randomUUID()}`
  const encoder = new TextEncoder()
  const manifest = {
    clips: plan.clips.map(({ start, duration }, i) => ({
      file: `clip${i}`,
      start,
      duration
    })),
    transition: plan.transition,
    caption: plan.caption,
    music: plan.music ? 'music' : undefined,
    logo: plan.logo ? 'logo' : undefined,
    originalVolume: plan.clipVolume,
    musicVolume: plan.musicVolume,
    width:
      plan.aspect === '9:16'
        ? plan.resolution === '1080p'
          ? 1080
          : 720
        : plan.aspect === '1:1'
          ? plan.resolution === '1080p'
            ? 1080
            : 720
          : plan.resolution === '1080p'
            ? 1920
            : 1280,
    height:
      plan.aspect === '9:16'
        ? plan.resolution === '1080p'
          ? 1920
          : 1280
        : plan.resolution === '1080p'
          ? 1080
          : 720
  }
  async function* multipart() {
    yield encoder.encode(
      `--${boundary}\r\nContent-Disposition: form-data; name="manifest"\r\n\r\n${JSON.stringify(manifest)}\r\n`
    )
    for (const { name, object } of assets) {
      yield encoder.encode(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"; filename="${name}"\r\nContent-Type: application/octet-stream\r\n\r\n`
      )
      const reader = object.body.getReader()
      try {
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          yield value
        }
      } finally {
        reader.releaseLock()
      }
      yield encoder.encode('\r\n')
    }
    yield encoder.encode(`--${boundary}--\r\n`)
  }
  const iterator = multipart()
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const next = await iterator.next()
      if (next.done) controller.close()
      else controller.enqueue(next.value)
    },
    async cancel() {
      await iterator.return()
    }
  })
  const response = await env.COMFY_RENDERER.getByName('owner').fetch(
    'http://renderer/render',
    {
      method: 'POST',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      body: stream,
      signal: AbortSignal.timeout(9 * 60 * 1000)
    }
  )
  if (!response.ok) {
    await response.body?.cancel()
    throw new Error(
      `Render failed (${response.status}). Check clip lengths and media formats, then rerun the finishing workflow.`
    )
  }
  const length = Number(response.headers.get('content-length'))
  if (
    !response.body ||
    response.headers.get('content-type') !== 'video/mp4' ||
    !length ||
    length > 250 * 1024 * 1024
  ) {
    await response.body?.cancel()
    throw new Error('Renderer returned an invalid or oversized MP4.')
  }
  const output = new FixedLengthStream(length)
  await Promise.all([
    response.body.pipeTo(output.writable),
    env.COMFY_MEDIA.put(key, output.readable, {
      httpMetadata: { contentType: 'video/mp4' }
    })
  ])
  return { kind: 'video', storageKey: key, url: `mhoo-media:${key}` }
}
