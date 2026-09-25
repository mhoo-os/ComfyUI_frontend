import { z } from 'zod'

/**
 * Story-level shot card. This is the creative intent for one generated shot,
 * kept separate from any provider payload: a model-specific compiler turns it
 * into a request, and the reviewer checks the result against it.
 * See docs/mhoo/skills/moo-shot-director/SKILL.md for the directing contract.
 */

const text = (max: number) => z.string().trim().min(1).max(max)
const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u)

/** Reference to real media only: an archived key, an approved character
 * library token, an https URL, a cast member whose approved image is looked
 * up when the scene is loaded, or a named placeholder that blocks rendering
 * until someone supplies the asset. */
const assetRef = z
  .string()
  .regex(
    /^(?:mhoo-media:[\w/.-]+|mhoo-asset:[0-9a-f-]{36}:[1-9]\d*|https:\/\/\S+|cast:[a-z0-9]+(?:-[a-z0-9]+)*|pending:[a-z0-9-]+)$/u
  )

const beatSchema = z
  .object({
    kind: z.enum(['anticipation', 'action', 'reaction', 'hold']),
    performance: text(400),
    seconds: z.number().positive().max(15)
  })
  .strict()

const cameraSchema = z
  .object({
    size: z.enum([
      'extreme_wide',
      'wide',
      'medium',
      'medium_close',
      'close',
      'extreme_close',
      'insert'
    ]),
    height: z.enum(['low', 'eye', 'high', 'overhead']).default('eye'),
    movement: z
      .enum([
        'static',
        'push_in',
        'pull_out',
        'pan',
        'tilt',
        'track',
        'handheld'
      ])
      .default('static'),
    subjectSide: z.enum(['left', 'center', 'right']).optional(),
    screenDirection: z
      .enum(['left_to_right', 'right_to_left', 'neutral'])
      .default('neutral'),
    intent: text(300)
  })
  .strict()

const referenceSchema = z
  .object({
    role: z.enum([
      'identity',
      'costume',
      'setting',
      'composition',
      'style',
      'start_frame',
      'end_frame'
    ]),
    asset: assetRef,
    approved: z.boolean().default(false),
    note: z.string().trim().max(300).optional()
  })
  .strict()

const overlaySchema = z
  .object({
    kind: z.enum(['onomatopoeia', 'speech_bubble', 'caption']),
    text: text(80),
    atSeconds: z.number().min(0)
  })
  .strict()

const voSchema = z
  .object({ text: text(300), clean: text(300).optional() })
  .strict()

const colorStates = [
  'warm',
  'cold',
  'gold',
  'green',
  'red',
  'gray',
  'high_contrast'
] as const

export const shotSpecSchema = z
  .object({
    version: z.literal(1),
    id: slug,
    purpose: text(300),
    truth: z
      .object({
        kind: z.enum(['fact', 'staged', 'mixed']),
        facts: z.array(text(300)).default([]),
        staged: z.array(text(300)).default([])
      })
      .strict(),
    cast: z
      .array(z.object({ id: slug, description: text(300) }).strict())
      .max(8),
    setting: text(400),
    startingState: text(400),
    beats: z.array(beatSchema).min(1).max(6),
    endingState: text(400),
    camera: cameraSchema,
    colorState: z.enum(colorStates),
    motif: z.enum(['suitcase', 'dinosaur', 'none']).default('none'),
    sound: z
      .object({
        vo: voSchema.optional(),
        ambience: text(300),
        sfx: z.array(text(120)).default([])
      })
      .strict(),
    continuity: z.array(text(200)).default([]),
    references: z.array(referenceSchema).max(8).default([]),
    overlays: z.array(overlaySchema).max(6).default([]),
    forbidden: z.array(text(120)).default([]),
    noBrandRender: z.boolean().default(true),
    duration: z.number().positive().max(15),
    aspects: z.array(z.enum(['9:16', '16:9'])).min(1),
    callbackTo: slug.optional(),
    evaluation: z.array(text(200)).min(1)
  })
  .strict()
  .superRefine((shot, ctx) => {
    const issue = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, path, message })
    const beatTime = shot.beats.reduce((sum, beat) => sum + beat.seconds, 0)
    if (beatTime > shot.duration + 0.01)
      issue(
        ['beats'],
        `Beats last ${beatTime}s but the shot is ${shot.duration}s.`
      )
    if (!shot.beats.some((beat) => beat.kind === 'action'))
      issue(['beats'], 'A shot needs at least one action beat.')
    if (shot.truth.kind === 'fact' && shot.truth.staged.length)
      issue(['truth', 'kind'], 'Staged details make this shot mixed, not fact.')
    if (shot.truth.kind !== 'fact' && !shot.truth.staged.length)
      issue(
        ['truth', 'staged'],
        'Name what is staged so review keeps it labeled.'
      )
    if (shot.truth.kind !== 'staged' && !shot.truth.facts.length)
      issue(['truth', 'facts'], 'Name the fact this shot depicts.')
    for (const key of ['text', 'clean'] as const) {
      const vo = shot.sound.vo?.[key]
      if (vo && vo.split(/\s+/u).length > shot.duration * 3)
        issue(['sound', 'vo', key], 'Narration exceeds three words per second.')
    }
    shot.overlays.forEach((overlay, index) => {
      if (overlay.atSeconds > shot.duration)
        issue(
          ['overlays', index, 'atSeconds'],
          'Overlay starts after the shot ends.'
        )
    })
    if (shot.callbackTo === shot.id)
      issue(['callbackTo'], 'A shot cannot call back to itself.')
  })

export const sceneSpecSchema = z
  .object({
    version: z.literal(1),
    film: slug,
    episode: z.number().int().min(1),
    id: slug,
    title: text(120),
    shots: z.array(shotSpecSchema).min(1).max(24)
  })
  .strict()
  .superRefine((scene, ctx) => {
    const seen = new Set<string>()
    scene.shots.forEach((shot, index) => {
      if (seen.has(shot.id))
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['shots', index, 'id'],
          message: `Duplicate shot id ${shot.id}.`
        })
      seen.add(shot.id)
    })
  })

export type ShotSpec = z.infer<typeof shotSpecSchema>
type SceneSpec = z.infer<typeof sceneSpecSchema>

/** Reasons a valid shot still cannot be rendered. Empty means ready. */
export function renderBlockers(shot: ShotSpec) {
  const blockers: string[] = []
  for (const ref of shot.references) {
    if (ref.asset.startsWith('pending:'))
      blockers.push(`Missing ${ref.role} asset ${ref.asset.slice(8)}.`)
    else if (['identity', 'start_frame'].includes(ref.role) && !ref.approved)
      blockers.push(`The ${ref.role} reference needs owner approval.`)
  }
  if (
    shot.cast.length &&
    !shot.references.some((ref) => ref.role === 'identity')
  )
    blockers.push('A cast member appears without an identity reference.')
  return blockers
}

/** Advisory directing notes; never blocks rendering. */
export function directingNotes(shot: ShotSpec) {
  const kinds = new Set(shot.beats.map((beat) => beat.kind))
  const notes: string[] = []
  if (!kinds.has('anticipation'))
    notes.push('No anticipation beat: the action may read as abrupt.')
  if (!kinds.has('reaction') && !kinds.has('hold'))
    notes.push('No reaction or hold: leave room for the moment to land.')
  if (shot.overlays.length)
    notes.push('Overlays are added in finishing; keep them out of the prompt.')
  return notes
}
