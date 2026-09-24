import { z } from 'zod'

import {
  referenceMetadata,
  referenceCrop,
  referenceToken,
  approvedReference
} from './referenceContract'
import type { ReferenceAsset } from './referenceContract'
import type { Input } from './graph'
import { provider } from './provider'

const limit = 20 * 1024 * 1024
const prefix = 'reference:'
const useKey = (id: string) => `reference-use:${id}`
const keyFor = (id: string) => `character-assets/${id}`
const revisionRequest = z
  .object({
    id: z.string().uuid(),
    revision: z.number().int().positive(),
    etag: z.string().min(1)
  })
  .strict()
async function smallJson(request: Request): Promise<unknown> {
  const reader = request.body?.getReader()
  if (!reader) throw new Error('Request body required.')
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.length
    if (size > 64000) {
      await reader.cancel()
      throw new Error('Request too large.')
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.length
  }
  return JSON.parse(new TextDecoder().decode(bytes))
}
function signature(bytes: Uint8Array, type: string) {
  if (type === 'image/jpeg')
    return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
  if (type === 'image/png')
    return [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v)
  return (
    new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF' &&
    new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP'
  )
}
export class ReferenceLibrary {
  constructor(
    private storage: DurableObjectStorage,
    private env: Env
  ) {}

  async handle(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname
    const respond = (value: unknown, status = 200) =>
      Response.json(value, { status, headers: { 'cache-control': 'no-store' } })
    if (path === '/character-assets' && request.method === 'GET') {
      return respond([
        ...(
          await this.storage.list<ReferenceAsset>({ prefix, limit: 200 })
        ).values()
      ])
    }
    if (path === '/character-assets' && request.method === 'POST') {
      const cropHeader = request.headers.get('x-reference-crop')
      if (cropHeader && cropHeader.length > 2048)
        throw new Error('Crop metadata too large.')
      const crop = cropHeader
        ? referenceCrop.parse(JSON.parse(cropHeader))
        : undefined
      const parent = crop
        ? await this.storage.get<ReferenceAsset>(prefix + crop.parentId)
        : undefined
      if (crop) {
        const original = await this.env.COMFY_MEDIA.head(keyFor(crop.parentId))
        if (
          !parent ||
          parent.revision !== crop.parentRevision ||
          parent.etag !== crop.parentEtag ||
          original?.etag !== parent.etag
        )
          throw new Error('Original changed. Reopen the crop editor.')
        if (request.headers.get('content-type') !== 'image/png')
          throw new Error('Crops must be PNG images.')
      }
      const size = Number(request.headers.get('content-length'))
      const type = request.headers.get('content-type') ?? ''
      if (
        !['image/jpeg', 'image/png', 'image/webp'].includes(type) ||
        !Number.isSafeInteger(size) ||
        size < 12 ||
        size > limit ||
        !request.body
      )
        throw new Error(
          'Upload a JPEG, PNG or WebP between 12 bytes and 20 MB.'
        )
      if ((await this.storage.list({ prefix, limit: 200 })).size >= 200)
        throw new Error('Reference library is limited to 200 photos.')
      const name = decodeURIComponent(
        request.headers.get('x-file-name') ?? 'Reference'
      ).slice(0, 180)
      const id = crypto.randomUUID()
      const reader = request.body.getReader()
      const initial: Uint8Array[] = []
      let received = 0
      while (received < (crop ? 24 : 12)) {
        const { done, value } = await reader.read()
        if (done) throw new Error('Image is truncated.')
        received += value.length
        if (received > size) {
          await reader.cancel()
          throw new Error('Image exceeds declared size.')
        }
        initial.push(value)
      }
      const first = new Uint8Array(received)
      let offset = 0
      for (const chunk of initial) {
        first.set(chunk, offset)
        offset += chunk.length
      }
      if (!signature(first, type)) {
        await reader.cancel()
        throw new Error('Image bytes do not match its file type.')
      }
      if (crop) {
        const header = new DataView(
          first.buffer,
          first.byteOffset,
          first.byteLength
        )
        if (
          first.length < 24 ||
          header.getUint32(16) !== crop.width ||
          header.getUint32(20) !== crop.height
        ) {
          await reader.cancel()
          throw new Error('Crop dimensions do not match the uploaded PNG.')
        }
      }
      const bounded = new FixedLengthStream(size)
      const writer = bounded.writable.getWriter()
      const transfer = async () => {
        try {
          await writer.write(first)
          for (;;) {
            const { done, value } = await reader.read()
            if (done) break
            received += value.length
            if (received > size) throw new Error('Image exceeds declared size.')
            await writer.write(value)
          }
          if (received !== size) throw new Error('Image is truncated.')
          await writer.close()
        } catch (error) {
          await reader.cancel()
          await writer.abort(error)
          throw error
        }
      }
      const [, object] = await Promise.all([
        transfer(),
        this.env.COMFY_MEDIA.put(keyFor(id), bounded.readable, {
          httpMetadata: { contentType: type }
        })
      ])
      const asset: ReferenceAsset = {
        id,
        name,
        revision: 1,
        etag: object.etag,
        size,
        contentType: type,
        created: Date.now(),
        metadata: parent
          ? { ...parent.metadata, subject: '', view: 'unknown' }
          : referenceMetadata.parse({}),
        ...(crop && { crop }),
        approval: null
      }
      try {
        await this.storage.transaction(async (txn) => {
          if ((await txn.list({ prefix, limit: 200 })).size >= 200)
            throw new Error('Reference library is limited to 200 photos.')
          if (crop) {
            const current = await txn.get<ReferenceAsset>(
              prefix + crop.parentId
            )
            if (
              !current ||
              current.revision !== crop.parentRevision ||
              current.etag !== crop.parentEtag
            )
              throw new Error('Original changed. Reopen the crop editor.')
          }
          await txn.put(prefix + id, asset)
        })
      } catch (error) {
        await this.env.COMFY_MEDIA.delete(keyFor(id))
        throw error
      }
      return respond(asset, 201)
    }
    const match = /^\/character-assets\/([0-9a-f-]{36})(\/preview)?$/.exec(path)
    if (match) {
      const id = z.string().uuid().parse(match[1])
      if (match[2] && request.method === 'GET') {
        const asset = await this.storage.get<ReferenceAsset>(prefix + id)
        if (!asset) return respond({ error: 'Photo not found.' }, 404)
        const object = await this.env.COMFY_MEDIA.get(keyFor(id))
        if (!object || object.etag !== asset.etag)
          throw new Error('Stored photo changed. Upload it again.')
        return new Response(object.body, {
          headers: {
            'content-type': asset.contentType,
            'cache-control': 'private, no-store',
            'x-content-type-options': 'nosniff'
          }
        })
      }
      if (!match[2] && request.method === 'PATCH') {
        const body = z
          .object({
            revision: z.number().int().positive(),
            metadata: referenceMetadata
          })
          .strict()
          .parse(await smallJson(request))
        return this.storage.transaction(async (txn) => {
          const asset = await txn.get<ReferenceAsset>(prefix + id)
          if (!asset) return respond({ error: 'Photo not found.' }, 404)
          if (asset.revision !== body.revision)
            return respond(
              {
                error: 'Photo changed in another tab. Refresh and review again.'
              },
              409
            )
          if (((await txn.get<number>(useKey(id))) ?? 0) > Date.now())
            return respond(
              {
                error:
                  'This reference is being sent to a running generation. Try again after submission completes.'
              },
              409
            )
          const next = {
            ...asset,
            revision: asset.revision + 1,
            metadata: body.metadata,
            approval: null
          }
          await txn.put(prefix + id, next)
          return respond(next)
        })
      }
    }
    if (path === '/character-assets/review' && request.method === 'POST') {
      const body = z
        .object({
          items: z.array(revisionRequest).min(1).max(50),
          action: z.enum(['approve', 'draft'])
        })
        .strict()
        .parse(await smallJson(request))
      if (new Set(body.items.map((x) => x.id)).size !== body.items.length)
        throw new Error('Select each photo once.')
      const heads = new Map(
        await Promise.all(
          body.items.map(
            async (item) =>
              [
                item.id,
                await this.env.COMFY_MEDIA.head(keyFor(item.id))
              ] as const
          )
        )
      )
      return this.storage.transaction(async (txn) => {
        const assets: ReferenceAsset[] = []
        for (const item of body.items) {
          const asset = await txn.get<ReferenceAsset>(prefix + item.id)
          if (
            !asset ||
            asset.revision !== item.revision ||
            asset.etag !== item.etag
          )
            return respond(
              { error: 'Selection changed. Refresh and review again.' },
              409
            )
          if (((await txn.get<number>(useKey(asset.id))) ?? 0) > Date.now())
            return respond(
              {
                error:
                  'This reference is being sent to a running generation. Try again after submission completes.'
              },
              409
            )
          if (
            body.action === 'approve' &&
            (!asset.metadata.character ||
              !asset.metadata.era ||
              !asset.metadata.subject ||
              asset.metadata.view === 'unknown')
          )
            throw new Error(
              'Set character, era, subject and view before approving.'
            )
          const object = heads.get(asset.id)
          if (!object || object.etag !== asset.etag)
            throw new Error('Stored photo changed. Upload it again.')
          assets.push({
            ...asset,
            approval:
              body.action === 'approve'
                ? { revision: asset.revision, etag: asset.etag, at: Date.now() }
                : null
          })
        }
        for (const asset of assets) await txn.put(prefix + asset.id, asset)
        return respond(assets)
      })
    }
    return respond({ error: 'Unsupported reference operation.' }, 405)
  }

  private async requireApproved(token: string) {
    const match = referenceToken.exec(token)
    if (!match) throw new Error('Invalid reference token.')
    const asset = await this.storage.get<ReferenceAsset>(
      prefix + z.string().uuid().parse(match[1])
    )
    if (
      !asset ||
      asset.revision !== Number(match[2]) ||
      !approvedReference(asset)
    )
      throw new Error(
        'Reference is draft or changed. Review and approve it again.'
      )
    const object = await this.env.COMFY_MEDIA.head(keyFor(asset.id))
    if (!object || object.etag !== asset.etag)
      throw new Error('Reference bytes changed. Upload and review again.')
    return asset
  }

  async submit<T>(
    input: Input,
    promptLimit: number,
    send: (input: Input) => Promise<T>
  ): Promise<T> {
    const tokens = [
      ...new Set(
        Object.values(input)
          .flatMap((value) => (Array.isArray(value) ? value : [value]))
          .filter(
            (value): value is string =>
              typeof value === 'string' && value.startsWith('mhoo-asset:')
          )
      )
    ]
    await this.resolve(input, true, promptLimit)
    const assets = await Promise.all(
      tokens.map((token) => this.requireApproved(token))
    )
    await this.storage.transaction(async (txn) => {
      for (const asset of assets) {
        const current = await txn.get<ReferenceAsset>(prefix + asset.id)
        if (
          !current ||
          current.revision !== asset.revision ||
          !approvedReference(current)
        )
          throw new Error('Reference approval changed before submission.')
        if (((await txn.get<number>(useKey(asset.id))) ?? 0) > Date.now())
          throw new Error('Reference is already being submitted.')
      }
      for (const asset of assets)
        await txn.put(useKey(asset.id), Date.now() + 300000)
    })
    const result = await send(await this.resolve(input, false, promptLimit))
    if (assets.length)
      await this.storage.delete(assets.map((asset) => useKey(asset.id)))
    return result
  }

  async resolve(
    input: Input,
    estimate = false,
    promptLimit = 8000
  ): Promise<Input> {
    const result = { ...input }
    const used: string[] = []
    const subjects: string[] = []
    for (const [field, value] of Object.entries(input)) {
      for (const item of Array.isArray(value) ? value : [value]) {
        if (typeof item !== 'string' || !item.startsWith('mhoo-asset:'))
          continue
        if (
          ![
            'image_url',
            'end_image_url',
            'image_urls',
            'input_images',
            'input_images_end'
          ].includes(field)
        )
          throw new Error(
            'Private references are only supported in image inputs.'
          )
        const asset = await this.requireApproved(item)
        subjects.push(asset.metadata.subject)
      }
    }
    if (subjects.length && typeof result.prompt === 'string') {
      result.prompt += `\nReference subject selection (descriptions only): ${JSON.stringify(subjects)}. Preserve the selected subject; do not blend other people.`
      if (result.prompt.length > promptLimit)
        throw new Error(
          'Shorten the prompt to leave room for reference subject descriptions.'
        )
    }
    for (const [field, value] of Object.entries(input)) {
      if (
        ![
          'image_url',
          'end_image_url',
          'image_urls',
          'input_images',
          'input_images_end'
        ].includes(field)
      )
        continue
      const values = Array.isArray(value) ? value : [value]
      const resolved: string[] = []
      for (const item of values) {
        if (typeof item !== 'string' || !item.startsWith('mhoo-asset:')) {
          resolved.push(String(item))
          continue
        }
        const asset = await this.requireApproved(item)
        used.push(item)
        if (estimate) {
          resolved.push('https://example.com/approved-reference.jpg')
          continue
        }
        const object = await this.env.COMFY_MEDIA.get(keyFor(asset.id))
        if (!object || object.etag !== asset.etag)
          throw new Error('Reference changed.')
        const upload = z
          .object({
            public_url: z.string().url(),
            upload_url: z.string().url(),
            upload_headers: z.record(z.string())
          })
          .parse(
            await provider(this.env, 'files/generate-upload-url', {
              content_type: asset.contentType
            })
          )
        if (
          ![upload.public_url, upload.upload_url].every(
            (url) => new URL(url).protocol === 'https:'
          )
        )
          throw new Error('Provider returned an unsafe upload URL.')
        const sent = await fetch(upload.upload_url, {
          method: 'PUT',
          headers: upload.upload_headers,
          body: object.body,
          redirect: 'manual',
          signal: AbortSignal.timeout(60000)
        })
        await sent.body?.cancel()
        if (!sent.ok) throw new Error('Reference transfer failed.')
        resolved.push(upload.public_url)
      }
      result[field] = Array.isArray(value) ? resolved : resolved[0]
    }
    for (const token of used) await this.requireApproved(token)
    return result
  }
}
