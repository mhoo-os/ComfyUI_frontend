import { readFileSync, readdirSync } from 'node:fs'

import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import {
  AttemptError,
  RefusedError,
  applyRepair,
  approveAttempt,
  caps,
  cancelAttempt,
  createAttempt,
  decideAttempt,
  getAttempt,
  listAttempts,
  repairAttempt,
  repairPlan,
  runAttempt,
  shotStates,
  spendSummary,
  submitAttempt,
  refreshAttempt,
  syncAttempt
} from './attempts'
import type {
  FilmEngine,
  JobState,
  RenderNode,
  ReviewReport,
  StepLike
} from './attempts'
import { createCut, cutGraph, listCuts } from './cuts'
import type { CutEngine, CutNode } from './cuts'
import example from './fixtures/shot-scene.example.json'
import { planGraph } from './graph'

// Runs attempt logic against a local D1 built from the migrations, with a fake
// engine: tests never reach a provider. Fixtures are generic: this repo is public.
let mf: Miniflare
let db: D1Database

const identity = 'mhoo-asset:0b0c7d1e-2f3a-4b5c-8d9e-0f1a2b3c4d5e:1'
const start = 'https://cdn.example.com/s01-start.png'
const readyScene = {
  ...example,
  shots: example.shots.map((shot) => ({
    ...shot,
    references: [
      { role: 'identity', asset: identity, approved: true },
      { role: 'start_frame', asset: start, approved: true }
    ]
  }))
}
const shotId = readyScene.shots[0].id

type Engine = FilmEngine & {
  submitted: RenderNode[]
  quotes: RenderNode[]
  state: JobState
  price: number | null
  refuse: boolean
  crash: boolean
}
function fakeEngine(): Engine {
  const engine: Engine = {
    submitted: [],
    quotes: [],
    state: { status: 'in_progress', output: null, error: null },
    price: 1.5,
    refuse: false,
    crash: false,
    async estimate(node) {
      engine.quotes.push(node)
      return engine.price === null
        ? { usd: null, credits: null, note: 'Priced per second.' }
        : { usd: engine.price, credits: '30', note: null }
    },
    async submit(node) {
      if (engine.refuse)
        throw new RefusedError('A workflow is already running.')
      if (engine.crash) throw new Error('Network lost.')
      engine.submitted.push(node)
      return '11111111-2222-4333-8444-555555555555'
    },
    async job() {
      return engine.state
    }
  }
  return engine
}

beforeAll(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default { fetch() { return new Response("") } }',
      compatibilityDate: '2026-09-24',
      d1Databases: ['FILM_DB']
    })
  )
  db = await mf.getD1Database('FILM_DB')
})
afterAll(() => mf.dispose())

beforeEach(async () => {
  await db.exec(
    'DROP TABLE IF EXISTS cuts; DROP TABLE IF EXISTS reviews; DROP TABLE IF EXISTS attempts; DROP TABLE IF EXISTS cast_members; DROP TABLE IF EXISTS episodes; DROP TABLE IF EXISTS scenes; DROP TABLE IF EXISTS documents; DROP TABLE IF EXISTS films;'
  )
  for (const file of readdirSync('cloudflare/migrations').sort()) {
    const statements = readFileSync(`cloudflare/migrations/${file}`, 'utf8')
      .replace(/--.*$/gmu, '')
      .split(';')
      .map((statement) => statement.trim())
      .filter(Boolean)
    for (const statement of statements) await db.prepare(statement).run()
  }
  await db.batch([
    db.prepare(
      "INSERT INTO films (id, title) VALUES ('example-film', 'Example')"
    ),
    db.prepare("INSERT INTO episodes VALUES ('example-film', 1, 'Episode 1')"),
    db
      .prepare(
        "INSERT INTO scenes (id, version, film_id, episode, title, spec) VALUES ('coffee-cart', 1, 'example-film', 1, 'Coffee cart', ?)"
      )
      .bind(JSON.stringify(readyScene))
  ])
})

const quoteShot = (engine: FilmEngine, target = 'kling-2.5-standard') =>
  createAttempt(db, engine, { sceneId: 'coffee-cart', shotId, target })

/** A stand-in for Cloudflare's WorkflowStep: runs steps inline, records names. */
function fakeStep(options: { approve: boolean }) {
  const names: string[] = []
  const step: StepLike = {
    async do(name, _config, fn) {
      names.push(name)
      return fn()
    },
    async sleep(name) {
      names.push(name)
    },
    async waitForEvent(name) {
      names.push(name)
      if (!options.approve) throw new Error('timed out')
      return { type: 'approve' }
    }
  }
  return { step, names }
}

const report = (overrides: Partial<ReviewReport> = {}): ReviewReport => ({
  status: 'flagged',
  flags: 2,
  measured: [
    { kind: 'still_stretch', at: 1, until: 3.5, note: 'Frozen for 2.5s.' }
  ],
  vision: {
    observations: [
      {
        criterion: 'Milk visibly pours into the cup',
        result: 'not_met',
        at: 2,
        note: 'No pour visible.'
      }
    ],
    face_visible: 'most_frames',
    reads_as: 'A person holding a jug.'
  },
  ...overrides
})

describe('quoting', () => {
  it('compiles and quotes the shot without submitting anything', async () => {
    const engine = fakeEngine()
    const attempt = await quoteShot(engine)
    expect(attempt).toMatchObject({
      status: 'quoted',
      number: 1,
      quote_usd: 1.5,
      scene_version: 1,
      target: 'kling-2.5-standard'
    })
    expect(engine.quotes).toHaveLength(1)
    expect(engine.submitted).toEqual([])
    expect(JSON.parse(attempt.request)).toMatchObject({
      class_type: 'HiggsfieldKlingDraft',
      inputs: { image_url: start }
    })
  })

  it('refuses a shot that is not ready, an unknown target and a second open attempt', async () => {
    const engine = fakeEngine()
    await db
      .prepare("UPDATE scenes SET spec = ? WHERE id = 'coffee-cart'")
      .bind(JSON.stringify(example))
      .run()
    await expect(quoteShot(engine)).rejects.toThrow(/not ready/)
    await db
      .prepare("UPDATE scenes SET spec = ? WHERE id = 'coffee-cart'")
      .bind(JSON.stringify(readyScene))
      .run()
    await expect(quoteShot(engine, 'nope')).rejects.toThrow(
      /Unknown render target/
    )
    await quoteShot(engine)
    await expect(quoteShot(engine)).rejects.toThrow(
      /already has an attempt waiting/
    )
  })
})

describe('approval and caps', () => {
  it('approves a quote once and never twice', async () => {
    const attempt = await quoteShot(fakeEngine())
    await expect(approveAttempt(db, attempt.id)).resolves.toMatchObject({
      status: 'approved'
    })
    await expect(approveAttempt(db, attempt.id)).rejects.toThrow(
      /not waiting for approval/
    )
  })

  it('refuses a quote with no dollar amount', async () => {
    const engine = fakeEngine()
    engine.price = null
    const attempt = await quoteShot(engine)
    await expect(approveAttempt(db, attempt.id)).rejects.toThrow(
      /no dollar amount/
    )
  })

  it(`refuses an approval that would take the shot past $${caps.shotUsd}`, async () => {
    const engine = fakeEngine()
    engine.price = 3
    const first = await quoteShot(engine)
    await approveAttempt(db, first.id)
    await db
      .prepare("UPDATE attempts SET status = 'rejected' WHERE id = ?")
      .bind(first.id)
      .run()
    const second = await quoteShot(engine)
    await expect(approveAttempt(db, second.id)).rejects.toThrow(/cross a cap/)
    expect((await getAttempt(db, second.id))?.status).toBe('quoted')
  })

  it(`refuses an approval that would take the episode past $${caps.episodeUsd}`, async () => {
    const engine = fakeEngine()
    await db
      .prepare(
        `INSERT INTO attempts (id, film_id, episode, scene_id, scene_version, shot_id, target, number, request, quote_usd, spend_usd, status)
         VALUES ('00000000-0000-4000-8000-000000000001', 'example-film', 1, 'coffee-cart', 1, 'other-shot', 'seedance-2.5', 1, '{}', 49, 49, 'accepted')`
      )
      .run()
    const attempt = await quoteShot(engine)
    await expect(approveAttempt(db, attempt.id)).rejects.toThrow(/cross a cap/)
  })

  it(`stops at ${caps.attemptsPerShot} attempts per shot; cancelled quotes don't count`, async () => {
    const engine = fakeEngine()
    engine.price = 0.5
    const cancelled = await quoteShot(engine)
    await cancelAttempt(db, cancelled.id)
    for (let i = 0; i < caps.attemptsPerShot; i++) {
      const attempt = await quoteShot(engine)
      expect(attempt.number).toBe(i + 1)
      await approveAttempt(db, attempt.id)
      await db
        .prepare("UPDATE attempts SET status = 'rejected' WHERE id = ?")
        .bind(attempt.id)
        .run()
    }
    await expect(quoteShot(engine)).rejects.toThrow(/used its 3 attempts/)
  })
})

describe('submission', () => {
  it('submits an approved attempt exactly once', async () => {
    const engine = fakeEngine()
    const attempt = await quoteShot(engine)
    expect(await submitAttempt(db, engine, attempt.id)).toBeNull()
    await approveAttempt(db, attempt.id)
    expect(await submitAttempt(db, engine, attempt.id)).toBe(
      '11111111-2222-4333-8444-555555555555'
    )
    expect(await submitAttempt(db, engine, attempt.id)).toBeNull()
    expect(engine.submitted).toHaveLength(1)
    expect((await getAttempt(db, attempt.id))?.status).toBe('rendering')
  })

  it('never submits a cancelled approval', async () => {
    const engine = fakeEngine()
    const attempt = await quoteShot(engine)
    await approveAttempt(db, attempt.id)
    await cancelAttempt(db, attempt.id)
    expect(await submitAttempt(db, engine, attempt.id)).toBeNull()
    expect(engine.submitted).toEqual([])
  })

  it('records a refusal as free and an unknown outcome as possibly spent', async () => {
    const engine = fakeEngine()
    engine.refuse = true
    const refused = await quoteShot(engine)
    await approveAttempt(db, refused.id)
    await submitAttempt(db, engine, refused.id)
    expect(await getAttempt(db, refused.id)).toMatchObject({
      status: 'failed',
      spendUsd: 0
    })
    expect((await spendSummary(db, 'example-film')).total).toBe(0)

    engine.refuse = false
    engine.crash = true
    const unknown = await quoteShot(engine)
    expect(unknown.number).toBe(1)
    await approveAttempt(db, unknown.id)
    await submitAttempt(db, engine, unknown.id)
    const failed = await getAttempt(db, unknown.id)
    expect(failed).toMatchObject({ status: 'failed', spendUsd: null })
    expect(failed?.error).toMatch(/outcome is unknown/)
    expect((await spendSummary(db, 'example-film')).total).toBe(1.5)
  })
})

describe('the render workflow', () => {
  it('waits for approval, submits once, tracks the job and stores the review', async () => {
    const engine = fakeEngine()
    const attempt = await quoteShot(engine)
    await approveAttempt(db, attempt.id)
    let checks = 0
    const tracked: FilmEngine = {
      ...engine,
      async job() {
        checks++
        return checks < 3
          ? { status: 'in_progress', output: null, error: null }
          : {
              status: 'completed',
              output: '11111111-2222-4333-8444-555555555555/1/0',
              error: null
            }
      }
    }
    const reviews: unknown[] = []
    const { step, names } = fakeStep({ approve: true })
    const result = await runAttempt(attempt.id, step, {
      db,
      engine: tracked,
      reviewer: async (input) => {
        reviews.push(input)
        return report()
      }
    })
    expect(result).toBe('reviewed')
    expect(names.filter((name) => name === 'submit')).toHaveLength(1)
    expect(engine.submitted).toHaveLength(1)
    expect(reviews).toEqual([
      {
        sceneId: 'coffee-cart',
        version: 1,
        shotId,
        output: '11111111-2222-4333-8444-555555555555/1/0'
      }
    ])
    const stored = await getAttempt(db, attempt.id)
    expect(stored).toMatchObject({
      status: 'reviewed',
      output: '11111111-2222-4333-8444-555555555555/1/0',
      spendUsd: 1.5
    })
    expect(stored?.review).toMatchObject({ status: 'flagged', flags: 2 })
    expect(await spendSummary(db, 'example-film')).toEqual({
      total: 1.5,
      currency: 'USD',
      receipts: 1
    })
    expect(
      (await shotStates(db, 'example-film')).get(`coffee-cart/${shotId}`)
    ).toBe('review')
  })

  it('expires an unapproved quote without submitting', async () => {
    const engine = fakeEngine()
    const attempt = await quoteShot(engine)
    const { step } = fakeStep({ approve: false })
    expect(
      await runAttempt(attempt.id, step, {
        db,
        engine,
        reviewer: async () => report()
      })
    ).toBe('cancelled')
    expect(engine.submitted).toEqual([])
    expect((await getAttempt(db, attempt.id))?.error).toMatch(/expired/)
  })

  it('records a failed render and keeps the quote as spend', async () => {
    const engine = fakeEngine()
    engine.state = {
      status: 'failed',
      output: null,
      error: 'Provider rejected the image.'
    }
    const attempt = await quoteShot(engine)
    await approveAttempt(db, attempt.id)
    const { step } = fakeStep({ approve: true })
    expect(
      await runAttempt(attempt.id, step, {
        db,
        engine,
        reviewer: async () => report()
      })
    ).toBe('failed')
    expect(await getAttempt(db, attempt.id)).toMatchObject({
      status: 'failed',
      spendUsd: 1.5,
      error: 'Provider rejected the image.'
    })
    expect(await syncAttempt(db, engine, attempt.id)).toBe('failed')
  })

  it('stores a review error instead of failing the attempt', async () => {
    const engine = fakeEngine()
    engine.state = {
      status: 'completed',
      output: '11111111-2222-4333-8444-555555555555/1/0',
      error: null
    }
    const attempt = await quoteShot(engine)
    await approveAttempt(db, attempt.id)
    const { step } = fakeStep({ approve: true })
    await runAttempt(attempt.id, step, {
      db,
      engine,
      reviewer: async () => {
        throw new Error('Frame analysis failed (500).')
      }
    })
    expect((await getAttempt(db, attempt.id))?.review).toMatchObject({
      status: 'error'
    })
  })
})

describe('owner decisions and repair', () => {
  async function reviewed(engine: Engine) {
    engine.state = {
      status: 'completed',
      output: '11111111-2222-4333-8444-555555555555/1/0',
      error: null
    }
    const attempt = await quoteShot(engine)
    await approveAttempt(db, attempt.id)
    await runAttempt(attempt.id, fakeStep({ approve: true }).step, {
      db,
      engine,
      reviewer: async () => report()
    })
    return attempt.id
  }

  it('accepting a take approves the shot and retires the previous accepted take', async () => {
    const engine = fakeEngine()
    const first = await reviewed(engine)
    await decideAttempt(db, first, 'accept')
    expect(
      (await shotStates(db, 'example-film')).get(`coffee-cart/${shotId}`)
    ).toBe('approved')
    const second = await reviewed(engine)
    expect(
      (await shotStates(db, 'example-film')).get(`coffee-cart/${shotId}`)
    ).toBe('approved')
    await decideAttempt(db, second, 'accept')
    expect((await getAttempt(db, first))?.status).toBe('rejected')
    expect((await getAttempt(db, second))?.status).toBe('accepted')
    await expect(decideAttempt(db, first, 'accept')).rejects.toThrow(
      /only a finished take/
    )
  })

  it('maps review defects and the owner note into a follow-up that still needs approval', async () => {
    const engine = fakeEngine()
    const first = await reviewed(engine)
    const next = await repairAttempt(db, engine, first, 'Slower pour, please.')
    expect(next).toMatchObject({
      status: 'quoted',
      number: 2,
      parent_id: first
    })
    const prompt = String(JSON.parse(next.request).inputs.prompt)
    expect(prompt).toMatch(/no frozen or stalled frames/)
    expect(prompt).toMatch(/Must: Milk visibly pours into the cup/)
    expect(prompt).toMatch(/Director's note: Slower pour, please\./)
    expect((await getAttempt(db, first))?.status).toBe('rejected')
    expect(engine.submitted).toHaveLength(1)
    expect(await listAttempts(db, 'coffee-cart', shotId)).toHaveLength(2)
  })

  it('refuses a repair with nothing to change', async () => {
    const engine = fakeEngine()
    engine.state = {
      status: 'completed',
      output: '11111111-2222-4333-8444-555555555555/1/0',
      error: null
    }
    const attempt = await quoteShot(engine)
    await approveAttempt(db, attempt.id)
    await runAttempt(attempt.id, fakeStep({ approve: true }).step, {
      db,
      engine,
      reviewer: async () =>
        report({
          status: 'no_flags',
          flags: 0,
          measured: [],
          vision: {
            observations: [],
            face_visible: 'most_frames',
            reads_as: 'ok'
          }
        })
    })
    await expect(repairAttempt(db, engine, attempt.id, null)).rejects.toThrow(
      /add a note/
    )
  })
})

describe('repair plan', () => {
  it('asks for a visible face when identity could not be checked', () => {
    const plan = repairPlan(
      report({
        measured: [],
        vision: { observations: [], face_visible: 'no_frames', reads_as: '' }
      }),
      null
    )
    expect(plan.fixes).toEqual([
      "Keep the person's face clearly visible and identical to the start frame."
    ])
  })

  it('keeps the prompt within the model limit', () => {
    const node = {
      class_type: 'HiggsfieldKlingDraft',
      inputs: { prompt: 'x'.repeat(2490), image_url: start }
    }
    const repaired = applyRepair(node, { note: 'y'.repeat(200), fixes: [] })
    expect(String(repaired.inputs.prompt)).toHaveLength(2500)
    expect(repaired.inputs.image_url).toBe(start)
  })
})

describe('episode cut', () => {
  const job = '11111111-2222-4333-8444-555555555555'
  async function acceptAll(engine: Engine) {
    for (const shot of readyScene.shots) {
      engine.state = { status: 'completed', output: `${job}/1/0`, error: null }
      const attempt = await createAttempt(db, engine, {
        sceneId: 'coffee-cart',
        shotId: shot.id,
        target: 'kling-2.5-standard'
      })
      await approveAttempt(db, attempt.id)
      await runAttempt(attempt.id, fakeStep({ approve: true }).step, {
        db,
        engine,
        reviewer: async () => report()
      })
      await decideAttempt(db, attempt.id, 'accept')
    }
  }
  function cutEngine() {
    const graphs: Record<string, CutNode>[] = []
    let state: JobState = { status: 'in_progress', output: null, error: null }
    const engine: CutEngine & {
      graphs: typeof graphs
      finish(value: JobState): void
    } = {
      graphs,
      finish(value) {
        state = value
      },
      async submitGraph(graph) {
        graphs.push(graph)
        return '99999999-2222-4333-8444-555555555555'
      },
      async job() {
        return state
      }
    }
    return engine
  }

  it('builds a finishing graph the job ledger accepts', () => {
    const { graph, exportNode } = cutGraph(
      [
        { shot: 'a', attempt: 'x', output: `${job}/1/0`, seconds: 5 },
        { shot: 'b', attempt: 'y', output: `${job}/1/0`, seconds: 40 }
      ],
      '9:16'
    )
    expect(exportNode).toBe('5')
    expect(graph['2'].inputs.duration).toBe(30)
    expect(() => planGraph(graph)).not.toThrow()
  })

  it('needs an accepted take for every shot', async () => {
    await expect(createCut(db, cutEngine(), 'coffee-cart')).rejects.toThrow(
      /needs a take accepted/
    )
  })

  it('renders the accepted takes in order and records the finished cut', async () => {
    await acceptAll(fakeEngine())
    const engine = cutEngine()
    const cut = await createCut(db, engine, 'coffee-cart')
    expect(cut).toMatchObject({
      status: 'rendering',
      takes: readyScene.shots.map((shot) =>
        expect.objectContaining({ shot: shot.id })
      )
    })
    expect(
      Object.values(engine.graphs[0]).map((node) => node.class_type)
    ).toContain('MhooExport')
    await expect(createCut(db, engine, 'coffee-cart')).rejects.toThrow(
      /already rendering/
    )
    engine.finish({
      status: 'completed',
      output: `99999999-2222-4333-8444-555555555555/${readyScene.shots.length + 3}/0`,
      error: null
    })
    const [done] = await listCuts(db, engine, 'coffee-cart')
    expect(done).toMatchObject({
      status: 'done',
      output: `99999999-2222-4333-8444-555555555555/${readyScene.shots.length + 3}/0`
    })
  })
})

describe('review fixes', () => {
  it('counts any submission error other than a refusal as possibly spent', async () => {
    const engine = fakeEngine()
    engine.submit = async () => {
      throw new AttemptError('HTTP 400 after the job was stored.')
    }
    const attempt = await quoteShot(engine)
    await approveAttempt(db, attempt.id)
    await submitAttempt(db, engine, attempt.id)
    expect(await getAttempt(db, attempt.id)).toMatchObject({
      status: 'failed',
      spendUsd: null
    })
    expect((await spendSummary(db, 'example-film')).total).toBe(1.5)
  })

  it('submits and records the job in separate steps, and survives a status outage', async () => {
    const engine = fakeEngine()
    const attempt = await quoteShot(engine)
    await approveAttempt(db, attempt.id)
    let reads = 0
    const flaky: FilmEngine = {
      ...engine,
      async job() {
        reads++
        if (reads <= 30) throw new Error('Status unavailable.')
        return {
          status: 'completed',
          output: '11111111-2222-4333-8444-555555555555/1/0',
          error: null
        }
      }
    }
    const names: string[] = []
    const step: StepLike = {
      async do(name, _config, fn) {
        names.push(name)
        return fn()
      },
      async sleep() {},
      async waitForEvent() {
        return { type: 'approve' }
      }
    }
    expect(
      await runAttempt(attempt.id, step, {
        db,
        engine: flaky,
        reviewer: async () => report()
      })
    ).toBe('rendering')
    expect(names.slice(0, 2)).toEqual(['submit', 'record-job'])
    const paused = await getAttempt(db, attempt.id)
    expect(paused).toMatchObject({
      status: 'rendering',
      job: '11111111-2222-4333-8444-555555555555'
    })
    expect(paused?.error).toMatch(/Check again/)
    await refreshAttempt(db, flaky, async () => report(), attempt.id)
    expect(await getAttempt(db, attempt.id)).toMatchObject({
      status: 'reviewed',
      error: null
    })
    expect(engine.submitted).toHaveLength(1)
  })

  it('cuts only use takes accepted against the current scene version', async () => {
    const engine = fakeEngine()
    engine.state = {
      status: 'completed',
      output: '11111111-2222-4333-8444-555555555555/1/0',
      error: null
    }
    for (const shot of readyScene.shots) {
      const attempt = await createAttempt(db, engine, {
        sceneId: 'coffee-cart',
        shotId: shot.id,
        target: 'kling-2.5-standard'
      })
      await approveAttempt(db, attempt.id)
      await runAttempt(attempt.id, fakeStep({ approve: true }).step, {
        db,
        engine,
        reviewer: async () => report()
      })
      await decideAttempt(db, attempt.id, 'accept')
    }
    await db
      .prepare(
        "INSERT INTO scenes (id, version, film_id, episode, title, spec) VALUES ('coffee-cart', 2, 'example-film', 1, 'Coffee cart', ?)"
      )
      .bind(JSON.stringify(readyScene))
      .run()
    const cutter: CutEngine = {
      submitGraph: async () => 'x',
      job: async () => engine.state
    }
    await expect(createCut(db, cutter, 'coffee-cart')).rejects.toThrow(
      /accepted for spec v2/
    )
  })
})
