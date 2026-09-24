import { describe, expect, it } from 'vitest'

import { planGraph, resolveInputs } from './graph'
import { resultMedia, resultSchema } from './provider'

const image = {
  class_type: 'HiggsfieldSoul',
  inputs: { prompt: 'A mountain lake' }
}
describe('Higgsfield workflow boundary', () => {
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
    [{}, 'between one and eight'],
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
