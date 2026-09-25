import { describe, expect, it, vi } from 'vitest'

import { expandShot, routeShot } from './planner'

const env = {
  PLANNER_GATEWAY_URL:
    'https://gateway.ai.cloudflare.com/v1/faca04363f6ba617faedaae7d3493769/default' as const,
  PLANNER_GATEWAY_AUTH: { get: async () => 'gateway-test-only' }
}
const shot = {
  scene: 'A trader holds a chip.',
  dialogue: 'Your next idea starts here.',
  duration: 5
}

describe('planner gateway contracts', () => {
  it('uses the requested BYOK route and does not send a provider authorization header', async () => {
    const request = vi.fn(async (url: string, options: RequestInit) => {
      expect(url).toBe(
        `${env.PLANNER_GATEWAY_URL}/custom-typesafe/v1/systemone`
      )
      expect(options.headers).toMatchObject({
        'cf-aig-byok-alias': 'default',
        'cf-aig-max-attempts': '1'
      })
      expect(options.headers).not.toHaveProperty('Authorization')
      return Response.json({
        answers: {
          route: { type: 'choice', choice: 'single_speaker', confidence: 0.9 }
        }
      })
    })
    vi.stubGlobal('fetch', request)
    expect(await routeShot(env, shot)).toMatchObject({
      route: 'single_speaker',
      confidence: 0.9
    })
    expect(request).toHaveBeenCalledTimes(1)
  })
  it.for(['multiple_speakers', 'unsupported'])(
    'stops unsupported routing %s',
    async (choice) => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () =>
          Response.json({
            answers: { route: { type: 'choice', choice, confidence: 0.99 } }
          })
        )
      )
      await expect(routeShot(env, shot)).rejects.toThrow('needs review')
    }
  )
  it('rejects low-confidence routing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          answers: {
            route: { type: 'choice', choice: 'single_speaker', confidence: 0.4 }
          }
        })
      )
    )
    await expect(routeShot(env, shot)).rejects.toThrow('needs review')
  })
  it('uses Astra Responses structured output and returns only a creative scene', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, options: RequestInit) => {
        expect(url).toBe(
          `${env.PLANNER_GATEWAY_URL}/custom-codex-lb/v1/responses`
        )
        const body: unknown = JSON.parse(String(options.body))
        expect(body).toMatchObject({
          model: 'gpt-6-astra',
          text: { format: { strict: true } }
        })
        return Response.json({
          status: 'completed',
          output: [
            {
              type: 'message',
              content: [
                {
                  type: 'output_text',
                  text: JSON.stringify({
                    scene:
                      'A steady medium close-up of the trader under amber neon.'
                  })
                }
              ]
            }
          ]
        })
      })
    )
    expect(await expandShot(env, shot)).toMatchObject({
      scene: 'A steady medium close-up of the trader under amber neon.',
      model: 'gpt-6-astra'
    })
  })
  it.for([
    { status: 'incomplete', output: [] },
    {
      status: 'completed',
      output: [{ type: 'message', content: [{ type: 'refusal' }] }]
    },
    {
      status: 'completed',
      output: [
        {
          type: 'message',
          content: [
            {
              type: 'output_text',
              text: '{"scene":"Trader","camera_roll_360":true}'
            }
          ]
        }
      ]
    }
  ])(
    'rejects incomplete, refused or extra-field Astra output',
    async (result) => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => Response.json(result))
      )
      await expect(expandShot(env, shot)).rejects.toThrow()
    }
  )
})
