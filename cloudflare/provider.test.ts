import { describe, expect, it, vi } from 'vitest'
import { provider, providerFailure, resultSchema } from './provider'

const requestId = '2bf4de45-6926-4b44-bd5a-62d6e72537b1'
const env = {
  HF_CREDENTIALS: { get: async () => 'test-id:test-secret' }
} as Env

describe('Provider diagnostics', () => {
  it('retains terminal errors and the response correlation header, redacting secrets and URLs', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json(
          {
            request_id: requestId,
            status: 'failed',
            error:
              'Could not fetch https://private.example/image?token=abc using test-secret',
            correlation_id: 'untrusted-body-id'
          },
          { headers: { 'X-Correlation-ID': 'trace-123' } }
        )
      )
    )
    const result = resultSchema.parse(
      await provider(env, `requests/${requestId}/status`)
    )
    expect(providerFailure(result)).toBe(
      'Higgsfield returned failed. Could not fetch [URL redacted] using [redacted] [correlation: trace-123]'
    )
  })

  it('keeps malformed optional diagnostics from breaking terminal status parsing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          request_id: requestId,
          status: 'failed',
          error: { input: 'private' }
        })
      )
    )
    const result = resultSchema.parse(
      await provider(env, `requests/${requestId}/status`)
    )
    expect(providerFailure(result)).toBe('Higgsfield returned failed.')
  })

  it('keeps only validation messages and redacts echoed prompt and credentials', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json(
          {
            detail: [
              {
                msg: 'Invalid private prompt test-id:test-secret',
                input: 'do not disclose',
                ctx: { secret: 'hidden' }
              }
            ]
          },
          { status: 422, headers: { 'X-Correlation-ID': 'trace-422' } }
        )
      )
    )
    await expect(
      provider(env, 'model', { prompt: 'private prompt' })
    ).rejects.toThrow(
      'Higgsfield returned HTTP 422. Invalid [input redacted] [redacted] [correlation: trace-422]'
    )
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it.for(['not json', JSON.stringify({ detail: 'x'.repeat(20000) })])(
    'falls back to HTTP status for malformed or oversized errors',
    async (body) => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => new Response(body, { status: 503 }))
      )
      await expect(provider(env, 'model', { prompt: 'test' })).rejects.toThrow(
        'Higgsfield returned HTTP 503. Requests are not automatically resubmitted.'
      )
      expect(fetch).toHaveBeenCalledTimes(1)
    }
  )

  it('caps saved diagnostic text', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          request_id: requestId,
          status: 'failed',
          error: 'x'.repeat(2000)
        })
      )
    )
    expect(
      resultSchema.parse(await provider(env, 'status')).error
    ).toHaveLength(1000)
  })
})
