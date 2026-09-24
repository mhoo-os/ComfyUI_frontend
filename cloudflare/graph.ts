import { referenceToken } from './referenceContract'
import { z } from 'zod'

import type { EditValue } from './finishing'
import catalog from './models.json'
import { compileTalkingShot } from './talkingShot'
import {
  finishingNodeDefinitions,
  isFinishing,
  resolveFinishing,
  validateFinishing
} from './finishing'

const propertySchema = z.object({
  type: z.string(),
  enum: z.array(z.union([z.string(), z.number()])).optional(),
  default: z.union([z.string(), z.number(), z.boolean()]).optional(),
  minimum: z.number().optional(),
  maximum: z.number().optional(),
  format: z.string().optional(),
  maxLength: z.number().optional(),
  providerField: z.string().optional(),
  asArray: z.boolean().optional()
})
const modelSchema = z.object({
  title: z.string(),
  endpoint: z.string(),
  kind: z.enum(['image', 'video']),
  source: z.string(),
  schema: z.object({
    properties: z.record(propertySchema),
    required: z.array(z.string())
  })
})
export const models = z.record(modelSchema).parse(catalog)
const graphSchema = z.record(
  z.object({
    class_type: z.string(),
    inputs: z.record(
      z.union([
        z.string(),
        z.number(),
        z.boolean(),
        z.tuple([z.string(), z.number()])
      ])
    )
  })
)
export type Graph = z.infer<typeof graphSchema>
export type Input = Record<string, string | number | boolean | string[]>
export type Media = {
  url: string
  kind: 'image' | 'video'
  storageKey?: string
}

export function nodeDefinitions() {
  return {
    ...finishingNodeDefinitions(),
    ...Object.fromEntries(
      Object.entries(models).map(([name, model]) => {
        const required = Object.fromEntries(
          Object.entries(model.schema.properties).map(([key, prop]) => {
            const type =
              prop.enum ??
              {
                string: 'STRING',
                integer: 'INT',
                number: 'FLOAT',
                boolean: 'BOOLEAN'
              }[prop.type] ??
              'STRING'
            return [
              key,
              [
                type,
                {
                  default: prop.default ?? (key === 'seed' ? 1 : ''),
                  ...(prop.minimum !== undefined && { min: prop.minimum }),
                  ...(prop.maximum !== undefined && { max: prop.maximum }),
                  ...(['prompt', 'scene', 'dialogue'].includes(key) && {
                    multiline: true
                  }),
                  ...(key === 'seed' && { control_after_generate: true })
                }
              ]
            ]
          })
        )
        return [
          name,
          {
            name,
            display_name: model.title,
            description:
              name === 'HiggsfieldTalkingShot'
                ? 'Scene + spoken words → generated video with audio. Template or Jev + Astra planner; exact wording, lip sync and identity are best-effort and require review. Run spends Higgsfield credits.'
                : `Higgsfield API · ${model.endpoint}. Run submits a paid generation. URL output connects to another Higgsfield node.`,
            category: 'Higgsfield',
            python_module: 'mhoo.higgsfield',
            input: { required },
            output: ['STRING'],
            output_name: [model.kind === 'image' ? 'image_url' : 'video_url'],
            output_is_list: [false],
            output_node: true
          }
        ]
      })
    )
  }
}

export function planGraph(value: unknown): { graph: Graph; order: string[] } {
  const graph = graphSchema.parse(value)
  const ids = Object.keys(graph)
  if (!ids.length || ids.length > 32)
    throw new Error('Use between one and 32 nodes per workflow.')
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const order: string[] = []
  function visit(id: string) {
    if (visited.has(id)) return
    if (visiting.has(id)) throw new Error('Workflow contains a cycle.')
    if (!Object.hasOwn(graph, id))
      throw new Error(`Missing connected node: ${id}`)
    const node = graph[id]
    if (isFinishing(node.class_type)) {
      visiting.add(id)
      validateFinishing(node, graph)
      for (const value of Object.values(node.inputs))
        if (Array.isArray(value)) visit(value[0])
      visiting.delete(id)
      visited.add(id)
      order.push(id)
      return
    }
    if (!Object.hasOwn(models, node.class_type))
      throw new Error(
        `Unsupported node: ${node.class_type}. Use Higgsfield or Production nodes.`
      )
    visiting.add(id)
    for (const [key, value] of Object.entries(node.inputs)) {
      if (!Object.hasOwn(models[node.class_type].schema.properties, key))
        throw new Error(`Unsupported input: ${key}`)
      if (Array.isArray(value)) {
        if (value[1] !== 0)
          throw new Error('Only the URL output (slot 0) can be connected.')
        if (!['prompt', 'image_url', 'end_image_url'].includes(key))
          throw new Error('Connect URLs only to text or image URL inputs.')
        visit(value[0])
        if (
          key.endsWith('image_url') &&
          models[graph[value[0]].class_type]?.kind !== 'image'
        )
          throw new Error('Image input requires an image output.')
      }
    }
    resolveInputs(
      node,
      Object.fromEntries(
        ids.map((key) => [
          key,
          [{ url: 'https://example.com/input.png', kind: 'image' as const }]
        ])
      )
    )
    visiting.delete(id)
    visited.add(id)
    order.push(id)
  }
  ids.forEach(visit)
  const edits: Record<string, EditValue> = {}
  const placeholders: Record<string, Media[]> = Object.fromEntries(
    ids.map((id) => [
      id,
      [
        {
          url: 'https://example.com/video.mp4',
          kind: 'video',
          storageKey: 'uploads/00000000-0000-0000-0000-000000000000'
        }
      ]
    ])
  )
  for (const id of order)
    if (isFinishing(graph[id].class_type))
      edits[id] = resolveFinishing(graph[id], edits, placeholders)
  return { graph, order }
}

export function resolveInputs(
  node: Graph[string],
  outputs: Record<string, Media[]>
): Input {
  if (!Object.hasOwn(models, node.class_type))
    throw new Error('Unsupported node')
  const model = models[node.class_type]
  const input: Input = {}
  for (const [key, prop] of Object.entries(model.schema.properties)) {
    const raw = Object.hasOwn(node.inputs, key)
      ? node.inputs[key]
      : prop.default
    const value = Array.isArray(raw) ? outputs[raw[0]]?.[0]?.url : raw
    if (value === undefined || value === '') {
      if (model.schema.required.includes(key))
        throw new Error(`${model.title}: ${key} is required.`)
      continue
    }
    if (prop.type === 'string' && typeof value !== 'string')
      throw new Error(`${key} must be text.`)
    if (prop.type === 'boolean' && typeof value !== 'boolean')
      throw new Error(`${key} must be true or false.`)
    if (
      ['integer', 'number'].includes(prop.type) &&
      (typeof value !== 'number' ||
        !Number.isFinite(value) ||
        (prop.type === 'integer' && !Number.isInteger(value)) ||
        (prop.minimum !== undefined && value < prop.minimum) ||
        (prop.maximum !== undefined && value > prop.maximum))
    )
      throw new Error(`${key} is outside the supported range.`)
    if (prop.enum && !prop.enum.includes(value as string | number))
      throw new Error(`Unsupported ${key}.`)
    if (typeof value === 'string' && value.length > (prop.maxLength ?? 8000))
      throw new Error(`${key} is too long.`)
    if (
      prop.format === 'uuid' &&
      typeof value === 'string' &&
      !z.string().uuid().safeParse(value).success
    )
      throw new Error(`${key} must be a UUID.`)
    if (
      typeof value === 'string' &&
      value.includes('mhoo-asset:') &&
      !(
        ['image_url', 'end_image_url'].includes(key) &&
        referenceToken.test(value)
      )
    )
      throw new Error('Private references are only supported in image inputs.')
    if (
      key.endsWith('_url') &&
      !(
        ['image_url', 'end_image_url'].includes(key) &&
        referenceToken.test(String(value))
      )
    ) {
      const url = new URL(String(value))
      if (
        url.protocol !== 'https:' ||
        url.username ||
        url.password ||
        url.hostname === 'localhost' ||
        /^[\d.[\]:]+$/.test(url.hostname)
      )
        throw new Error('Media inputs must use public HTTPS URLs.')
    }
    input[prop.providerField ?? key] = prop.asArray ? [String(value)] : value
  }
  if (node.class_type === 'HiggsfieldSoul' && input.custom_reference_id)
    z.number().positive().max(1).parse(input.custom_reference_strength)
  return node.class_type === 'HiggsfieldTalkingShot'
    ? compileTalkingShot(input)
    : input
}
