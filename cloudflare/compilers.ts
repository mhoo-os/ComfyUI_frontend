import { planGraph, resolveInputs } from './graph'
import type { Input } from './graph'
import { renderBlockers } from './shotSpec'
import type { ShotSpec } from './shotSpec'

/** Compiles a shot spec into one graph node that passes the same validation
 * as a canvas run. VO, overlays and truth labels stay out of prompts. */

export const compileTargets = ['kling-2.5-standard', 'seedance-2.5'] as const
export type CompileTarget = (typeof compileTargets)[number]
export const isCompileTarget = (value: string): value is CompileTarget =>
  compileTargets.some((target) => target === value)

export type CompiledShot = {
  shot: string
  target: CompileTarget
  class_type: string
  inputs: Input
  notes: string[]
}

const cameraWords = {
  size: {
    extreme_wide: 'extreme wide shot',
    wide: 'wide shot',
    medium: 'medium shot',
    medium_close: 'medium close-up',
    close: 'close-up',
    extreme_close: 'extreme close-up',
    insert: 'insert shot'
  },
  height: {
    low: 'low angle',
    eye: 'eye level',
    high: 'high angle',
    overhead: 'overhead'
  },
  movement: {
    static: 'locked-off static camera',
    push_in: 'slow push in',
    pull_out: 'slow pull out',
    pan: 'smooth pan',
    tilt: 'smooth tilt',
    track: 'tracking camera',
    handheld: 'subtle handheld camera'
  }
} as const

function camera(shot: ShotSpec) {
  const { size, height, movement } = shot.camera
  return `${cameraWords.size[size]}, ${cameraWords.height[height]}, ${cameraWords.movement[movement]}`
}

function frame(shot: ShotSpec, role: 'start_frame' | 'end_frame') {
  const ref = shot.references.find((item) => item.role === role)
  if (!ref) return undefined
  if (ref.asset.startsWith('mhoo-media:'))
    throw new Error(
      `${shot.id}: ${role} is archived media; supply its provider URL or a character-library token.`
    )
  return ref.asset
}

function sentence(text: string) {
  const trimmed = text.trim()
  const capital = trimmed.charAt(0).toUpperCase() + trimmed.slice(1)
  return /[.!?…]$/u.test(capital) ? capital : `${capital}.`
}

function avoid(shot: ShotSpec) {
  return [
    ...shot.forbidden,
    ...(shot.noBrandRender ? ['logos', 'brand names', 'readable text'] : []),
    'extra limbs',
    'distorted hands'
  ]
}

/** Kling 2.5 Turbo Standard: concise action + camera; the start frame carries
 * appearance and style. No end frame or audio on this endpoint. */
function kling(shot: ShotSpec, image: string) {
  if (shot.duration > 10)
    throw new Error(
      `${shot.id}: Kling 2.5 Standard renders at most 10 seconds.`
    )
  const notes: string[] = []
  if (frame(shot, 'end_frame'))
    notes.push('End frame ignored: this Kling endpoint has no end-image input.')
  const actions = shot.beats.map((beat) => sentence(beat.performance))
  const prompt = [
    ...actions,
    `${sentence(camera(shot))}`,
    'Keep the look of the starting image.'
  ].join(' ')
  return {
    class_type: 'HiggsfieldKlingDraft',
    inputs: {
      prompt,
      image_url: image,
      duration: shot.duration <= 5 ? 5 : 10,
      negative_prompt: avoid(shot).join(', ')
    },
    notes
  }
}

/** Seedance 2.5 image-to-video: ordered, timed beats with camera intent and
 * continuity; optional end frame. Audio is generated in finishing by default. */
function seedance(shot: ShotSpec, image: string) {
  let at = 0
  const beats = shot.beats.map((beat) => {
    const start = at
    at += beat.seconds
    return `${start}-${at}s (${beat.kind}): ${sentence(beat.performance)}`
  })
  const end = frame(shot, 'end_frame')
  const prompt = [
    `Starting state: ${sentence(shot.startingState)}`,
    ...beats,
    `Ending: ${sentence(shot.endingState)}`,
    `Camera: ${sentence(`${camera(shot)}. ${shot.camera.intent}`)}`,
    shot.continuity.length
      ? `Keep consistent: ${shot.continuity.join(' ')}`
      : '',
    'Keep the look of the starting image.',
    `Avoid: ${avoid(shot).join(', ')}.`
  ]
    .filter(Boolean)
    .join('\n')
  return {
    class_type: 'HiggsfieldAnimate',
    inputs: {
      prompt,
      image_url: image,
      ...(end ? { end_image_url: end } : {}),
      duration: Math.max(4, Math.ceil(shot.duration)),
      resolution: '720p',
      generate_audio: false
    },
    notes: ['Audio is left to finishing (VO, ambience and effects).']
  }
}

export function compileShot(
  shot: ShotSpec,
  target: CompileTarget
): CompiledShot {
  const blockers = renderBlockers(shot)
  if (blockers.length)
    throw new Error(`${shot.id} is not ready: ${blockers.join(' ')}`)
  const image = frame(shot, 'start_frame')
  if (!image)
    throw new Error(`${shot.id}: image-to-video needs a start_frame reference.`)
  const draft =
    target === 'kling-2.5-standard' ? kling(shot, image) : seedance(shot, image)
  const { graph } = planGraph({
    [shot.id]: { class_type: draft.class_type, inputs: draft.inputs }
  })
  return {
    shot: shot.id,
    target,
    class_type: draft.class_type,
    inputs: resolveInputs(graph[shot.id], {}),
    notes: draft.notes
  }
}
