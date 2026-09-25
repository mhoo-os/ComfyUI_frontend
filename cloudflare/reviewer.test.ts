import { describe, expect, it } from 'vitest'

import example from './fixtures/shot-scene.example.json'
import {
  measuredDefects,
  parseVision,
  reviewRequestSchema,
  summarize,
  visionRequest
} from './reviewer'
import type { Analysis } from './reviewer'
import { shotSpecSchema } from './shotSpec'

const shot = shotSpecSchema.parse(example.shots[0])
const held = shotSpecSchema.parse(example.shots[1])

function clip(
  duration: number,
  motionAt: (t: number) => number,
  warmthAt: (t: number) => number = () => 0.2
): Analysis {
  const samples = Array.from({ length: duration * 8 + 1 }, (_, i) => {
    const t = i / 8
    const warmth = warmthAt(t)
    return {
      t,
      r: 0.5 + warmth / 2,
      g: 0.5,
      b: 0.5 - warmth / 2,
      luma: 0.5,
      motion: i ? motionAt(t) : 0
    }
  })
  return {
    duration,
    samples,
    keyframes: [0, 2.5, 5].map((t) => ({ t, jpeg: 'AAAA' }))
  }
}

const kinds = (analysis: Analysis, spec = shot) =>
  measuredDefects(spec, analysis).map((defect) => defect.kind)

describe('measured checks', () => {
  it('passes a clip that moves through its beats in one colour', () => {
    expect(kinds(clip(5, (t) => (t >= 1.5 && t < 3.5 ? 0.05 : 0.02)))).toEqual(
      []
    )
  })

  it.for([
    [
      'color_drift',
      clip(
        5,
        () => 0.02,
        (t) => (t < 3 ? 0.25 : -0.1)
      )
    ],
    ['still_stretch', clip(5, (t) => (t < 3 ? 0.001 : 0.05))],
    ['missed_action', clip(5, (t) => (t >= 1.5 && t < 3.5 ? 0.005 : 0.05))],
    ['duration_mismatch', clip(10, () => 0.02)]
  ] as const)('flags %s', ([kind, analysis]) => {
    expect(kinds(analysis)).toContain(kind)
  })

  it('flags a hold beat that is still moving at the end', () => {
    expect(
      kinds(
        clip(5, (t) => (t > 4 ? 0.09 : 0.02)),
        held
      )
    ).toContain('no_ending_hold')
  })

  it('scales beat windows to a longer clip', () => {
    const defects = measuredDefects(
      shot,
      clip(10, (t) => (t >= 3 && t < 7 ? 0.005 : 0.05))
    )
    const missed = defects.find((defect) => defect.kind === 'missed_action')
    expect(missed).toMatchObject({ at: 3, until: 7 })
  })
})

describe('vision request', () => {
  it('sends every keyframe with the checklist and a strict schema', () => {
    const body = visionRequest(
      shot,
      clip(5, () => 0.02)
    )
    const content = body.input[0].content
    expect(content.filter((part) => part.type === 'input_image')).toHaveLength(
      3
    )
    const checklist = JSON.parse(String(content[0].text)).checklist as string[]
    expect(checklist).toContain('The pour reads clearly.')
    expect(checklist.join(' ')).not.toContain('Every morning starts here')
    expect(body.text.format.strict).toBe(true)
  })

  it('parses structured output and rejects refusals', () => {
    const review = {
      observations: [{ criterion: 'x', result: 'not_met', at: 2.5, note: 'y' }],
      face_visible: 'no_frames',
      reads_as: 'z'
    }
    const message = (content: unknown[]) => ({
      output: [{ type: 'message', content }]
    })
    expect(
      parseVision(
        message([{ type: 'output_text', text: JSON.stringify(review) }])
      )
    ).toEqual(review)
    expect(() =>
      parseVision(message([{ type: 'refusal', text: 'no' }]))
    ).toThrow()
  })
})

describe('summary', () => {
  it('never approves, and flags an unverifiable identity', () => {
    const vision = {
      observations: [],
      face_visible: 'no_frames' as const,
      reads_as: ''
    }
    expect(summarize([], vision)).toMatchObject({
      status: 'flagged',
      approved: false
    })
    expect(summarize([], { error: 'down' })).toMatchObject({
      status: 'no_flags',
      approved: false
    })
  })
})

describe('review request', () => {
  it.for([
    { sceneId: 'coffee-cart', shotId: 's01-pour', output: '../etc/passwd' },
    {
      sceneId: 'coffee-cart',
      shotId: 's01-pour',
      output: 'ccf9fa35-d991-4fbe-8c58-7bbd89eaa9b9/1/0',
      count: 40
    },
    {
      sceneId: 'Coffee',
      shotId: 's01-pour',
      output: 'ccf9fa35-d991-4fbe-8c58-7bbd89eaa9b9/1/0'
    }
  ])('rejects %j', (value) => {
    expect(reviewRequestSchema.safeParse(value).success).toBe(false)
  })
})
