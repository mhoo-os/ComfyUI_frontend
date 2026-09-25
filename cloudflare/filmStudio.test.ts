import { readFileSync, readdirSync } from 'node:fs'

import { build } from 'esbuild'
import { SignJWT, exportJWK, generateKeyPair } from 'jose'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'

import example from './fixtures/shot-scene.example.json'

// Runs the real Worker (Access check, same-origin rule, routing) against a
// local D1 built from the migrations. Fixtures are generic: this repo is public.
const origin = 'https://mhoo.test'
const base = `${origin}/00/comfy/api/film`
const keyPair = await generateKeyPair('RS256')
const jwks = {
  keys: [{ ...(await exportJWK(keyPair.publicKey)), kid: 'test', alg: 'RS256' }]
}
const token = (email: string) =>
  new SignJWT({ email })
    .setProtectedHeader({ alg: 'RS256', kid: 'test' })
    .setIssuer('https://mhoo.cloudflareaccess.com')
    .setAudience('test-aud')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(keyPair.privateKey)

let mf: Miniflare
let owner: string
let stranger: string

beforeAll(async () => {
  const bundle = await build({
    entryPoints: ['cloudflare/worker.ts'],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    external: ['cloudflare:workers'],
    target: 'es2022'
  })
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: bundle.outputFiles[0].text,
      compatibilityDate: '2026-09-24',
      compatibilityFlags: ['nodejs_compat'],
      d1Databases: ['FILM_DB'],
      bindings: {
        ACCESS_TEAM_DOMAIN: 'https://mhoo.cloudflareaccess.com',
        ACCESS_AUD: 'test-aud',
        OWNER_EMAIL: 'owner@example.com'
      },
      outboundService: () => Response.json(jwks)
    })
  )
  owner = await token('owner@example.com')
  stranger = await token('someone@example.com')
  return () => mf.dispose()
})

beforeEach(async () => {
  const db = await mf.getD1Database('FILM_DB')
  await db.exec(
    'DROP TABLE IF EXISTS cast_members; DROP TABLE IF EXISTS episodes; DROP TABLE IF EXISTS scenes; DROP TABLE IF EXISTS documents; DROP TABLE IF EXISTS films;'
  )
  for (const file of readdirSync('cloudflare/migrations').sort()) {
    const sql = readFileSync(`cloudflare/migrations/${file}`, 'utf8')
      .replace(/--.*$/gmu, '')
      .split(';')
      .map((statement) => statement.trim())
      .filter(Boolean)
    for (const statement of sql) await db.prepare(statement).run()
  }
  const episodes = Array.from({ length: 8 }, (_, index) =>
    db
      .prepare('INSERT INTO episodes VALUES (?, ?, ?)')
      .bind('example-film', index + 1, `Episode ${index + 1}`)
  )
  const member = (
    id: string,
    kind: string,
    sourceRef: string | null,
    status = 'draft'
  ) =>
    db
      .prepare(
        'INSERT INTO cast_members (id, film_id, name, kind, episodes, source_ref, status) VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
      .bind(id, 'example-film', id, kind, '[1]', sourceRef, status)
  await db.batch([
    db.prepare(
      "INSERT INTO films (id, title) VALUES ('example-film', 'Example')"
    ),
    ...episodes,
    db
      .prepare(
        "INSERT INTO scenes (id, version, film_id, episode, title, spec) VALUES ('coffee-cart', 1, 'example-film', 1, 'Coffee cart', ?)"
      )
      .bind(JSON.stringify(example)),
    member(
      'anchor-young',
      'anchor',
      'mhoo-media:outputs/job-1/9/0',
      'approved'
    ),
    member('era-city', 'era_look', null),
    member('friend', 'supporting', null)
  ])
})

const call = (
  path: string,
  options: {
    method?: string
    body?: unknown
    as?: string | null
    from?: string | null
  } = {}
) => {
  const headers: Record<string, string> = {}
  const auth = options.as === undefined ? owner : options.as
  if (auth) headers['cf-access-jwt-assertion'] = auth
  const from = options.from === undefined ? origin : options.from
  if (from) headers.origin = from
  return mf.dispatchFetch(`${base}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  })
}
/** Parses a response body instead of asserting its type. */
const read = async <T extends z.ZodTypeAny>(
  response: { json(): Promise<unknown> },
  schema: T
): Promise<z.infer<T>> => schema.parse(await response.json())
const castSchema = z.object({
  cast: z.array(z.object({ id: z.string(), status: z.string() }))
})

describe('film overview', () => {
  it('lists every episode with its breakdown state and zero spend', async () => {
    const response = await call('/films/example-film')
    expect(response.status).toBe(200)
    const film = await read(
      response,
      z.object({
        spend: z.object({ total: z.number(), receipts: z.number() }),
        episodes: z.array(
          z.object({
            status: z.string(),
            scene: z.string().nullable(),
            shots: z.array(z.object({ status: z.string() }))
          })
        )
      })
    )
    expect(film.spend).toMatchObject({ total: 0, receipts: 0 })
    expect(film.episodes).toHaveLength(8)
    expect(film.episodes[0]).toMatchObject({
      status: 'broken_down',
      scene: 'coffee-cart'
    })
    expect(film.episodes[0].shots.map((shot) => shot.status)).toEqual([
      'blocked',
      'blocked'
    ])
    expect(
      film.episodes
        .slice(1)
        .every((episode) => episode.status === 'not_broken_down')
    ).toBe(true)
    expect((await call('/films/missing')).status).toBe(404)
  })

  it('refuses anyone but the owner', async () => {
    expect((await call('/films/example-film', { as: null })).status).toBe(403)
    expect((await call('/films/example-film', { as: stranger })).status).toBe(
      403
    )
  })
})

describe('cast', () => {
  it('lists anchors, then era looks, then supporting cast', async () => {
    const response = await call('/films/example-film/cast')
    const { cast } = await read(response, castSchema)
    expect(cast.map((member) => member.id)).toEqual([
      'anchor-young',
      'era-city',
      'friend'
    ])
    expect((await call('/films/missing/cast')).status).toBe(404)
  })

  it.for([
    { case: 'no source', body: {}, error: /needs a source image/ },
    {
      case: 'unsupported source',
      body: { sourceRef: 'https://example.com/a.png' },
      error: /sourceRef/
    },
    { case: 'unknown field', body: { status: 'approved' }, error: /sourceRef/ }
  ])('rejects approving an era look with $case', async ({ body, error }) => {
    const response = await call('/cast/era-city/approve', {
      method: 'POST',
      body
    })
    expect(response.status).toBe(400)
    const { error: message } = await read(
      response,
      z.object({ error: z.string() })
    )
    expect(message).toMatch(error)
  })

  it('approves with a source, then revokes', async () => {
    const sourceRef = 'mhoo-asset:0b0c7d1e-2f3a-4b5c-8d9e-0f1a2b3c4d5e:1'
    const approved = await call('/cast/era-city/approve', {
      method: 'POST',
      body: { sourceRef }
    })
    expect(approved.status).toBe(200)
    expect(await approved.json()).toMatchObject({
      status: 'approved',
      sourceRef
    })
    const revoked = await call('/cast/era-city/revoke', { method: 'POST' })
    expect(await revoked.json()).toMatchObject({
      status: 'revoked',
      approvedAt: null,
      sourceRef
    })
    expect(
      (await call('/cast/nobody/approve', { method: 'POST', body: {} })).status
    ).toBe(404)
  })

  it('keeps a newer source when a later approval sends none', async () => {
    const replacement = 'mhoo-media:outputs/job-2/4/1'
    await call('/cast/anchor-young/approve', {
      method: 'POST',
      body: { sourceRef: replacement }
    })
    const again = await call('/cast/anchor-young/approve', {
      method: 'POST',
      body: {}
    })
    expect(await again.json()).toMatchObject({
      status: 'approved',
      sourceRef: replacement
    })
  })

  it.for([
    { case: 'no origin', from: null, as: undefined },
    { case: 'another origin', from: 'https://evil.test', as: undefined },
    { case: 'a non-owner', from: undefined, as: 'stranger' }
  ])('refuses cast changes from $case', async ({ from, as }) => {
    const response = await call('/cast/anchor-young/revoke', {
      method: 'POST',
      from,
      as: as === 'stranger' ? stranger : undefined
    })
    expect(response.status).toBe(403)
    const { cast } = await read(
      await call('/films/example-film/cast'),
      castSchema
    )
    expect(cast.find((member) => member.id === 'anchor-young')?.status).toBe(
      'approved'
    )
  })
})

describe('scene versions', () => {
  const approvedRefs = [
    {
      role: 'identity',
      asset: 'mhoo-asset:0b0c7d1e-2f3a-4b5c-8d9e-0f1a2b3c4d5e:1',
      approved: true
    },
    { role: 'start_frame', asset: 'pending:s01-pour-start' }
  ]
  const next = {
    ...example,
    shots: [{ ...example.shots[0], references: approvedRefs }, example.shots[1]]
  }

  it('adds a new version and never changes the old one', async () => {
    const first = await call('/scenes/coffee-cart/versions', {
      method: 'POST',
      body: next
    })
    expect(first.status).toBe(201)
    expect(await first.json()).toEqual({ id: 'coffee-cart', version: 2 })
    const second = await call('/scenes/coffee-cart/versions', {
      method: 'POST',
      body: next
    })
    expect(await second.json()).toEqual({ id: 'coffee-cart', version: 3 })
    const db = await mf.getD1Database('FILM_DB')
    const v1 = await db
      .prepare('SELECT spec FROM scenes WHERE id = ? AND version = 1')
      .bind('coffee-cart')
      .first<{ spec: string }>()
    expect(JSON.parse(v1?.spec ?? '{}')).toEqual(example)
  })

  it('shows only the remaining start-frame blocker once identity is approved', async () => {
    await call('/scenes/coffee-cart/versions', { method: 'POST', body: next })
    const scene = await read(
      await call('/scenes/coffee-cart'),
      z.object({
        version: z.number(),
        readiness: z.array(z.object({ blockers: z.array(z.string()) }))
      })
    )
    expect(scene.version).toBe(2)
    expect(scene.readiness[0].blockers).toEqual([
      'Missing start_frame asset s01-pour-start.'
    ])
  })

  it.for([
    {
      case: 'an invalid spec',
      path: 'coffee-cart',
      body: { ...example, shots: [] },
      status: 400
    },
    {
      case: 'a mismatched id',
      path: 'other-scene',
      body: example,
      status: 400
    },
    {
      case: 'an unknown film',
      path: 'coffee-cart',
      body: { ...example, film: 'no-film' },
      status: 404
    }
  ])('rejects $case', async ({ path, body, status }) => {
    expect(
      (await call(`/scenes/${path}/versions`, { method: 'POST', body })).status
    ).toBe(status)
  })

  it.for([
    {
      case: 'move to another episode',
      path: 'coffee-cart',
      body: { ...example, episode: 2 },
      status: 409,
      error: /can't move it/
    },
    {
      case: 'add a second scene to an episode',
      path: 'second-cart',
      body: { ...example, id: 'second-cart' },
      status: 409,
      error: /already has a scene/
    },
    {
      case: 'use an episode that does not exist',
      path: 'late-cart',
      body: { ...example, id: 'late-cart', episode: 99 },
      status: 404,
      error: /Episode 99/
    }
  ])('refuses to $case', async ({ path, body, status, error }) => {
    const response = await call(`/scenes/${path}/versions`, {
      method: 'POST',
      body
    })
    expect(response.status).toBe(status)
    expect(
      (await read(response, z.object({ error: z.string() }))).error
    ).toMatch(error)
    const film = await read(
      await call('/films/example-film'),
      z.object({
        episodes: z.array(
          z.object({ status: z.string(), scene: z.string().nullable() })
        )
      })
    )
    expect(film.episodes.map((episode) => episode.scene)).toEqual([
      'coffee-cart',
      ...Array(7).fill(null)
    ])
  })

  it('refuses a cross-origin save', async () => {
    const response = await call('/scenes/coffee-cart/versions', {
      method: 'POST',
      body: next,
      from: 'https://evil.test'
    })
    expect(response.status).toBe(403)
  })
})
