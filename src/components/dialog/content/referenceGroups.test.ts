import { describe, expect, it } from 'vitest'
import { referenceAsset } from '../../../../cloudflare/referenceContract'
import { groupReferences } from './referenceGroups'
import { portraitBounds } from './referenceFaces'

const original = referenceAsset.parse({
  id: '2bf4de45-6926-4b44-bd5a-62d6e72537b1',
  name: 'original',
  revision: 1,
  etag: 'a',
  size: 1,
  contentType: 'image/png',
  created: 1,
  metadata: {},
  approval: null
})
function crop(id: string, created: number, parentId = original.id) {
  return referenceAsset.parse({
    ...original,
    id,
    created,
    crop: {
      parentId,
      parentRevision: 1,
      parentEtag: 'a',
      sourceWidth: 100,
      sourceHeight: 100,
      x: 0,
      y: 0,
      width: 50,
      height: 50,
      method: 'browser-canvas-crop-v1'
    }
  })
}
describe('reference families', () => {
  it('groups nested crops under the original with the newest crop current', () => {
    const older = crop('2bf4de45-6926-4b44-bd5a-62d6e72537b2', 2)
    const latest = crop('2bf4de45-6926-4b44-bd5a-62d6e72537b3', 3, older.id)
    expect(groupReferences([latest, original, older])).toEqual([
      { original, current: latest, history: [older] }
    ])
  })
  it('keeps an orphan crop visible', () => {
    const orphan = crop('2bf4de45-6926-4b44-bd5a-62d6e72537b2', 2)
    expect(groupReferences([orphan])[0].original).toEqual(orphan)
  })
  it('limits portrait padding near other faces without cutting the selected face', () => {
    const face = { x: 100, y: 100, width: 40, height: 50 }
    const neighbor = { x: 150, y: 100, width: 40, height: 50 }
    const result = portraitBounds(face, 400, 300, [face, neighbor])
    expect(result.x + result.width).toBe(145)
    expect(result.x + result.width).toBeGreaterThanOrEqual(face.x + face.width)
  })
  it('clips suggested portraits to the photo edges', () => {
    expect(
      portraitBounds({ x: 0, y: 0, width: 100, height: 100 }, 120, 150)
    ).toEqual({ x: 0, y: 0, width: 120, height: 150 })
  })
})
