import { describe, expect, it } from 'vitest'
import { compositeMask, cropQuality } from './referenceQuality'

describe('measured crop checks', () => {
  const face = { x: 100, y: 100, width: 80, height: 80 }
  const neighbor = { x: 200, y: 100, width: 80, height: 80 }
  it('reports a clipped face and neighboring face without certifying quality', () => {
    expect(
      cropQuality(
        { x: 120, y: 80, width: 120, height: 160 },
        [face, neighbor],
        face
      )
    ).toEqual({ small: true, clipped: true, neighbors: 1, facePixels: 80 })
  })
  it('keeps unknown face size unknown for manual selection', () => {
    expect(
      cropQuality({ x: 0, y: 0, width: 400, height: 400 }, [], null)
    ).toEqual({ small: false, clipped: false, neighbors: 0, facePixels: null })
  })
  it.for([0, 1])(
    'preserves foreground category %s pixel bytes while making background gray',
    (foreground) => {
      const pixels = new Uint8ClampedArray([10, 20, 30, 255, 40, 50, 60, 255])
      compositeMask(
        pixels,
        new Uint8Array([foreground, 1 - foreground]),
        foreground
      )
      expect([...pixels]).toEqual([10, 20, 30, 255, 128, 128, 128, 255])
      expect(compositeMask(pixels, new Uint8Array([1]), 1)).toBe(false)
    }
  )
})
