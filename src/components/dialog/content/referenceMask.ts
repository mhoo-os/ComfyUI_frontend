import type { Bounds } from '@/renderer/core/layout/types'
import { compositeMask } from './referenceQuality'

export async function maskReference(
  image: HTMLImageElement,
  crop: Bounds,
  seed: { x: number; y: number }
): Promise<HTMLCanvasElement | null> {
  const { InteractiveSegmenter, FilesetResolver } =
    await import('@mediapipe/tasks-vision')
  const base = `${import.meta.env.BASE_URL}face-detector`
  const files = await FilesetResolver.forVisionTasks(base)
  const segmenter = await InteractiveSegmenter.createFromOptions(files, {
    baseOptions: { modelAssetPath: `${base}/magic_touch.tflite` },
    outputCategoryMask: true,
    outputConfidenceMasks: false
  })
  try {
    const input = document.createElement('canvas')
    const scale = Math.min(
      1,
      1024 / Math.max(image.naturalWidth, image.naturalHeight)
    )
    input.width = Math.round(image.naturalWidth * scale)
    input.height = Math.round(image.naturalHeight * scale)
    const context = input.getContext('2d')
    if (!context) return null
    context.drawImage(image, 0, 0, input.width, input.height)
    const result = segmenter.segment(input, { keypoint: seed })
    try {
      const mask = result.categoryMask
      if (!mask) return null
      const categories = mask.getAsUint8Array()
      if (
        !categories.some((value) => value !== 0) ||
        !categories.some((value) => value === 0)
      )
        return null
      const seedX = Math.min(
        mask.width - 1,
        Math.max(0, Math.floor(seed.x * mask.width))
      )
      const seedY = Math.min(
        mask.height - 1,
        Math.max(0, Math.floor(seed.y * mask.height))
      )
      const foregroundCategory = categories[seedY * mask.width + seedX]
      const matte = document.createElement('canvas')
      matte.width = mask.width
      matte.height = mask.height
      const matteContext = matte.getContext('2d')
      if (!matteContext) return null
      const pixels = matteContext.createImageData(mask.width, mask.height)
      pixels.data.fill(255)
      compositeMask(pixels.data, categories, foregroundCategory)
      for (let i = 0; i < categories.length; i++)
        pixels.data[i * 4 + 3] = categories[i] !== foregroundCategory ? 255 : 0
      matteContext.putImageData(pixels, 0, 0)
      const output = document.createElement('canvas')
      output.width = crop.width
      output.height = crop.height
      const outputContext = output.getContext('2d')
      if (!outputContext) return null
      outputContext.drawImage(
        image,
        crop.x,
        crop.y,
        crop.width,
        crop.height,
        0,
        0,
        crop.width,
        crop.height
      )
      outputContext.drawImage(
        matte,
        (crop.x * mask.width) / image.naturalWidth,
        (crop.y * mask.height) / image.naturalHeight,
        (crop.width * mask.width) / image.naturalWidth,
        (crop.height * mask.height) / image.naturalHeight,
        0,
        0,
        crop.width,
        crop.height
      )
      return output
    } finally {
      result.close()
    }
  } finally {
    segmenter.close()
  }
}
