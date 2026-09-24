import type { Bounds } from '@/renderer/core/layout/types'

export type ScreeningVerdict =
  | 'candidate'
  | 'small'
  | 'soft'
  | 'group'
  | 'noFace'

// Conservative triage hints, not provider requirements or identity validation.
export function screeningVerdict(
  faces: Bounds[],
  sharpness: number
): ScreeningVerdict {
  if (!faces.length) return 'noFace'
  if (faces.length > 1) return 'group'
  if (Math.min(faces[0].width, faces[0].height) < 128) return 'small'
  if (sharpness < 60) return 'soft'
  return 'candidate'
}

export function laplacianVariance(
  data: Uint8ClampedArray,
  width: number,
  height: number
) {
  const gray = (x: number, y: number) => {
    const i = (y * width + x) * 4
    return data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114
  }
  let sum = 0
  let squares = 0
  let count = 0
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const value =
        gray(x - 1, y) +
        gray(x + 1, y) +
        gray(x, y - 1) +
        gray(x, y + 1) -
        4 * gray(x, y)
      sum += value
      squares += value * value
      count++
    }
  }
  return count ? Math.max(0, squares / count - (sum / count) ** 2) : 0
}
