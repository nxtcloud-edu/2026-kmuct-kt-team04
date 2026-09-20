import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { exampleRoomState } from '../../../shared/example-room-state'
import type { Pin } from '../../../shared/contracts'
import { useRoomData } from './hooks/useRoomData'
import { useMapSelection } from './hooks/useMapSelection'
import { MapView } from './components/MapView'
import { ScheduleSidebar } from './components/ScheduleSidebar'
import { PlaceSearchPanel } from './components/PlaceSearchPanel'
import { PinMemoPopup, type PinMemoValues } from './components/PinMemoPopup'
import type { TimeBlockFormValues } from './components/TimeBlockForm'
import type { PlaceSearchResult } from './services/placeSearch'

// B의 지도·일정 기능 진입 컴포넌트.
// App.tsx(통합 담당 영역)에서 <TravelMapPanel roomId={...} /> 형태로 렌더합니다.
// roomId가 없으면 임시 모드에서 exampleRoomState의 방 id를 사용합니다.
interface TravelMapPanelProps {
  roomId?: string
  /** 선택된 타임블록이 바뀔 때 상위에 알립니다. (채팅 등에서 AI 작업 대상 공유용) */
  onSelectedTimeBlockChange?: (timeBlockId: string | null) => void
}

export function TravelMapPanel({ roomId, onSelectedTimeBlockChange }: TravelMapPanelProps) {
  const effectiveRoomId = roomId ?? exampleRoomState.room.id
  const room = useRoomData(effectiveRoomId)
  const selection = useMapSelection(room.state)
  const [openPinId, setOpenPinId] = useState<string | null>(null)
  // 지도가 메인이므로 일정 패널은 접을 수 있게 둡니다. (지도 위 오버레이)
  const [scheduleOpen, setScheduleOpen] = useState(true)

  // 선택 타임블록 변경을 상위로 전달 (채팅/AI 대상 공유)
  const notifyTimeBlock = onSelectedTimeBlockChange
  useEffect(() => {
    notifyTimeBlock?.(selection.selectedTimeBlockId)
  }, [notifyTimeBlock, selection.selectedTimeBlockId])

  const openPin: Pin | null =
    room.state?.pins.find(p => p.id === openPinId) ?? null

  const selectedTimeBlock =
    selection.timeBlocksOfDay.find(b => b.id === selection.selectedTimeBlockId) ?? null

  // 타임블록 생성: requestId를 새로 만들어 전달. createdBy/시각 등 서버 필드는 넣지 않습니다.
  async function handleCreateTimeBlock(dayId: string, values: TimeBlockFormValues) {
    await room.createTimeBlock({
      roomId: effectiveRoomId,
      dayId,
      title: values.title,
      startTime: values.startTime,
      endTime: values.endTime,
      description: values.description,
      requestId: crypto.randomUUID(),
    })
  }

  async function handleUpdateTimeBlock(
    block: { id: string; version: number },
    values: TimeBlockFormValues,
  ) {
    await room.updateTimeBlock({
      roomId: effectiveRoomId,
      timeBlockId: block.id,
      title: values.title,
      startTime: values.startTime,
      endTime: values.endTime,
      description: values.description,
      expectedVersion: block.version,
    })
  }

  // 검색 결과를 선택 타임블록에 핀으로 추가. 카카오 결과이므로 placeProvider='kakao' + placeId 필수.
  async function handleAddPin(timeBlockId: string, place: PlaceSearchResult) {
    await room.createPin({
      roomId: effectiveRoomId,
      timeBlockId,
      title: place.title,
      latitude: place.latitude,
      longitude: place.longitude,
      placeProvider: place.placeProvider,
      placeId: place.placeId,
      category: place.category ?? '',
      // status 기본값은 candidate (계약 default). 확정은 메모 팝업에서 사용자가 명시적으로.
      requestId: crypto.randomUUID(),
    })
  }

  // 메모 저장: updatePin은 title/description/category/status/expectedVersion을 모두 요구.
  async function handleSavePin(pin: Pin, values: PinMemoValues) {
    await room.updatePin({
      roomId: effectiveRoomId,
      pinId: pin.id,
      title: values.title,
      description: values.description,
      category: values.category,
      status: values.status,
      expectedVersion: pin.version,
    })
  }

  return (
    // 지도가 메인 배경(전체). 일정/검색/배너는 그 위에 떠 있는 오버레이입니다.
    <div style={rootStyle}>
      {/* 지도 배경 */}
      <div style={mapLayer}>
        <MapView pins={selection.visiblePins} onPinClick={setOpenPinId} />
      </div>

      {/* 상단 배너 (임시 모드/오류) */}
      <div style={topBanners}>
        {room.mode === 'demo' && (
          <div style={demoBanner}>
            임시 데이터 모드 (AWS 미연결) — 변경 사항은 브라우저 메모리에만 저장되며 새로고침 시 사라집니다.
          </div>
        )}
        {room.error && <div style={errorBanner}>오류: {room.error}</div>}
      </div>

      {/* 왼쪽 일정(타임테이블) 오버레이 */}
      {scheduleOpen ? (
        <div style={leftPanel}>
          <div style={leftPanelHeader}>
            <span style={{ fontWeight: 700 }}>{room.state?.room.name ?? '여행 일정'}</span>
            <button onClick={() => setScheduleOpen(false)} style={collapseBtn} aria-label="일정 접기">‹</button>
          </div>
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
            <ScheduleSidebar
              days={selection.days}
              selectedDayId={selection.selectedDayId}
              onSelectDay={selection.selectDay}
              timeBlocks={selection.timeBlocksOfDay}
              selectedTimeBlockId={selection.selectedTimeBlockId}
              onSelectTimeBlock={selection.selectTimeBlock}
              pins={room.state?.pins ?? []}
              onCreateTimeBlock={handleCreateTimeBlock}
              onUpdateTimeBlock={handleUpdateTimeBlock}
            />
          </div>
          <PlaceSearchPanel targetTimeBlock={selectedTimeBlock} onAddPin={handleAddPin} />
        </div>
      ) : (
        <button onClick={() => setScheduleOpen(true)} style={expandBtn} aria-label="일정 펼치기">
          일정 ›
        </button>
      )}

      {openPin && (
        <PinMemoPopup pin={openPin} onSave={handleSavePin} onClose={() => setOpenPinId(null)} />
      )}
    </div>
  )
}

const rootStyle: CSSProperties = {
  position: 'relative', width: '100%', height: '100%', minHeight: 400, overflow: 'hidden',
}
const mapLayer: CSSProperties = {
  position: 'absolute', inset: 0,
}
const topBanners: CSSProperties = {
  position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
  zIndex: 20, display: 'flex', flexDirection: 'column', gap: '0.25rem', maxWidth: '90%', marginTop: '0.5rem',
}
const leftPanel: CSSProperties = {
  position: 'absolute', top: '0.75rem', left: '0.75rem', bottom: '0.75rem', zIndex: 15,
  width: 300, maxWidth: '80vw',
  display: 'flex', flexDirection: 'column',
  background: 'rgba(255,255,255,0.97)', borderRadius: 12,
  boxShadow: '0 8px 30px rgba(15,23,42,0.18)', overflow: 'hidden',
}
const leftPanelHeader: CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: '0.6rem 0.9rem', borderBottom: '1px solid #e2e8f0', background: '#f8fafc',
}
const collapseBtn: CSSProperties = {
  border: 'none', background: 'none', fontSize: '1.2rem', cursor: 'pointer', color: '#64748b', lineHeight: 1,
}
const expandBtn: CSSProperties = {
  position: 'absolute', top: '0.75rem', left: '0.75rem', zIndex: 15,
  padding: '0.5rem 0.8rem', border: 'none', borderRadius: 10, cursor: 'pointer',
  background: 'rgba(255,255,255,0.97)', boxShadow: '0 6px 20px rgba(15,23,42,0.18)', fontWeight: 600, color: '#334155',
}
const demoBanner: CSSProperties = {
  padding: '0.5rem 1rem', background: '#fef3c7', color: '#92400e', fontSize: '0.85rem', borderRadius: 8, border: '1px solid #fde68a',
}
const errorBanner: CSSProperties = {
  padding: '0.5rem 1rem', background: '#fee2e2', color: '#991b1b', fontSize: '0.85rem', borderRadius: 8, border: '1px solid #fecaca',
}

export default TravelMapPanel
