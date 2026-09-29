import { z } from 'zod'

import { referenceToken } from './referenceContract'

const klingShots = z
  .array(
    z
      .object({
        prompt: z
          .string()
          .trim()
          .min(1)
          .max(512)
          .refine(
            (prompt) => !prompt.includes('mhoo-asset:'),
            'Private references are only supported in image inputs.'
          ),
        duration: z.number().int().min(1).max(15)
      })
      .strict()
  )
  .max(6)

export type KlingShot = z.infer<typeof klingShots>[number]

export function parseKlingShots(value: string): KlingShot[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    throw new Error('multi_prompt must be a valid JSON array of shots.')
  }
  return klingShots.parse(parsed)
}

export function validateMediaUrl(value: string, image: boolean) {
  if (value.includes('mhoo-asset:')) {
    if (image && referenceToken.test(value)) return
    throw new Error('Private references are only supported in image inputs.')
  }
  const url = new URL(value)
  const host = url.hostname.replace(/\.$/, '')
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    /^[\d.]+$/.test(host) ||
    host.startsWith('[')
  )
    throw new Error('Media inputs must use public HTTPS URLs.')
}

export function parseMediaUrls(value: string, image: boolean): string[] {
  const urls = value
    .split(/\r?\n/)
    .map((url) => url.trim())
    .filter(Boolean)
  for (const url of urls) validateMediaUrl(url, image)
  return urls
}
