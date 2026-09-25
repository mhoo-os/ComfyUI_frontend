import { z } from 'zod'

import type { Media } from './graph'
import { provider } from './provider'

const httpsUrl = z
  .string()
  .url()
  .refine((value) => {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password
  })
const uploadSchema = z.object({
  public_url: httpsUrl,
  upload_url: httpsUrl,
  upload_headers: z.record(z.string()),
  content_type: z.string()
})
const imageTypes = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif'
]

export async function uploadImage(request: Request, env: Env) {
  const contentType = request.headers.get('content-type') ?? ''
  if (!imageTypes.includes(contentType))
    throw new Error('Choose a JPEG, PNG, WebP or GIF image.')
  const reader = request.body?.getReader()
  if (!reader) throw new Error('Image required.')
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.length
    if (size > 20 * 1024 * 1024) {
      await reader.cancel()
      throw new Error('Images must be no larger than 20 MB.')
    }
    chunks.push(value)
  }
  if (!size) throw new Error('Image is empty.')
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.length
  }
  const upload = uploadSchema.parse(
    await provider(env, 'files/generate-upload-url', {
      content_type: contentType
    })
  )
  const response = await fetch(upload.upload_url, {
    method: 'PUT',
    headers: upload.upload_headers,
    body: bytes,
    redirect: 'manual',
    signal: AbortSignal.timeout(60000)
  })
  await response.body?.cancel()
  if (!response.ok) throw new Error('Image upload failed. Try again.')
  return Response.json(
    { url: upload.public_url },
    { headers: { 'cache-control': 'no-store' } }
  )
}

export async function archiveMedia(
  env: Env,
  media: Media,
  key: string
): Promise<Media> {
  if (await env.COMFY_MEDIA.head(key)) return { ...media, storageKey: key }
  const response = await fetch(media.url, {
    redirect: 'manual',
    signal: AbortSignal.timeout(120000)
  })
  const type = response.headers.get('content-type')?.split(';')[0] ?? ''
  if (
    !response.ok ||
    !response.body ||
    !(media.kind === 'image'
      ? imageTypes.includes(type)
      : ['video/mp4', 'video/quicktime'].includes(type))
  ) {
    await response.body?.cancel()
    throw new Error('Could not archive provider media.')
  }
  const length = Number(response.headers.get('content-length'))
  if (
    !Number.isSafeInteger(length) ||
    length <= 0 ||
    length > 250 * 1024 * 1024
  ) {
    await response.body.cancel()
    throw new Error(
      'Provider media size is missing or exceeds the 250 MB archival limit.'
    )
  }
  await env.COMFY_MEDIA.put(key, response.body, {
    httpMetadata: { contentType: type }
  })
  return { ...media, storageKey: key }
}

export async function readMedia(env: Env, key: string, request: Request) {
  const object = await env.COMFY_MEDIA.get(key, { range: request.headers })
  if (!object) return new Response('Media not found', { status: 404 })
  const headers = new Headers({
    'cache-control': 'private, max-age=3600',
    'x-content-type-options': 'nosniff',
    'accept-ranges': 'bytes',
    etag: object.httpEtag
  })
  object.writeHttpMetadata(headers)
  const range = object.range
  if (
    request.headers.has('range') &&
    range &&
    'offset' in range &&
    'length' in range &&
    range.offset !== undefined &&
    range.length !== undefined
  ) {
    headers.set(
      'content-range',
      `bytes ${range.offset}-${range.offset + range.length - 1}/${object.size}`
    )
    headers.set('content-length', String(range.length))
  } else headers.set('content-length', String(object.size))
  return new Response(request.method === 'HEAD' ? null : object.body, {
    status: headers.has('content-range') ? 206 : 200,
    headers
  })
}
