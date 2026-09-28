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

const kling3 = {
  prompt: 'A person crosses the room and sits down.',
  image_url: 'https://cdn.example.com/room.png',
  end_image_url: 'https://cdn.example.com/room-end.png',
  duration: 8,
  sound: 'off'
}

describe('Kling 3.0 Standard submission boundary', () => {
  it('exposes the node and sends the end frame as last_image_url', () => {
    const plan = planGraph({
      shot: { class_type: 'HiggsfieldKling3Standard', inputs: kling3 }
    })
    expect(models.HiggsfieldKling3Standard.endpoint).toBe(
      'kling-video/v3.0/std/image-to-video'
    )
    expect(nodeDefinitions().HiggsfieldKling3Standard.output_name).toEqual([
      'video_url'
    ])
    expect(resolveInputs(plan.graph.shot, {})).toEqual({
      prompt: kling3.prompt,
      image_url: kling3.image_url,
      last_image_url: kling3.end_image_url,
      duration: 8,
      cfg_scale: 0.5,
      sound: 'off'
    })
  })

  it('never bills generated sound unless it is switched on', () => {
    const plan = planGraph({
      shot: {
        class_type: 'HiggsfieldKling3Standard',
        inputs: { image_url: kling3.image_url }
      }
    })
    expect(resolveInputs(plan.graph.shot, {})).toMatchObject({
      duration: 5,
      sound: 'off'
    })
  })

  it.for([
    { duration: 2 },
    { duration: 16 },
    { duration: 5.5 },
    { cfg_scale: 1.1 },
    { image_url: '' },
    { sound: 'loud' },
    { negative_prompt: 'blur' },
    { generate_audio: true }
  ])('rejects unsupported request fields before submission: %j', (changes) => {
    expect(() =>
      planGraph({
        shot: {
          class_type: 'HiggsfieldKling3Standard',
          inputs: { ...kling3, ...changes }
        }
      })
    ).toThrow()
  })
})
