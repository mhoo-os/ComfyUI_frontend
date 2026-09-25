import { z } from 'zod'
import { provider } from './provider'
import type { ReferenceLibrary } from './references'

const inputSchema = z
  .object({
    attemptId: z.string().uuid(),
    name: z.string().min(1).max(100),
    references: z
      .array(z.string().regex(/^mhoo-asset:[a-f0-9-]{36}:\d+$/))
      .min(1)
      .max(100)
  })
  .strict()
const resultSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(['not_ready', 'queued', 'in_progress', 'completed', 'failed'])
})
type Attempt = z.infer<typeof inputSchema> & {
  status: string
  referenceId?: string
}
export async function soulTraining(
  request: Request,
  storage: DurableObjectStorage,
  env: Env,
  library: ReferenceLibrary,
  read: (r: Request) => Promise<unknown>
) {
  const path = new URL(request.url).pathname
  const base = '/character-assets/training'
  const respond = (body: unknown, status = 200) =>
    Response.json(body, { status, headers: { 'cache-control': 'no-store' } })
  if (path === base && request.method === 'GET') {
    return respond([
      ...(await storage.list<Attempt>({ prefix: 'soul-training:' })).values()
    ])
  }
  if (path === base && request.method === 'POST') {
    const input = inputSchema.parse(await read(request))
    const key = `soul-training:${input.attemptId}`
    const existing = await storage.get<Attempt>(key)
    if (existing) return respond(existing)
    // Validate before reserving; never upload drafts or stale revisions.
    await library.resolve({ input_images: input.references }, true)
    const reserved = await storage.transaction(async (txn) => {
      if (await txn.get(key)) return false
      await txn.put(key, { ...input, status: 'submitting' })
      return true
    })
    if (!reserved) return respond(await storage.get(key))
    try {
      const result = resultSchema.parse(
        await library.submit(
          { input_images: input.references },
          8000,
          async (resolved) => {
            const urls = z.array(z.string().url()).parse(resolved.input_images)
            return provider(env, 'v1/custom-references', {
              name: input.name,
              model_version: 'v2',
              input_images: urls.map((image_url) => ({
                type: 'image_url' as const,
                image_url
              }))
            })
          }
        )
      )
      const saved = { ...input, status: result.status, referenceId: result.id }
      await storage.put(key, saved)
      return respond(saved)
    } catch {
      const uncertain = { ...input, status: 'submission_unknown' }
      await storage.put(key, uncertain)
      return respond(uncertain, 502)
    }
  }
  if (path.startsWith(base + '/') && request.method === 'GET') {
    const id = z
      .string()
      .uuid()
      .parse(path.slice(base.length + 1))
    const key = `soul-training:${id}`
    const saved = await storage.get<Attempt>(key)
    if (!saved) return respond({ error: 'Unknown training attempt' }, 404)
    if (!saved.referenceId) return respond(saved)
    const result = resultSchema.parse(
      await provider(env, `v1/custom-references/${saved.referenceId}`)
    )
    if (result.id !== saved.referenceId)
      return respond({ error: 'Reference mismatch' }, 502)
    const updated = { ...saved, status: result.status }
    await storage.put(key, updated)
    return respond(updated)
  }
  return respond({ error: 'Unsupported training action' }, 405)
}
