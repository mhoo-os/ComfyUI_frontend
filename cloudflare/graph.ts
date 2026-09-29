import { referenceToken } from './referenceContract'
import { z } from 'zod'

import type { EditValue } from './finishing'
import type { KlingShot } from './extendedInputs'
import {
  parseKlingShots,
  parseMediaUrls,
  validateMediaUrl
} from './extendedInputs'
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
  maxItems: z.number().int().positive().optional(),
  tooltip: z.string().optional(),
  providerField: z.string().optional(),
  asArray: z.boolean().optional(),
  // A choice that means "leave it to the provider": never sent.
  omitValue: z.string().optional(),
  // Selects the `{key}` segment of the endpoint instead of being sent.
  endpointParam: z.boolean().optional()
})
const modelSchema = z.object({
  title: z.string(),
  endpoint: z.string(),
  kind: z.enum(['image', 'video']),
  source: z.string(),
  schema: z.object({
    properties: z.record(propertySchema),
    required: z.array(z.string()),
    // At least one of these inputs must be set.
    requiredAny: z.array(z.string()).optional()
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
// Linkable inputs. Image inputs also take approved `mhoo-asset:` tokens.
const imageInputs = ['image_url', 'end_image_url', 'reference_image_url']
const linkableInputs = ['prompt', ...imageInputs, 'video_url']
export type Input = Record<
  string,
  string | number | boolean | string[] | KlingShot[]
>
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
                  tooltip: prop.tooltip,
                  multiline: [
                    'prompt',
                    'scene',
                    'dialogue',
                    'uri-list',
                    'kling-shots',
                    'kling-elements'
                  ].includes(prop.format ?? key),
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
      validateFinishing(node, graph, models)
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
        if (!linkableInputs.includes(key))
          throw new Error(
            'Connect URLs only to text, image or video URL inputs.'
          )
        visit(value[0])
        if (
          key.endsWith('image_url') &&
          models[graph[value[0]].class_type]?.kind !== 'image'
        )
          throw new Error('Image input requires an image output.')
        if (
          key === 'video_url' &&
          models[graph[value[0]].class_type]?.kind !== 'video'
        )
          throw new Error('Video input requires a video output.')
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
    // Fail before upstream nodes spend credits, not at this node's turn.
    endpointFor(node)
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

/** The provider path for a node; `{key}` segments come from enum inputs
 * marked `endpointParam`, validated like any other input. */
export function endpointFor(node: Graph[string]): string {
  if (!Object.hasOwn(models, node.class_type))
    throw new Error('Unsupported node')
  const model = models[node.class_type]
  return model.endpoint.replace(/\{(\w+)\}/g, (_, key: string) => {
    const prop = Object.hasOwn(model.schema.properties, key)
      ? model.schema.properties[key]
      : undefined
    const value =
      Object.hasOwn(node.inputs, key) && node.inputs[key] !== ''
        ? node.inputs[key]
        : prop?.default
    if (!prop?.endpointParam || !prop.enum?.includes(value as string))
      throw new Error(`Unsupported ${key}.`)
    return String(value)
  })
}

export function resolveInputs(
  node: Graph[string],
  outputs: Record<string, Media[]>
): Input {
  if (!Object.hasOwn(models, node.class_type))
    throw new Error('Unsupported node')
  const model = models[node.class_type]
  const input: Input = {}
  const set = new Set<string>()
  for (const [key, prop] of Object.entries(model.schema.properties)) {
    const raw = Object.hasOwn(node.inputs, key)
      ? node.inputs[key]
      : prop.default
    const value = Array.isArray(raw) ? outputs[raw[0]]?.[0]?.url : raw
    if (value === undefined || value === '' || value === prop.omitValue) {
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
    if (prop.format === 'uri-list') {
      const urls = parseMediaUrls(z.string().parse(value), key === 'image_urls')
      if (!urls.length) continue
      const field = prop.providerField ?? key
      input[field] = [
        ...(Object.hasOwn(input, field)
          ? z.array(z.string()).parse(input[field])
          : []),
        ...urls
      ]
      set.add(key)
      continue
    }
    if (prop.format === 'kling-elements') {
      const elements = z
        .string()
        .parse(value)
        .split(/\r?\n/)
        .map((id) => id.trim())
        .filter(Boolean)
      if (elements.length)
        input[key] = z
          .array(
            z
              .string()
              .regex(/^\d+$/, 'Kling element IDs must be decimal strings.')
          )
          .parse(elements)
      continue
    }
    if (prop.format === 'kling-shots') {
      const shots = parseKlingShots(z.string().parse(value))
      if (shots.length) input[key] = shots
      continue
    }
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
        ['image_url', 'end_image_url', 'reference_image_url'].includes(key) &&
        referenceToken.test(value)
      )
    )
      throw new Error('Private references are only supported in image inputs.')
    if (key.endsWith('_url'))
      validateMediaUrl(String(value), imageInputs.includes(key))
    set.add(key)
    if (prop.endpointParam) continue
    const field = prop.providerField ?? key
    if (prop.asArray) {
      input[field] = [
        ...(Object.hasOwn(input, field)
          ? z.array(z.string()).parse(input[field])
          : []),
        String(value)
      ]
    } else input[field] = value
  }
  const any = model.schema.requiredAny
  if (any && !any.some((key) => set.has(key)))
    throw new Error(`${model.title}: set one of ${any.join(', ')}.`)
  for (const [key, prop] of Object.entries(model.schema.properties)) {
    const value = input[prop.providerField ?? key]
    if (
      prop.maxItems !== undefined &&
      Array.isArray(value) &&
      value.length > prop.maxItems
    )
      throw new Error(
        `${key} accepts at most ${prop.maxItems} references, including single inputs.`
      )
  }
  if (input.multi_prompt) {
    if (input.multi_shots !== true)
      throw new Error('Enable multi_shots to use custom shots.')
    delete input.duration
  }
  if (node.class_type === 'HiggsfieldSoul' && input.custom_reference_id)
    z.number().positive().max(1).parse(input.custom_reference_strength)
  return node.class_type === 'HiggsfieldTalkingShot'
    ? compileTalkingShot(input)
    : input
}
