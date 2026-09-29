import { describe, expect, it } from 'vitest'

import type { Graph } from './graph'
import { endpointFor, nodeDefinitions, planGraph, resolveInputs } from './graph'

const still = 'https://cdn.example.com/character.png'
const second = 'https://cdn.example.com/character-side.png'
const end = 'https://cdn.example.com/end.png'
const clip = 'https://cdn.example.com/motion.mp4'
const token = 'mhoo-asset:00000000-0000-4000-8000-000000000000:1'

function resolve(class_type: string, inputs: Graph[string]['inputs']) {
  const plan = planGraph({ shot: { class_type, inputs } })
  const node = plan.graph.shot
  return { endpoint: endpointFor(node), body: resolveInputs(node, {}) }
}

type Case = {
  node: string
  inputs: Graph[string]['inputs']
  endpoint: string
  body: Record<string, unknown>
}

describe('Video input and motion target submission boundary', () => {
  it.for<Case>([
    {
      node: 'HiggsfieldKling3MotionControl',
      inputs: { image_url: still, video_url: clip },
      endpoint: 'kling-video/v3/motion-control/std',
      body: {
        image_url: still,
        video_url: clip,
        character_orientation: 'video',
        keep_original_sound: 'yes'
      }
    },
    {
      node: 'HiggsfieldKling3MotionControl',
      inputs: {
        mode: 'pro',
        prompt: 'Keep the jacket colour.',
        image_url: still,
        video_url: clip,
        character_orientation: 'image',
        keep_original_sound: 'no'
      },
      endpoint: 'kling-video/v3/motion-control/pro',
      body: {
        prompt: 'Keep the jacket colour.',
        image_url: still,
        video_url: clip,
        character_orientation: 'image',
        keep_original_sound: 'no'
      }
    },
    {
      node: 'HiggsfieldMotionTransfer',
      inputs: {
        video_url: clip,
        image_url: still,
        reference_image_url: second,
        resolution: '480p'
      },
      endpoint: 'higgsfield/genjutsu/motion-transfer/v1.0',
      body: { video_url: clip, image_urls: [still, second], resolution: '480p' }
    },
    {
      node: 'HiggsfieldKling3Pro',
      inputs: {
        prompt: 'A slow push in.',
        image_url: still,
        end_image_url: end,
        duration: 12
      },
      endpoint: 'kling-video/v3.0/pro/image-to-video',
      body: {
        prompt: 'A slow push in.',
        image_url: still,
        last_image_url: end,
        duration: 12,
        cfg_scale: 0.5,
        sound: 'off',
        multi_shots: false
      }
    },
    {
      node: 'HiggsfieldKlingO3FirstLast',
      inputs: {
        prompt: 'The door opens.',
        image_url: still,
        end_image_url: end,
        mode: '4k'
      },
      endpoint: 'kling-video/o3/first-last-frame',
      body: {
        prompt: 'The door opens.',
        first_frame_url: still,
        last_frame_url: end,
        mode: '4k',
        duration: 5,
        sound: 'off'
      }
    },
    {
      node: 'HiggsfieldKlingO3FirstLast',
      inputs: {
        prompt: 'The door opens.',
        image_url: still,
        aspect_ratio: '9:16'
      },
      endpoint: 'kling-video/o3/first-last-frame',
      body: {
        prompt: 'The door opens.',
        first_frame_url: still,
        mode: 'std',
        duration: 5,
        aspect_ratio: '9:16',
        sound: 'off'
      }
    },
    {
      node: 'HiggsfieldCinemaStudio',
      inputs: { prompt: 'A wide shot of a harbour at dusk.' },
      endpoint: 'higgsfield/cinema-studio/4.0',
      body: {
        prompt: 'A wide shot of a harbour at dusk.',
        duration: 5,
        resolution: '720p',
        aspect_ratio: '16:9',
        generate_audio: false
      }
    },
    {
      node: 'HiggsfieldCinemaStudio',
      inputs: {
        prompt: '<<<image_1>>> walks through <<<video_1>>>.',
        image_url: still,
        reference_image_url: second,
        video_url: clip,
        camera_movement: 'dolly-in',
        camera_model: '35mm-film',
        genre: 'noir',
        color_palette: 'after-dark',
        duration: 8
      },
      endpoint: 'higgsfield/cinema-studio/4.0',
      body: {
        prompt: '<<<image_1>>> walks through <<<video_1>>>.',
        image_urls: [still, second],
        video_urls: [clip],
        duration: 8,
        resolution: '720p',
        aspect_ratio: '16:9',
        camera_movement: 'dolly-in',
        camera_model: '35mm-film',
        genre: 'noir',
        color_palette: 'after-dark',
        generate_audio: false
      }
    },
    {
      node: 'HiggsfieldSeedanceReference',
      inputs: {
        prompt: 'Match the reference motion.',
        image_url: still,
        video_url: clip
      },
      endpoint: 'bytedance/seedance-2.5/reference-to-video',
      body: {
        prompt: 'Match the reference motion.',
        image_urls: [still],
        video_urls: [clip],
        duration: 5,
        resolution: '720p',
        aspect_ratio: '16:9',
        bitrate_mode: 'high',
        generate_audio: false
      }
    },
    {
      node: 'HiggsfieldSeedanceReference',
      inputs: { prompt: 'Follow this motion.', video_url: clip },
      endpoint: 'bytedance/seedance-2.5/reference-to-video',
      body: {
        prompt: 'Follow this motion.',
        video_urls: [clip],
        duration: 5,
        resolution: '720p',
        aspect_ratio: '16:9',
        bitrate_mode: 'high',
        generate_audio: false
      }
    },
    {
      node: 'HiggsfieldKling3MotionControl',
      inputs: { mode: '', image_url: still, video_url: clip },
      endpoint: 'kling-video/v3/motion-control/std',
      body: {
        image_url: still,
        video_url: clip,
        character_orientation: 'video',
        keep_original_sound: 'yes'
      }
    }
  ])(
    '$node resolves to the documented provider request',
    ({ node, inputs, endpoint, body }) => {
      expect(nodeDefinitions()[node].output_name).toEqual(['video_url'])
      expect(resolve(node, inputs)).toEqual({ endpoint, body })
    }
  )

  it('shows creative controls as provider-chosen until set and never sends "auto"', () => {
    expect(
      nodeDefinitions().HiggsfieldCinemaStudio.input.required
    ).toMatchObject({
      camera_movement: [expect.arrayContaining(['auto']), { default: 'auto' }]
    })
    const { body } = resolve('HiggsfieldCinemaStudio', {
      prompt: 'A harbour.',
      camera_movement: 'auto',
      era: 'auto'
    })
    expect(body).not.toHaveProperty('camera_movement')
    expect(body).not.toHaveProperty('era')
  })

  it.for([
    [
      'HiggsfieldKling3MotionControl',
      { image_url: still },
      'video_url is required'
    ],
    [
      'HiggsfieldKling3MotionControl',
      { image_url: still, video_url: clip, mode: '4k' },
      'Unsupported mode'
    ],
    [
      'HiggsfieldKling3MotionControl',
      { image_url: still, video_url: clip, keep_original_sound: true },
      'must be text'
    ],
    [
      'HiggsfieldKling3MotionControl',
      { image_url: still, video_url: clip, character_orientation: 'auto' },
      'Unsupported character_orientation'
    ],
    [
      'HiggsfieldKling3MotionControl',
      { image_url: still, video_url: 'http://cdn.example.com/motion.mp4' },
      'public HTTPS'
    ],
    [
      'HiggsfieldKling3MotionControl',
      { image_url: still, video_url: 'https://127.0.0.1/motion.mp4' },
      'public HTTPS'
    ],
    [
      'HiggsfieldKling3MotionControl',
      { image_url: still, video_url: token },
      'only supported in image inputs'
    ],
    [
      'HiggsfieldKling3MotionControl',
      { image_url: still, video_url: clip, duration: 5 },
      'Unsupported input'
    ],
    ['HiggsfieldMotionTransfer', { video_url: clip }, 'image_url is required'],
    [
      'HiggsfieldMotionTransfer',
      { video_url: clip, image_url: still, resolution: '1080p' },
      'Unsupported resolution'
    ],
    ['HiggsfieldKling3Pro', { image_url: still }, 'prompt is required'],
    [
      'HiggsfieldKling3Pro',
      { prompt: 'x', image_url: still, duration: 16 },
      'outside the supported range'
    ],
    [
      'HiggsfieldKling3Pro',
      { prompt: 'x', image_url: still, cfg_scale: 1.5 },
      'outside the supported range'
    ],
    [
      'HiggsfieldKling3Pro',
      { prompt: 'x', image_url: still, sound: 'yes' },
      'Unsupported sound'
    ],
    [
      'HiggsfieldKling3Pro',
      { prompt: 'x'.repeat(2501), image_url: still },
      'too long'
    ],
    [
      'HiggsfieldKling3Pro',
      { prompt: 'x', image_url: still, multi_prompt: 'not-json' },
      'valid JSON'
    ],
    [
      'HiggsfieldKlingO3FirstLast',
      { prompt: 'x', image_url: still, mode: 'turbo' },
      'Unsupported mode'
    ],
    [
      'HiggsfieldKlingO3FirstLast',
      { prompt: 'x', image_url: still, duration: 2 },
      'outside the supported range'
    ],
    [
      'HiggsfieldKlingO3FirstLast',
      { prompt: 'x', image_url: still, aspect_ratio: '4:3' },
      'Unsupported aspect_ratio'
    ],
    [
      'HiggsfieldCinemaStudio',
      { prompt: 'x', camera_movement: 'zoom' },
      'Unsupported camera_movement'
    ],
    [
      'HiggsfieldCinemaStudio',
      { prompt: 'x', duration: 31 },
      'outside the supported range'
    ],
    [
      'HiggsfieldCinemaStudio',
      { prompt: 'x', video_url: 'ftp://cdn.example.com/a.mp4' },
      'public HTTPS'
    ],
    [
      'HiggsfieldCinemaStudio',
      { prompt: 'x', audio_url: clip },
      'Unsupported input'
    ],
    [
      'HiggsfieldSeedanceReference',
      { prompt: 'x' },
      'set one of image_url, reference_image_url, video_url'
    ],
    [
      'HiggsfieldKling3MotionControl',
      { image_url: still, video_url: 'https://[fd00::1]/motion.mp4' },
      'public HTTPS'
    ],
    [
      'HiggsfieldKling3MotionControl',
      { image_url: still, video_url: 'https://[fe80::1]/motion.mp4' },
      'public HTTPS'
    ],
    [
      'HiggsfieldKling3MotionControl',
      { image_url: still, video_url: 'https://localhost./motion.mp4' },
      'public HTTPS'
    ],
    [
      'HiggsfieldKling3MotionControl',
      { image_url: still, video_url: 'https://media.localhost/motion.mp4' },
      'public HTTPS'
    ],
    [
      'HiggsfieldKling3MotionControl',
      { image_url: still, video_url: 'https://0x7f.1/motion.mp4' },
      'public HTTPS'
    ],
    [
      'HiggsfieldSeedanceReference',
      { image_url: still, duration: 3 },
      'outside the supported range'
    ]
  ] as const)('rejects %s %j before submission', ([node, inputs, message]) => {
    expect(() => resolve(node, inputs)).toThrow(message)
  })

  it('links a generated video into video_url and an image into image inputs', () => {
    const plan = planGraph({
      still: { class_type: 'HiggsfieldSoul', inputs: { prompt: 'A portrait' } },
      source: {
        class_type: 'HiggsfieldVideo',
        inputs: { prompt: 'A person dancing' }
      },
      move: {
        class_type: 'HiggsfieldKling3MotionControl',
        inputs: { image_url: ['still', 0], video_url: ['source', 0] }
      }
    })
    expect(plan.order.indexOf('move')).toBe(2)
    expect(
      resolveInputs(plan.graph.move, {
        still: [{ url: still, kind: 'image' }],
        source: [{ url: clip, kind: 'video' }]
      })
    ).toMatchObject({ image_url: still, video_url: clip })
  })

  it('rejects an image output linked into video_url', () => {
    expect(() =>
      planGraph({
        source: {
          class_type: 'HiggsfieldSoul',
          inputs: { prompt: 'A portrait' }
        },
        move: {
          class_type: 'HiggsfieldMotionTransfer',
          inputs: { image_url: still, video_url: ['source', 0] }
        }
      })
    ).toThrow('Video input requires a video output')
  })

  it('rejects a video output linked into an image input', () => {
    expect(() =>
      planGraph({
        source: {
          class_type: 'HiggsfieldVideo',
          inputs: { prompt: 'A person dancing' }
        },
        move: {
          class_type: 'HiggsfieldMotionTransfer',
          inputs: { image_url: ['source', 0], video_url: clip }
        }
      })
    ).toThrow('Image input requires an image output')
  })

  it('never links into an endpoint-selecting input', () => {
    expect(() =>
      planGraph({
        text: { class_type: 'HiggsfieldSoul', inputs: { prompt: 'x' } },
        move: {
          class_type: 'HiggsfieldKling3MotionControl',
          inputs: { image_url: still, video_url: clip, mode: ['text', 0] }
        }
      })
    ).toThrow('Connect URLs only')
  })
})

describe('Kling O3 image-reference contracts', () => {
  it('combines reference sockets and lists while keeping first and last frames distinct', () => {
    expect(
      resolve('HiggsfieldKlingO3Reference', {
        prompt: 'A traveller enters.',
        image_url: still,
        end_image_url: end,
        reference_image_url: second,
        image_urls: token,
        mode: 'pro'
      })
    ).toEqual({
      endpoint: 'kling-video/o3/image-reference',
      body: {
        prompt: 'A traveller enters.',
        first_frame_url: still,
        last_frame_url: end,
        image_urls: [second, token],
        mode: 'pro',
        duration: 5,
        sound: 'off',
        multi_shots: false,
        shot_type: 'customize'
      }
    })
  })

  it('allows a single shot without optional references', () => {
    expect(
      resolve('HiggsfieldKlingO3Reference', { prompt: 'A mountain lake' }).body
    ).toMatchObject({
      prompt: 'A mountain lake',
      duration: 5,
      multi_shots: false
    })
  })

  it.for<Graph[string]['inputs']>([
    { prompt: '   ' },
    { prompt: 'x'.repeat(2501) },
    { prompt: 'x', multi_shots: true },
    {
      prompt: 'x',
      multi_shots: true,
      shot_type: 'intelligent',
      multi_prompt: '[]'
    },
    {
      prompt: 'x',
      multi_shots: true,
      multi_prompt: '[{"prompt":"x","duration":0}]'
    },
    { prompt: 'x', multi_prompt: '[{"prompt":"x","duration":3}]' }
  ])(
    'rejects invalid O3 prompts and shot controls %j before execution',
    (inputs) => {
      expect(() => resolve('HiggsfieldKlingO3Reference', inputs)).toThrow()
    }
  )
})
