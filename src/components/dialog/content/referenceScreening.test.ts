import { describe, expect, it } from 'vitest'
import { laplacianVariance, screeningVerdict } from './referenceScreening'

const face = { x: 0, y: 0, width: 256, height: 256 }
describe('reference screening', () => {
  it.for([
    [[], 500, 'noFace'],
    [[face, face], 500, 'group'],
    [[{ ...face, width: 64 }], 500, 'small'],
    [[face], 10, 'soft'],
    [[face], 100, 'candidate']
  ] as const)(
    'triages measured evidence without approving identity',
    ([faces, sharpness, expected]) => {
      expect(screeningVerdict([...faces], sharpness)).toBe(expected)
    }
  )
  it('distinguishes flat pixels from edges', () => {
    const flat = new Uint8ClampedArray(16 * 16 * 4).fill(128)
    expect(laplacianVariance(flat, 16, 16)).toBe(0)
    const edges = flat.slice()
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const i = (y * 16 + x) * 4
        edges[i] = edges[i + 1] = edges[i + 2] = x < 8 ? 0 : 255
      }
    expect(laplacianVariance(edges, 16, 16)).toBeGreaterThan(60)
  })
})
