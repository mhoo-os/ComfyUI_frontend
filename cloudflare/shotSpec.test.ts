import { describe, expect, it } from 'vitest'

import example from './fixtures/shot-scene.example.json'
import {
  directingNotes,
  renderBlockers,
  sceneSpecSchema,
  shotSpecSchema
} from './shotSpec'

const scene = sceneSpecSchema.parse(example)
const base = example.shots[0]

describe('shot spec', () => {
  it('accepts the example fixture and fills defaults', () => {
    expect(scene.shots).toHaveLength(2)
    expect(scene.shots.every((shot) => shot.noBrandRender)).toBe(true)
    expect(scene.shots[1].camera.movement).toBe('static')
  })

  it.for([
    ['unknown fields', { ...base, seed: 7 }],
    ['beats longer than the shot', { ...base, duration: 4 }],
    [
      'no action beat',
      {
        ...base,
        beats: base.beats.map((beat) => ({ ...beat, kind: 'hold' }))
      }
    ],
    [
      'staged detail labelled as fact',
      { ...base, truth: { ...base.truth, kind: 'fact' } }
    ],
    [
      'staged shot without a staged note',
      { ...base, truth: { kind: 'staged', facts: [], staged: [] } }
    ],
    [
      'fast narration',
      { ...base, sound: { ...base.sound, vo: { text: 'word '.repeat(16) } } }
    ],
    [
      'overlay after the end',
      { ...base, overlays: [{ kind: 'caption', text: 'x', atSeconds: 9 }] }
    ],
    ['self callback', { ...base, callbackTo: base.id }],
    [
      'invented media ids',
      { ...base, references: [{ role: 'identity', asset: 'soul-ref-123' }] }
    ]
  ] as const)('rejects %s', ([, value]) => {
    expect(shotSpecSchema.safeParse(value).success).toBe(false)
  })

  it('rejects duplicate shot ids in a scene', () => {
    const shots = [example.shots[0], example.shots[0]]
    expect(sceneSpecSchema.safeParse({ ...example, shots }).success).toBe(false)
  })
})

describe('render readiness', () => {
  it('blocks every fixture shot until real references exist', () => {
    for (const shot of scene.shots)
      expect(renderBlockers(shot).length).toBeGreaterThan(0)
  })

  it('requires approval for identity and start frames only', () => {
    const shot = shotSpecSchema.parse({
      ...base,
      references: [
        { role: 'identity', asset: 'mhoo-media:refs/moo.png', approved: true },
        { role: 'start_frame', asset: 'mhoo-media:frames/s01.png' },
        { role: 'style', asset: 'https://example.com/style.png' }
      ]
    })
    expect(renderBlockers(shot)).toEqual([
      'The start_frame reference needs owner approval.'
    ])
  })

  it('flags cast without an identity reference', () => {
    const shot = shotSpecSchema.parse({ ...base, references: [] })
    expect(renderBlockers(shot)).toContain(
      'A cast member appears without an identity reference.'
    )
  })
})

describe('directing notes', () => {
  it('advises on missing anticipation and finishing overlays', () => {
    expect(directingNotes(scene.shots[1])).toContain(
      'No anticipation beat: the action may read as abrupt.'
    )
    expect(directingNotes(scene.shots[0])).toEqual([
      'Overlays are added in finishing; keep them out of the prompt.'
    ])
  })
})
