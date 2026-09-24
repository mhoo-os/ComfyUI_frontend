import { z } from 'zod'

import type { Input, Media } from './graph'

const mediaSchema = z.object({
  url: z
    .string()
    .url()
    .refine((value) => new URL(value).protocol === 'https:')
})
export const resultSchema = z.object({
  request_id: z.string().uuid(),
  status: z.enum([
    'queued',
    'in_progress',
    'completed',
    'failed',
    'nsfw',
    'canceled'
  ]),
  images: z.array(mediaSchema).nullish(),
  video: mediaSchema.nullish()
})
export type ProviderResult = z.infer<typeof resultSchema>

export async function provider(
  env: Env,
  path: string,
  input?: Input
): Promise<unknown> {
  const credentials = await env.HF_CREDENTIALS.get()
  if (!credentials) throw new Error('Higgsfield credentials are unavailable.')
  const response = await fetch(`https://api.higgsfield.ai/${path}`, {
    method: input ? 'POST' : 'GET',
    headers: {
      Authorization: `Key ${credentials}`,
      'Content-Type': 'application/json'
    },
    ...(input && { body: JSON.stringify(input) }),
    signal: AbortSignal.timeout(20000),
    redirect: 'manual'
  })
  if (!response.ok) {
    await response.body?.cancel()
    throw new Error(
      `Higgsfield returned HTTP ${response.status}. Check model access, parameters and account credits. Requests are not automatically resubmitted.`
    )
  }
  if (path.endsWith('/cancel')) {
    await response.body?.cancel()
    return null
  }
  return response.json()
}

export function resultMedia(result: ProviderResult): Media[] {
  return [
    ...(result.images ?? []).map((item) => ({
      url: item.url,
      kind: 'image' as const
    })),
    ...(result.video ? [{ url: result.video.url, kind: 'video' as const }] : [])
  ]
}
