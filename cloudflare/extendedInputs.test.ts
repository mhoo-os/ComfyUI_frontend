import { describe, expect, it } from 'vitest'

import { planGraph, resolveInputs } from './graph'
import { resolveFinishing } from './finishing'

const image = 'https://cdn.example.com/first.png'
const reference = 'mhoo-asset:00000000-0000-4000-8000-000000000000:1'
const video = 'https://cdn.example.com/motion.mp4'
const audio = 'https://cdn.example.com/voice.wav'

describe('Extended provider inputs', () => {
  it.for(['HiggsfieldCinemaStudio', 'HiggsfieldSeedanceReference'])(
    '%s preserves ordered references and accepts audio-only conditioning',
    (class_type) => {
      const { graph } = planGraph({
        shot: {
          class_type,
          inputs: {
            prompt: 'Follow the supplied references.',
            image_url: image,
            image_urls: `${reference}\nhttps://cdn.example.com/third.png`,
            video_url: video,
            video_urls: 'https://cdn.example.com/second.mp4',
            audio_urls: audio
          }
        }
      })
      expect(resolveInputs(graph.shot, {})).toMatchObject({
        image_urls: [image, reference, 'https://cdn.example.com/third.png'],
        video_urls: [video, 'https://cdn.example.com/second.mp4'],
        audio_urls: [audio]
      })
      const audioOnly = planGraph({
        shot: { class_type, inputs: { audio_urls: audio, prompt: 'Speak.' } }
      })
      expect(resolveInputs(audioOnly.graph.shot, {})).toMatchObject({
        audio_urls: [audio]
      })
    }
  )

  it('counts legacy image sockets toward the reference limit', () => {
    const inputs = {
      prompt: 'Use these references.',
      image_url: image,
      image_urls: Array.from({ length: 29 }, () => image).join('\n')
    }
    expect(
      resolveInputs({ class_type: 'HiggsfieldSeedanceReference', inputs }, {})
        .image_urls
    ).toHaveLength(30)
    expect(() =>
      planGraph({
        shot: {
          class_type: 'HiggsfieldSeedanceReference',
          inputs: { ...inputs, reference_image_url: image }
        }
      })
    ).toThrow('at most 30')
  })

  it.for([
    ['image_urls', 'https://localhost./private.png', 'public HTTPS'],
    ['video_urls', 'https://[::1]/clip.mp4', 'public HTTPS'],
    ['audio_urls', 'http://cdn.example.com/voice.wav', 'public HTTPS'],
    ['audio_urls', reference, 'only supported in image inputs'],
    ['video_urls', reference, 'only supported in image inputs'],
    [
      'audio_urls',
      Array.from({ length: 11 }, () => audio).join('\n'),
      'at most 10'
    ],
    [
      'video_urls',
      Array.from({ length: 11 }, () => video).join('\n'),
      'at most 10'
    ]
  ])('rejects invalid %s before submission', ([field, value, error]) => {
    expect(() =>
      planGraph({
        shot: {
          class_type: 'HiggsfieldSeedanceReference',
          inputs: { prompt: 'Follow references.', [field]: value }
        }
      })
    ).toThrow(error)
  })

  it('does not count an empty reference list as conditioning', () => {
    expect(() =>
      planGraph({
        shot: {
          class_type: 'HiggsfieldSeedanceReference',
          inputs: { prompt: 'Move.', audio_urls: '\n  \n' }
        }
      })
    ).toThrow('set one of')
  })

  it.for(['HiggsfieldKling3Pro', 'HiggsfieldKling3Standard'])(
    'sends %s custom timings without a conflicting top-level duration',
    (class_type) => {
      const shots = [
        { prompt: 'A wide shot.', duration: 4 },
        { prompt: 'Cut to the doorway.', duration: 3 }
      ]
      const { graph } = planGraph({
        shot: {
          class_type,
          inputs: {
            image_url: image,
            prompt: 'A visitor arrives.',
            multi_shots: true,
            multi_prompt: JSON.stringify(shots),
            duration: 5
          }
        }
      })
      expect(resolveInputs(graph.shot, {})).toMatchObject({
        multi_shots: true,
        multi_prompt: shots
      })
      expect(resolveInputs(graph.shot, {})).not.toHaveProperty('duration')
    }
  )

  it('keeps six fifteen-second custom shots without sending an invalid ninety-second scalar', () => {
    const shots = Array.from({ length: 6 }, () => ({
      prompt: 'A long take.',
      duration: 15
    }))
    const { graph } = planGraph({
      shot: {
        class_type: 'HiggsfieldKling3Pro',
        inputs: {
          prompt: 'A sequence.',
          image_url: image,
          multi_shots: true,
          multi_prompt: JSON.stringify(shots)
        }
      }
    })
    const body = resolveInputs(graph.shot, {})
    expect(body.multi_prompt).toEqual(shots)
    expect(body).not.toHaveProperty('duration')
  })

  it('preserves large account-owned element IDs without numeric rounding', () => {
    const { graph } = planGraph({
      shot: {
        class_type: 'HiggsfieldKling3Pro',
        inputs: {
          prompt: 'A scene.',
          image_url: image,
          elements: '12345678901234567890\n98765432109876543210'
        }
      }
    })
    expect(resolveInputs(graph.shot, {}).elements).toEqual([
      '12345678901234567890',
      '98765432109876543210'
    ])
    expect(() =>
      planGraph({
        shot: {
          ...graph.shot,
          inputs: { ...graph.shot.inputs, elements: 'arbitrary-id' }
        }
      })
    ).toThrow('decimal strings')
  })

  it('keeps automatic multi-shot mode without custom shots', () => {
    const { graph } = planGraph({
      shot: {
        class_type: 'HiggsfieldKling3Pro',
        inputs: {
          prompt: 'A scene.',
          image_url: image,
          multi_shots: true,
          multi_prompt: '[]',
          duration: 9
        }
      }
    })
    expect(resolveInputs(graph.shot, {})).toMatchObject({
      multi_shots: true,
      duration: 9
    })
    expect(resolveInputs(graph.shot, {})).not.toHaveProperty('multi_prompt')
  })

  it('exposes sixteen Marketing Studio references while preserving legacy inputs', () => {
    const inputs = {
      prompt: 'Match references.',
      image_url: image,
      image_urls: Array.from({ length: 15 }, () => image).join('\n')
    }
    expect(
      resolveInputs({ class_type: 'HiggsfieldCampaign', inputs }, {}).image_urls
    ).toHaveLength(16)
    expect(() =>
      planGraph({
        shot: {
          class_type: 'HiggsfieldCampaign',
          inputs: { ...inputs, reference_image_url: image }
        }
      })
    ).toThrow('at most 16')
  })

  it.for([
    ['not json', true, 'valid JSON'],
    ['[{"prompt":"Wide","duration":0}]', true, 'greater than or equal to 1'],
    ['[{"prompt":"Wide","duration":1.5}]', true, 'integer'],
    ['[{"prompt":"  ","duration":4}]', true, 'at least 1'],
    ['[{"prompt":"Wide","duration":4,"secret":"x"}]', true, 'Unrecognized key'],
    ['[{"prompt":"Wide","duration":4}]', false, 'Enable multi_shots'],
    [
      JSON.stringify(
        Array.from({ length: 7 }, () => ({ prompt: 'Cut.', duration: 1 }))
      ),
      true,
      'at most 6'
    ]
  ])(
    'rejects malformed or disabled custom shots',
    ([_shots, enabled, error]) => {
      expect(() =>
        planGraph({
          shot: {
            class_type: 'HiggsfieldKling3Pro',
            inputs: {
              prompt: 'Scene.',
              image_url: image,
              multi_shots: enabled,
              multi_prompt: _shots
            }
          }
        })
      ).toThrow(String(error))
    }
  )
})

describe('Video generation to finishing', () => {
  it.for([
    ['HiggsfieldKlingDraft', {}],
    ['HiggsfieldKling3Standard', {}],
    ['HiggsfieldKling3Pro', {}],
    ['HiggsfieldKlingO3FirstLast', {}],
    ['HiggsfieldKling3MotionControl', { video_url: video }],
    ['HiggsfieldMotionTransfer', { video_url: video }],
    ['HiggsfieldCinemaStudio', {}],
    ['HiggsfieldSeedanceReference', {}]
  ] as const)(
    'accepts an archived %s output as a clip',
    ([class_type, extraInputs]) => {
      const inputs = { prompt: 'Move.', image_url: image, ...extraInputs }
      const { graph, order } = planGraph({
        source: { class_type, inputs },
        clip: {
          class_type: 'MhooClip',
          inputs: { video_url: ['source', 0], duration: 3 }
        }
      })
      expect(order).toEqual(['source', 'clip'])
      expect(
        resolveFinishing(
          graph.clip,
          {},
          {
            source: [
              {
                kind: 'video',
                url: video,
                storageKey:
                  'outputs/00000000-0000-4000-8000-000000000000/source/0'
              }
            ]
          }
        )
      ).toMatchObject({
        duration: 3,
        source:
          'mhoo-media:outputs/00000000-0000-4000-8000-000000000000/source/0'
      })
      expect(() =>
        resolveFinishing(
          graph.clip,
          {},
          { source: [{ kind: 'video', url: video }] }
        )
      ).toThrow('finish archiving')
    }
  )

  it('still rejects an image output wired into a clip', () => {
    expect(() =>
      planGraph({
        source: {
          class_type: 'HiggsfieldSoul',
          inputs: { prompt: 'Portrait.' }
        },
        clip: { class_type: 'MhooClip', inputs: { video_url: ['source', 0] } }
      })
    ).toThrow('Clip requires a video output')
  })
})
