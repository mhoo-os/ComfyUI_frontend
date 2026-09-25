import { describe, expect, it } from 'vitest'

import { planGraph, resolveInputs } from './graph'
import { resultMedia, resultSchema } from './provider'

const image = {
  class_type: 'HiggsfieldSoul',
  inputs: { prompt: 'A mountain lake' }
}
describe('Higgsfield workflow boundary', () => {
  it('preserves ordered campaign references and legacy single-image inputs', () => {
    const inputs = {
      prompt: 'Edit eyes',
      image_url: 'https://cdn.example.com/actor.png'
    }
    const node = { class_type: 'HiggsfieldCampaign', inputs }
    expect(resolveInputs(node, {}).image_urls).toEqual([inputs.image_url])
    const plan = planGraph({
      actor: image,
      edit: {
        ...node,
        inputs: { ...inputs, reference_image_url: ['actor', 0] }
      }
    })
    expect(
      resolveInputs(plan.graph.edit, {
        actor: [{ url: 'https://cdn.example.com/eyes.png', kind: 'image' }]
      }).image_urls
    ).toEqual([inputs.image_url, 'https://cdn.example.com/eyes.png'])
    expect(() =>
      planGraph({
        edit: {
          ...node,
          inputs: {
            ...inputs,
            reference_image_url: 'http://localhost/private.png'
          }
        }
      })
    ).toThrow('public HTTPS')
  })
  it('orders connected image generation before animation and resolves the returned URL', () => {
    const animation = {
      class_type: 'HiggsfieldAnimate',
      inputs: { image_url: ['2', 0], prompt: 'Slow pan' }
    }
    const plan = planGraph({ '1': animation, '2': image })
    expect(plan.order).toEqual(['2', '1'])
    expect(
      resolveInputs(plan.graph['1'], {
        '2': [{ url: 'https://cdn.example.com/result.png', kind: 'image' }]
      })
    ).toMatchObject({
      image_url: 'https://cdn.example.com/result.png',
      prompt: 'Slow pan',
      duration: 5
    })
  })
  it.for([
    [{}, 'between one and 32'],
    [{ '1': { class_type: 'KSampler', inputs: {} } }, 'Unsupported node'],
    [{ '1': { ...image, inputs: { prompt: '' } } }, 'prompt is required'],
    [
      { '1': { ...image, inputs: { prompt: 'Lake', batch_size: 100 } } },
      'Unsupported batch_size'
    ],
    [
      {
        '1': {
          class_type: 'HiggsfieldVideo',
          inputs: { prompt: 'Lake', duration: 999 }
        }
      },
      'outside the supported range'
    ],
    [
      {
        '1': {
          class_type: 'HiggsfieldAnimate',
          inputs: { image_url: 'http://localhost/image.png' }
        }
      },
      'public HTTPS'
    ],
    [{ '1': { ...image, inputs: { prompt: ['1', 0] } } }, 'cycle'],
    [{ '1': { ...image, inputs: { prompt: ['2', 1] } }, '2': image }, 'slot 0'],
    [
      { '1': { ...image, inputs: { prompt: 'Lake', arbitrary: 'value' } } },
      'Unsupported input'
    ]
  ])(
    'rejects unsupported workflows before any provider submission (%j)',
    ([graph, message]) => {
      expect(() => planGraph(graph)).toThrow(message)
    }
  )
  it('keeps all completed image outputs and rejects non-HTTPS provider media', () => {
    const result = resultSchema.parse({
      request_id: '2bf4de45-6926-4b44-bd5a-62d6e72537b1',
      status: 'completed',
      images: [
        { url: 'https://cdn.example.com/one.png' },
        { url: 'https://cdn.example.com/two.png' }
      ]
    })
    expect(resultMedia(result)).toEqual([
      { url: 'https://cdn.example.com/one.png', kind: 'image' },
      { url: 'https://cdn.example.com/two.png', kind: 'image' }
    ])
    expect(
      resultSchema.safeParse({
        ...result,
        images: [{ url: 'javascript:alert(1)' }]
      }).success
    ).toBe(false)
  })
})

it('rejects oversized connected timelines before generation can start', () => {
  const graph: Record<string, unknown> = {
    source: { class_type: 'HiggsfieldVideo', inputs: { prompt: 'Coffee' } },
    sequence: {
      class_type: 'MhooSequence',
      inputs: {
        clip_1: ['c1', 0],
        clip_2: ['c2', 0],
        clip_3: ['c3', 0],
        clip_4: ['c4', 0],
        clip_5: ['c5', 0]
      }
    },
    compose: {
      class_type: 'MhooCompose',
      inputs: { sequence: ['sequence', 0] }
    },
    export: { class_type: 'MhooExport', inputs: { edit: ['compose', 0] } }
  }
  for (let i = 1; i <= 5; i++)
    graph[`c${i}`] = {
      class_type: 'MhooClip',
      inputs: { video_url: ['source', 0], duration: 30 }
    }
  expect(() => planGraph(graph)).toThrow('Timeline must be at most 120 seconds')
})

describe('Soul V2 character conditioning', () => {
  it('passes a completed reference UUID and rejects zero strength', () => {
    const node = {
      class_type: 'HiggsfieldSoul',
      inputs: {
        prompt: 'Portrait',
        custom_reference_id: '12345678-1234-4234-8234-123456789abc',
        custom_reference_strength: 0.8
      }
    }
    expect(resolveInputs(node, {})).toMatchObject(node.inputs)
    expect(() =>
      resolveInputs(
        { ...node, inputs: { ...node.inputs, custom_reference_strength: 0 } },
        {}
      )
    ).toThrow()
    expect(() =>
      resolveInputs(
        {
          ...node,
          inputs: {
            ...node.inputs,
            custom_reference_id: 'invented-character-id'
          }
        },
        {}
      )
    ).toThrow()
  })
  it('omits an empty reference ID for unconditioned generations', () => {
    expect(
      resolveInputs(
        {
          class_type: 'HiggsfieldSoul',
          inputs: { prompt: 'Landscape', custom_reference_id: '' }
        },
        {}
      )
    ).not.toHaveProperty('custom_reference_id')
  })
})
