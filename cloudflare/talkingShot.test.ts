import { describe, expect, it } from 'vitest'

import { planGraph, resolveInputs } from './graph'
import { compileTalkingShot } from './talkingShot'

const shot = {
  scene: 'A neon street trader holds a glowing chip.',
  dialogue: 'Your next idea starts here.',
  duration: 5
}

describe('talking-shot request compilation', () => {
  it('preserves exact dialogue and emits only verified Seedance fields', () => {
    const { graph } = planGraph({
      '1': { class_type: 'HiggsfieldTalkingShot', inputs: shot }
    })
    const payload = resolveInputs(graph['1'], {})
    expect(payload).toEqual({
      prompt: expect.stringContaining(JSON.stringify(shot.dialogue)),
      duration: 5,
      aspect_ratio: '16:9',
      resolution: '720p',
      bitrate_mode: 'high',
      output_format: 'mp4',
      generate_audio: true
    })
    expect(payload).not.toHaveProperty('scene')
    expect(payload).not.toHaveProperty('dialogue')
  })
  it.for([
    { ...shot, camera_roll_360: true },
    { ...shot, lip_sync_emotion_intensity: 0.9 },
    { ...shot, dialogue: '' },
    { ...shot, duration: 0 },
    { ...shot, dialogue: 'too many words '.repeat(20) }
  ])(
    'rejects invalid or unsupported requests before generation: %j',
    (value) => {
      expect(() => compileTalkingShot(value)).toThrow()
    }
  )
})
