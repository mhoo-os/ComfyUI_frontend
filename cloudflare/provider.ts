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
  video: mediaSchema.nullish(),
  error: z.string().max(1000).optional().catch(undefined),
  correlation_id: z.string().max(128).optional().catch(undefined)
})
export type ProviderResult = z.infer<typeof resultSchema>

export async function provider(
  env: Env,
  path: string,
  input?:
    | Input
    | {
        name: string
        model_version: 'v2'
        input_images: { type: 'image_url'; image_url: string }[]
      }
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
  const correlation = response.headers.get('X-Correlation-ID')
  const correlationId =
    correlation && /^[a-zA-Z0-9_.:-]{1,128}$/.test(correlation)
      ? correlation
      : undefined
  const redact = (value: string) => {
    let message = value
    for (const secret of [credentials, ...credentials.split(':')]) {
      if (secret) message = message.split(secret).join('[redacted]')
    }
    if (input) {
      for (const value of Object.values(input)) {
        if (typeof value === 'string' && value.length > 3)
          message = message.split(value).join('[input redacted]')
      }
    }
    return message
      .replace(/https?:\/\/[^\s<>"']+/gi, '[URL redacted]')
      .replace(/(?:Bearer|Key)\s+[^\s,;]+/gi, '[credential redacted]')
      .split('')
      .map((character) => {
        const code = character.charCodeAt(0)
        return code < 32 || code === 127 ? ' ' : character
      })
      .join('')
      .slice(0, 1000)
  }
  if (!response.ok) {
    let detail: string | undefined
    try {
      const body = await readErrorBody(response)
      detail = diagnosticMessage(body)
    } catch {
      // Malformed, oversized or unavailable diagnostics must not hide HTTP status.
    }
    throw new Error(
      `Higgsfield returned HTTP ${response.status}.${detail ? ` ${redact(detail)}` : ''}${correlationId ? ` [correlation: ${correlationId}]` : ''} Requests are not automatically resubmitted.`
    )
  }
  if (path.endsWith('/cancel')) {
    await response.body?.cancel()
    return null
  }
  const body: unknown = await response.json()
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    const result = { ...body } as Record<string, unknown>
    // Do not preserve a body-supplied correlation ID or raw error object.
    delete result.error
    delete result.correlation_id
    const error = diagnosticMessage(body)
    if (error) result.error = redact(error)
    if (correlationId) result.correlation_id = correlationId
    return result
  }
  return body
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

// Read only a small JSON error envelope; never store arbitrary response bodies.
async function readErrorBody(response: Response): Promise<unknown> {
  const reader = response.body?.getReader()
  if (!reader) return undefined
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 16384) {
        await reader.cancel()
        return undefined
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.length
  }
  return JSON.parse(new TextDecoder().decode(bytes))
}

function diagnosticMessage(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return undefined
  const record = body as Record<string, unknown>
  if (typeof record.error === 'string') return record.error
  if (typeof record.detail === 'string') return record.detail
  if (Array.isArray(record.detail)) {
    // FastAPI validation errors may echo sensitive data in input/ctx; keep msg only.
    return (
      record.detail
        .slice(0, 5)
        .flatMap((item) =>
          item && typeof item === 'object' && typeof item.msg === 'string'
            ? [item.msg.slice(0, 200)]
            : []
        )
        .join('; ') || undefined
    )
  }
  return undefined
}

export function providerFailure(result: ProviderResult): string {
  return `Higgsfield returned ${result.status}.${result.error ? ` ${result.error}` : ''}${result.correlation_id ? ` [correlation: ${result.correlation_id}]` : ''}`
}
