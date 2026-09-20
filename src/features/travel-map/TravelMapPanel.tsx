import { useState } from 'react'
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
}

export function TravelMapPanel({ roomId }: TravelMapPanelProps) {
  const effectiveRoomId = roomId ?? exampleRoomState.room.id
  const room = useRoomData(effectiveRoomId)
  const selection = useMapSelection(room.state)
  const [openPinId, setOpenPinId] = useState<string | null>(null)

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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {room.mode === 'demo' && (
        <div style={demoBanner}>
          임시 데이터 모드 (AWS 미연결) — 변경 사항은 브라우저 메모리에만 저장되며 새로고침 시 사라집니다.
        </div>
      )}
      {room.error && <div style={errorBanner}>오류: {room.error}</div>}

      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
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

        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
          <div style={{ flex: 1, minHeight: 0 }}>
            <MapView pins={selection.visiblePins} onPinClick={setOpenPinId} />
          </div>
          <PlaceSearchPanel targetTimeBlock={selectedTimeBlock} onAddPin={handleAddPin} />
        </div>
      </div>

      {openPin && (
        <PinMemoPopup pin={openPin} onSave={handleSavePin} onClose={() => setOpenPinId(null)} />
      )}
    </div>
  )
}

const demoBanner: CSSProperties = {
  padding: '0.5rem 1rem', background: '#fef3c7', color: '#92400e', fontSize: '0.85rem', borderBottom: '1px solid #fde68a',
}
const errorBanner: CSSProperties = {
  padding: '0.5rem 1rem', background: '#fee2e2', color: '#991b1b', fontSize: '0.85rem', borderBottom: '1px solid #fecaca',
}

export default TravelMapPanel
