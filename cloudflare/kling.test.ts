import { describe, expect, it } from 'vitest'

import { models, nodeDefinitions, planGraph, resolveInputs } from './graph'

const inputs = {
  prompt: 'The student walks toward the desk.',
  image_url: 'https://cdn.example.com/classroom.png',
  duration: 10
}

describe('Kling draft submission boundary', () => {
  it('exposes the node and compiles a provider-ready request', () => {
    const plan = planGraph({
      shot: { class_type: 'HiggsfieldKlingDraft', inputs }
    })
    expect(models.HiggsfieldKlingDraft.endpoint).toBe(
      'kling-video/v2.5-turbo/standard/image-to-video'
    )
    expect(nodeDefinitions().HiggsfieldKlingDraft.output_name).toEqual([
      'video_url'
    ])
    expect(resolveInputs(plan.graph.shot, {})).toEqual({
      ...inputs,
      cfg_scale: 0.5
    })
  })

  it.for([
    { duration: 15 },
    { cfg_scale: 1.1 },
    { image_url: '' },
    { generate_audio: true },
    { end_image_url: 'https://cdn.example.com/end.png' }
  ])('rejects unsupported request fields before submission: %j', (changes) => {
    expect(() =>
      planGraph({
        shot: {
          class_type: 'HiggsfieldKlingDraft',
          inputs: { ...inputs, ...changes }
        }
      })
    ).toThrow()
  })
})
