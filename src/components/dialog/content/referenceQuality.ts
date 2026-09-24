import type { Bounds } from '@/renderer/core/layout/types'

function overlap(a: Bounds, b: Bounds) {
  return (
    Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
    Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y))
  )
}

export function cropQuality(
  crop: Bounds,
  faces: Bounds[],
  selected: Bounds | null
) {
  return {
    small: Math.min(crop.width, crop.height) < 256,
    clipped:
      !!selected && overlap(crop, selected) < selected.width * selected.height,
    neighbors: faces.filter(
      (face) => face !== selected && overlap(crop, face) > 0
    ).length,
    facePixels: selected
      ? Math.round(Math.min(selected.width, selected.height))
      : null
  }
}

export function compositeMask(
  pixels: Uint8ClampedArray,
  categories: Uint8Array | Uint8ClampedArray,
  foregroundCategory: number
) {
  if (pixels.length !== categories.length * 4) return false
  for (let i = 0; i < categories.length; i++) {
    if (categories[i] !== foregroundCategory) {
      pixels[i * 4] = 128
      pixels[i * 4 + 1] = 128
      pixels[i * 4 + 2] = 128
      pixels[i * 4 + 3] = 255
    }
  }
  return true
}
