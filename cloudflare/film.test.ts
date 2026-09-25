import { describe, expect, it } from 'vitest'

import example from './fixtures/shot-scene.example.json'
import { filmRoute, loadScene } from './film'

function database(rows: Record<string, unknown>[]) {
  const queries: unknown[][] = []
  const db = {
    prepare: () => ({
      bind: (...args: unknown[]) => {
        queries.push(args)
        return {
          first: async () => rows.find((row) => row.id === args[0]) ?? null
        }
      }
    })
  }
  return { db: db as unknown as D1Database, queries }
}

const row = (spec: unknown) => ({
  id: 'coffee-cart',
  version: 2,
  status: 'draft',
  spec: JSON.stringify(spec)
})

describe('film scene loading', () => {
  it('returns the validated scene with per-shot blockers', async () => {
    const { db, queries } = database([row(example)])
    const scene = await loadScene(db, 'coffee-cart')
    expect(queries).toEqual([['coffee-cart']])
    expect(scene).toMatchObject({ version: 2, valid: true })
    expect(scene?.valid && scene.readiness).toEqual([
      {
        shot: 's01-pour',
        blockers: [
          'Missing identity asset vendor-actor.',
          'Missing start_frame asset s01-pour-start.'
        ]
      },
      {
        shot: 's02-hand-off',
        blockers: [
          'Missing identity asset vendor-actor.',
          'Missing start_frame asset s02-hand-off-start.'
        ]
      }
    ])
  })

  it('reports stored specs that no longer validate', async () => {
    const broken = { ...example, shots: [{ ...example.shots[0], seed: 1 }] }
    const scene = await loadScene(database([row(broken)]).db, 'coffee-cart')
    expect(scene).toMatchObject({ valid: false })
    expect(scene?.valid === false && scene.issues.length).toBeGreaterThan(0)
  })

  it('routes only GET scene paths and 404s unknown scenes', async () => {
    const env = { FILM_DB: database([row(example)]).db } as Env
    const get = (path: string, method = 'GET') =>
      filmRoute(new Request('https://x', { method }), env, path)
    expect((await get('/film/scenes/coffee-cart'))?.status).toBe(200)
    expect((await get('/film/scenes/missing'))?.status).toBe(404)
    expect(await get('/film/scenes/coffee-cart', 'POST')).toBeNull()
    expect(await get('/film/scenes/../secrets')).toBeNull()
  })

  it('previews compiled requests per shot without submitting', async () => {
    const ready = {
      ...example,
      shots: [
        {
          ...example.shots[0],
          references: [
            {
              role: 'identity',
              asset: 'mhoo-asset:0b0c7d1e-2f3a-4b5c-8d9e-0f1a2b3c4d5e:1',
              approved: true
            },
            {
              role: 'start_frame',
              asset: 'https://cdn.example.com/s01.png',
              approved: true
            }
          ]
        },
        example.shots[1]
      ]
    }
    const env = { FILM_DB: database([row(ready)]).db } as Env
    const get = (target: string) =>
      filmRoute(
        new Request('https://x'),
        env,
        `/film/scenes/coffee-cart/compile/${target}`
      )
    const response = await get('seedance-2.5')
    const body = (await response?.json()) as {
      submitted: boolean
      shots: { shot: string; class_type?: string; error?: string }[]
    }
    expect(body.submitted).toBe(false)
    expect(body.shots[0]).toMatchObject({
      shot: 's01-pour',
      class_type: 'HiggsfieldAnimate'
    })
    expect(body.shots[1].error).toMatch(/not ready/)
    expect((await get('sora'))?.status).toBe(400)
  })
})
