import { z } from 'zod'

export const talkingShotSchema = z
  .object({
    planner: z.enum(['template', 'jev_astra']).default('template'),
    scene: z.string().trim().min(1).max(4000),
    dialogue: z.string().trim().min(1).max(1000),
    duration: z.number().int().min(4).max(30).default(5),
    aspect_ratio: z.enum(['16:9', '9:16', '1:1']).default('16:9'),
    resolution: z.enum(['480p', '720p']).default('720p')
  })
  .strict()
  .superRefine((shot, ctx) => {
    const words = shot.dialogue.split(/\s+/u).length
    if (words > shot.duration * 3)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['dialogue'],
        message:
          'Shorten the spoken script or increase duration (up to three words per second).'
      })
  })

export function compileTalkingShot(value: unknown) {
  const shot = talkingShotSchema.parse(value)
  return {
    prompt: [
      'One continuous talking shot with a single visible speaker. Keep the face clearly visible and the camera steady.',
      `Scene: ${shot.scene}`,
      `The speaker says the following dialogue aloud: ${JSON.stringify(shot.dialogue)}.`,
      'Aim to synchronize natural mouth movements with the speech. No extra dialogue, voiceover, subtitles or on-screen text.'
    ].join('\n'),
    duration: shot.duration,
    aspect_ratio: shot.aspect_ratio,
    resolution: shot.resolution,
    bitrate_mode: 'high',
    output_format: 'mp4',
    generate_audio: true
  }
}
