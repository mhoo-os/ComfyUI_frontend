import { z } from 'zod'

export const referenceMetadata = z
  .object({
    character: z.string().trim().max(80).default(''),
    era: z.string().trim().max(120).default(''),
    subject: z.string().trim().max(300).default(''),
    view: z
      .enum(['unknown', 'front', 'three-quarter', 'profile', 'other'])
      .default('unknown'),
    captureYear: z.number().int().min(1900).max(2100).nullable().default(null),
    approximateYear: z.boolean().default(true),
    source: z.string().max(1000).default('')
  })
  .strict()
export const referenceCrop = z
  .object({
    parentId: z.string().uuid(),
    parentRevision: z.number().int().positive(),
    parentEtag: z.string().min(1).max(200),
    sourceWidth: z.number().int().min(16).max(16384),
    sourceHeight: z.number().int().min(16).max(16384),
    x: z.number().int().nonnegative(),
    y: z.number().int().nonnegative(),
    width: z.number().int().min(16),
    height: z.number().int().min(16),
    method: z.literal('browser-canvas-crop-v1'),
    mask: z
      .object({
        method: z.literal('mediapipe-magic-touch-v1'),
        seed: z
          .object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) })
          .strict(),
        background: z.literal('gray-128')
      })
      .strict()
      .optional()
  })
  .strict()
  .refine(
    (crop) =>
      crop.x + crop.width <= crop.sourceWidth &&
      crop.y + crop.height <= crop.sourceHeight &&
      crop.sourceWidth * crop.sourceHeight <= 40000000,
    'Crop must fit within the source image (maximum 40 megapixels).'
  )
export const referenceAsset = z.object({
  id: z.string().uuid(),
  name: z.string(),
  revision: z.number().int().positive(),
  etag: z.string(),
  size: z.number(),
  contentType: z.string(),
  created: z.number(),
  metadata: referenceMetadata,
  crop: referenceCrop.optional(),
  approval: z
    .object({ revision: z.number(), etag: z.string(), at: z.number() })
    .nullable()
})
export type ReferenceAsset = z.infer<typeof referenceAsset>
export const referenceToken =
  /^mhoo-asset:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):([1-9][0-9]*)$/
export function approvedReference(asset: ReferenceAsset) {
  return (
    asset.approval?.revision === asset.revision &&
    asset.approval.etag === asset.etag
  )
}
