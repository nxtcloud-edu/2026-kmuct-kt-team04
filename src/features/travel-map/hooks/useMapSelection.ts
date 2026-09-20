import { useCallback, useMemo, useState } from 'react'
import type { Pin, RoomState, TimeBlock, TravelDay } from '../../../../shared/contracts'
import { orderedPinsForBlock, pinOrderIndex } from '../lib/pinOrder'

export interface UseMapSelection {
  selectedDayId: string | null
  selectedTimeBlockId: string | null
  selectDay: (dayId: string | null) => void
  selectTimeBlock: (timeBlockId: string | null) => void
  days: TravelDay[]
  timeBlocksOfDay: TimeBlock[]
  visiblePins: Pin[]
  visitOrderByPinId: Record<string, number>
}

export function useMapSelection(state: RoomState | null): UseMapSelection {
  const days = useMemo(
    () => [...(state?.days ?? [])].sort((a, b) => a.dayNumber - b.dayNumber),
    [state?.days],
  )
  const [selectedDayId, setSelectedDayId] = useState<string | null>(null)
  const [selectedTimeBlockId, setSelectedTimeBlockId] = useState<string | null>(null)
  const effectiveDayId = days.some(day => day.id === selectedDayId) ? selectedDayId : days[0]?.id ?? null

  const timeBlocksOfDay = useMemo(() => {
    if (!state || !effectiveDayId) return []
    return state.timeBlocks.filter(block => block.dayId === effectiveDayId)
      .sort((a, b) => a.startTime.localeCompare(b.startTime) || a.id.localeCompare(b.id))
  }, [state, effectiveDayId])
  const effectiveBlockId = timeBlocksOfDay.some(block => block.id === selectedTimeBlockId) ? selectedTimeBlockId : null

  const visiblePins = useMemo(() => {
    if (!state) return []
    const blocks = effectiveBlockId
      ? timeBlocksOfDay.filter(block => block.id === effectiveBlockId)
      : timeBlocksOfDay
    return blocks.flatMap(block => orderedPinsForBlock(block, state.pins))
  }, [state, effectiveBlockId, timeBlocksOfDay])

  const visitOrderByPinId = useMemo(
    () => pinOrderIndex(timeBlocksOfDay, state?.pins ?? []),
    [state?.pins, timeBlocksOfDay],
  )

  const selectDay = useCallback((dayId: string | null) => {
    setSelectedDayId(dayId)
    setSelectedTimeBlockId(null)
  }, [])
  const selectTimeBlock = useCallback((timeBlockId: string | null) => setSelectedTimeBlockId(timeBlockId), [])

  return { selectedDayId: effectiveDayId, selectedTimeBlockId: effectiveBlockId, selectDay, selectTimeBlock,
    days, timeBlocksOfDay, visiblePins, visitOrderByPinId }
}
