import type { Pin, TimeBlock } from '../../../../shared/contracts'

export function orderedPinsForBlock(block: TimeBlock, pins: Pin[]): Pin[] {
  const blockPins = pins.filter(pin => pin.timeBlockId === block.id)
  const byId = new Map(blockPins.map(pin => [pin.id, pin]))
  const seen = new Set<string>()
  const ordered = (block.pinOrder ?? []).flatMap(id => {
    const pin = byId.get(id)
    if (!pin || seen.has(id)) return []
    seen.add(id)
    return [pin]
  })
  const missing = blockPins.filter(pin => !seen.has(pin.id))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
  return [...ordered, ...missing]
}

export function pinOrderIndex(blocks: TimeBlock[], pins: Pin[]): Record<string, number> {
  const result: Record<string, number> = {}
  for (const block of blocks) {
    orderedPinsForBlock(block, pins).forEach((pin, index) => { result[pin.id] = index + 1 })
  }
  return result
}
