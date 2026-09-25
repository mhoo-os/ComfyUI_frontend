import type { ReferenceAsset } from '../../../../cloudflare/referenceContract'

export function groupReferences(assets: ReferenceAsset[]) {
  const byId = new Map(assets.map((asset) => [asset.id, asset]))
  function root(asset: ReferenceAsset): ReferenceAsset {
    const seen = new Set<string>([asset.id])
    while (asset.crop) {
      const parent = byId.get(asset.crop.parentId)
      if (!parent || seen.has(parent.id)) break
      seen.add(parent.id)
      asset = parent
    }
    return asset
  }
  const roots = assets.filter((asset) => root(asset).id === asset.id)
  return roots.map((original) => {
    const crops = assets
      .filter(
        (asset) => asset.id !== original.id && root(asset).id === original.id
      )
      .sort((a, b) => b.created - a.created || b.id.localeCompare(a.id))
    return { original, current: crops[0], history: crops.slice(1) }
  })
}
