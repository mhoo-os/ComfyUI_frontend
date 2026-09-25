import { describe, expect, it } from 'vitest'

import { compileShot } from './compilers'
import example from './fixtures/shot-scene.example.json'
import { shotSpecSchema } from './shotSpec'

const identity = 'mhoo-asset:0b0c7d1e-2f3a-4b5c-8d9e-0f1a2b3c4d5e:1'
const start = 'https://cdn.example.com/s01-start.png'

function ready(changes: Record<string, unknown> = {}) {
  return shotSpecSchema.parse({
    ...example.shots[0],
    references: [
      { role: 'identity', asset: identity, approved: true },
      { role: 'start_frame', asset: start, approved: true }
    ],
    continuity: ['Cup stays in the right hand.'],
    ...changes
  })
}

describe('Kling 2.5 Standard compiler', () => {
  it('emits concise action and camera wording within the verified contract', () => {
    const compiled = compileShot(ready(), 'kling-2.5-standard')
    expect(compiled.class_type).toBe('HiggsfieldKlingDraft')
    expect(compiled.inputs).toEqual({
      prompt:
        'Tilts the jug over the cup. Pours a steady ribbon of milk. Glances up, pleased. Medium shot, eye level, locked-off static camera. Keep the look of the starting image.',
      image_url: start,
      duration: 5,
      cfg_scale: 0.5,
      negative_prompt:
        'logos, brand names, readable text, extra limbs, distorted hands'
    })
  })

  it('rounds up to the next supported duration and rejects longer shots', () => {
    const beats = [{ kind: 'action', performance: 'Pours.', seconds: 7 }]
    expect(
      compileShot(ready({ beats, duration: 7 }), 'kling-2.5-standard').inputs
        .duration
    ).toBe(10)
    expect(() =>
      compileShot(ready({ beats, duration: 12 }), 'kling-2.5-standard')
    ).toThrow('at most 10 seconds')
  })

  it('notes an end frame it cannot use', () => {
    const shot = ready({
      references: [
        { role: 'identity', asset: identity, approved: true },
        { role: 'start_frame', asset: start, approved: true },
        { role: 'end_frame', asset: 'https://cdn.example.com/end.png' }
      ]
    })
    const compiled = compileShot(shot, 'kling-2.5-standard')
    expect(compiled.inputs).not.toHaveProperty('end_image_url')
    expect(compiled.notes[0]).toMatch(/End frame ignored/)
  })
})

describe('Seedance 2.5 compiler', () => {
  it('emits timed beats, camera intent and continuity without finishing text', () => {
    const compiled = compileShot(ready(), 'seedance-2.5')
    expect(compiled.class_type).toBe('HiggsfieldAnimate')
    expect(compiled.inputs).toMatchObject({
      image_url: start,
      duration: 5,
      resolution: '720p',
      generate_audio: false
    })
    const prompt = String(compiled.inputs.prompt)
    expect(prompt).toContain(
      '0-1.5s (anticipation): Tilts the jug over the cup.'
    )
    expect(prompt).toContain(
      '1.5-3.5s (action): Pours a steady ribbon of milk.'
    )
    expect(prompt).toContain('Keep consistent: Cup stays in the right hand.')
    expect(prompt).not.toContain('PSSHH')
    expect(prompt).not.toContain('Every morning starts here')
    expect(prompt).not.toContain('staged')
  })

  it('passes an end frame and respects the four-second minimum', () => {
    const shot = ready({
      beats: [{ kind: 'action', performance: 'Pours.', seconds: 2.5 }],
      duration: 3,
      references: [
        { role: 'identity', asset: identity, approved: true },
        { role: 'start_frame', asset: start, approved: true },
        { role: 'end_frame', asset: 'https://cdn.example.com/end.png' }
      ]
    })
    expect(compileShot(shot, 'seedance-2.5').inputs).toMatchObject({
      duration: 4,
      end_image_url: 'https://cdn.example.com/end.png'
    })
  })
})

describe('compile gate', () => {
  it.for([
    ['pending references', { references: example.shots[0].references }],
    [
      'an unapproved start frame',
      {
        references: [
          { role: 'identity', asset: identity, approved: true },
          { role: 'start_frame', asset: start }
        ]
      }
    ],
    [
      'no start frame',
      {
        references: [{ role: 'identity', asset: identity, approved: true }]
      }
    ],
    [
      'archived media without a provider URL',
      {
        references: [
          { role: 'identity', asset: identity, approved: true },
          {
            role: 'start_frame',
            asset: 'mhoo-media:uploads/abc',
            approved: true
          }
        ]
      }
    ]
  ] as const)('refuses to compile with %s', ([, changes]) => {
    for (const target of ['kling-2.5-standard', 'seedance-2.5'] as const)
      expect(() => compileShot(ready(changes), target)).toThrow()
  })
})
