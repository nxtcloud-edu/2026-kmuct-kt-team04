import { useCallback, useMemo, useState } from 'react'
import type { Pin, RoomState, TimeBlock, TravelDay } from '../../../../shared/contracts'

// 선택 날짜 / 선택 타임블록은 서버에 저장하지 않는 화면 로컬 상태입니다.
// (BACKEND-CONTRACT: 지도 범위·선택 날짜·선택 타임블록은 방 데이터에 저장하지 않음)

export interface UseMapSelection {
  selectedDayId: string | null
  selectedTimeBlockId: string | null
  selectDay: (dayId: string | null) => void
  selectTimeBlock: (timeBlockId: string | null) => void
  /** 정렬된 날짜 목록 */
  days: TravelDay[]
  /** 선택된 날짜의 타임블록 목록 (시작 시간 순) */
  timeBlocksOfDay: TimeBlock[]
  /** 지도에 표시할 핀 (선택 타임블록 우선, 없으면 선택 날짜의 모든 타임블록 핀) */
  visiblePins: Pin[]
}

export function useMapSelection(state: RoomState | null): UseMapSelection {
  const days = useMemo(
    () => [...(state?.days ?? [])].sort((a, b) => a.dayNumber - b.dayNumber),
    [state],
  )

  const [selectedDayId, setSelectedDayId] = useState<string | null>(null)
  const [selectedTimeBlockId, setSelectedTimeBlockId] = useState<string | null>(null)

  // 선택 날짜 기본값: 첫 번째 날
  const effectiveDayId = selectedDayId ?? days[0]?.id ?? null

  const timeBlocksOfDay = useMemo(() => {
    if (!state || !effectiveDayId) return []
    return state.timeBlocks
      .filter(b => b.dayId === effectiveDayId)
      .sort((a, b) => a.startTime.localeCompare(b.startTime))
  }, [state, effectiveDayId])

  const visiblePins = useMemo(() => {
    if (!state) return []
    if (selectedTimeBlockId) {
      return state.pins.filter(p => p.timeBlockId === selectedTimeBlockId)
    }
    const blockIds = new Set(timeBlocksOfDay.map(b => b.id))
    return state.pins.filter(p => blockIds.has(p.timeBlockId))
  }, [state, selectedTimeBlockId, timeBlocksOfDay])

  const selectDay = useCallback((dayId: string | null) => {
    setSelectedDayId(dayId)
    // 날짜가 바뀌면 타임블록 선택은 초기화 (다른 날 타임블록이 남지 않도록)
    setSelectedTimeBlockId(null)
  }, [])

  const selectTimeBlock = useCallback((timeBlockId: string | null) => {
    setSelectedTimeBlockId(timeBlockId)
  }, [])

  return {
    selectedDayId: effectiveDayId,
    selectedTimeBlockId,
    selectDay,
    selectTimeBlock,
    days,
    timeBlocksOfDay,
    visiblePins,
  }
}
