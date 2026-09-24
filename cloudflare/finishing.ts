import { z } from 'zod'

import type { Graph, Media } from './graph'

const number = (value: number, min: number, max: number) => [
  'FLOAT',
  { default: value, min, max, step: 0.1 }
]
const text = (value = '') => ['STRING', { default: value }]
const socket = (type: string) => [type, { forceInput: true }]
export const finishingDefinitions = {
  MhooClip: {
    title: 'Clip · Trim',
    output: 'COMFY_CLIP',
    required: {
      video_url: text(),
      start: number(0, 0, 300),
      duration: number(4, 0.5, 30)
    },
    optional: {}
  },
  MhooSequence: {
    title: 'Sequence · Arrange',
    output: 'COMFY_SEQUENCE',
    required: { clip_1: socket('COMFY_CLIP'), transition: [['cut', 'fade']] },
    optional: Object.fromEntries(
      Array.from({ length: 7 }, (_, i) => [
        `clip_${i + 2}`,
        socket('COMFY_CLIP')
      ])
    )
  },
  MhooCompose: {
    title: 'Compose · Text & Audio',
    output: 'COMFY_EDIT',
    required: {
      sequence: socket('COMFY_SEQUENCE'),
      caption: ['STRING', { default: '', multiline: true }],
      music_url: text(),
      logo_url: text(),
      clip_volume: number(1, 0, 2),
      music_volume: number(0.25, 0, 2)
    },
    optional: {}
  },
  MhooExport: {
    title: 'Export · Finished Video',
    output: 'STRING',
    required: {
      edit: socket('COMFY_EDIT'),
      aspect: [['16:9', '9:16', '1:1']],
      resolution: [['720p', '1080p']]
    },
    optional: {}
  }
}
export function isFinishing(
  type: string
): type is keyof typeof finishingDefinitions {
  return Object.hasOwn(finishingDefinitions, type)
}
export function finishingNodeDefinitions() {
  return Object.fromEntries(
    Object.entries(finishingDefinitions).map(([name, def]) => [
      name,
      {
        name,
        display_name: def.title,
        category: 'Production',
        python_module: 'mhoo.production',
        description:
          name === 'MhooExport'
            ? 'Render an MP4 on Cloudflare. Uses compute, not Higgsfield credits.'
            : 'Prepare your edit on the canvas. Connect to Export to render.',
        input: { required: def.required, optional: def.optional },
        output: [def.output],
        output_name: [
          name === 'MhooExport'
            ? 'video_url'
            : def.output.toLowerCase().replace('comfy_', '')
        ],
        output_is_list: [false],
        output_node: name === 'MhooExport'
      }
    ])
  )
}
const asset = z
  .string()
  .regex(
    /^mhoo-media:(?:uploads\/[a-f0-9-]+|outputs\/[a-f0-9-]+\/[a-zA-Z0-9_-]+\/\d+)$/
  )
const clip = z.object({
  source: asset,
  start: z.number().min(0).max(300),
  duration: z.number().min(0.5).max(30)
})
const sequence = z.object({
  clips: z.array(clip).min(1).max(8),
  transition: z.enum(['cut', 'fade'])
})
const edit = sequence.extend({
  caption: z.string().max(500),
  music: asset.optional(),
  logo: asset.optional(),
  clipVolume: z.number().min(0).max(2),
  musicVolume: z.number().min(0).max(2)
})
export const renderPlanSchema = edit
  .extend({
    aspect: z.enum(['16:9', '9:16', '1:1']),
    resolution: z.enum(['720p', '1080p'])
  })
  .refine(
    (plan) => plan.clips.reduce((sum, clip) => sum + clip.duration, 0) <= 120,
    'Timeline must be at most 120 seconds.'
  )
export type RenderPlan = z.infer<typeof renderPlanSchema>
export type EditValue =
  | z.infer<typeof clip>
  | z.infer<typeof sequence>
  | z.infer<typeof edit>
export function validateFinishing(node: Graph[string], graph: Graph) {
  if (!isFinishing(node.class_type))
    throw new Error('Unsupported finishing node.')
  const def = finishingDefinitions[node.class_type]
  const fields = { ...def.required, ...def.optional }
  for (const [key, raw] of Object.entries(node.inputs)) {
    if (!Object.hasOwn(fields, key))
      throw new Error(`Unsupported input: ${key}`)
    if (Array.isArray(raw)) {
      const source = graph[raw[0]]
      if (!Object.hasOwn(graph, raw[0]) || raw[1] !== 0)
        throw new Error('Invalid finishing connection.')
      const expected = key.startsWith('clip_')
        ? 'MhooClip'
        : key === 'sequence'
          ? 'MhooSequence'
          : key === 'edit'
            ? 'MhooCompose'
            : null
      if (expected ? source.class_type !== expected : key !== 'video_url')
        throw new Error(`Invalid connection to ${key}.`)
      if (
        key === 'video_url' &&
        !['HiggsfieldVideo', 'HiggsfieldAnimate', 'MhooExport'].includes(
          source.class_type
        )
      )
        throw new Error('Clip requires a video output.')
    }
  }
  resolveFinishing(node, {}, {}, true)
}
export function resolveFinishing(
  node: Graph[string],
  values: Record<string, EditValue>,
  outputs: Partial<Record<string, Media[]>>,
  validating = false
): EditValue | RenderPlan {
  const get = (key: string, fallback?: unknown): unknown => {
    const raw = node.inputs[key] ?? fallback
    if (!Array.isArray(raw)) return raw
    if (validating) {
      if (key === 'video_url')
        return 'mhoo-media:uploads/00000000-0000-0000-0000-000000000000'
      const dummy = {
        source: 'mhoo-media:uploads/00000000-0000-0000-0000-000000000000',
        start: 0,
        duration: 4
      }
      return key.startsWith('clip_')
        ? dummy
        : {
            clips: [dummy],
            transition: 'cut',
            caption: '',
            clipVolume: 1,
            musicVolume: 0.25
          }
    }
    if (key === 'video_url') {
      const media = outputs[raw[0]]?.at(0)
      if (!media?.storageKey || media.kind !== 'video')
        throw new Error('Video must finish archiving before rendering.')
      return `mhoo-media:${media.storageKey}`
    }
    return values[raw[0]]
  }
  switch (node.class_type) {
    case 'MhooClip':
      return clip.parse({
        source: get('video_url'),
        start: get('start', 0),
        duration: get('duration', 4)
      })
    case 'MhooSequence':
      return sequence.parse({
        clips: Array.from({ length: 8 }, (_, i) => get(`clip_${i + 1}`)).filter(
          (v) => v !== undefined
        ),
        transition: get('transition', 'cut')
      })
    case 'MhooCompose':
      return edit.parse({
        ...sequence.parse(get('sequence')),
        caption: get('caption', ''),
        music: get('music_url') || undefined,
        logo: get('logo_url') || undefined,
        clipVolume: get('clip_volume', 1),
        musicVolume: get('music_volume', 0.25)
      })
    case 'MhooExport':
      return renderPlanSchema.parse({
        ...edit.parse(get('edit')),
        aspect: get('aspect', '16:9'),
        resolution: get('resolution', '720p')
      })
    default:
      throw new Error('Unsupported finishing node.')
  }
}
