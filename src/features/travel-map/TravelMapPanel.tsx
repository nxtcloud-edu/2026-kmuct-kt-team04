import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { exampleRoomState } from '../../../shared/example-room-state'
import type { Pin, TimeBlock, TravelRoute } from '../../../shared/contracts'
import { useRoomData } from './hooks/useRoomData'
import { useMapSelection } from './hooks/useMapSelection'
import { MapView } from './components/MapView'
import { ScheduleSidebar } from './components/ScheduleSidebar'
import { PlaceSearchPanel } from './components/PlaceSearchPanel'
import { PinMemoPopup, type PinMemoValues } from './components/PinMemoPopup'
import { ManualPinDialog } from './components/ManualPinDialog'
import { RoutePlanner, type RouteSelectionStep } from './components/RoutePlanner'
import { RouteEditorDialog } from './components/RouteEditorDialog'
import type { TimeBlockFormValues } from './components/TimeBlockForm'
import type { PlaceSearchResult } from './services/placeSearch'
import { requestRoutes } from './services/routeService'
import { travelRouteToRouteResult, type RouteMode, type RouteResult } from './types/route'

interface TravelMapPanelProps {
  roomId?: string
  onSelectedTimeBlockChange?: (timeBlockId: string | null) => void
}

const EMPTY_PINS: Pin[] = []
const EMPTY_ROUTES: TravelRoute[] = []

export function TravelMapPanel({ roomId, onSelectedTimeBlockChange }: TravelMapPanelProps) {
  const effectiveRoomId = roomId ?? exampleRoomState.room.id
  const room = useRoomData(effectiveRoomId)
  const selection = useMapSelection(room.state)
  const [openPinId, setOpenPinId] = useState<string | null>(null)
  const [focusPinRequest, setFocusPinRequest] = useState<{ pinId: string; nonce: number } | null>(null)
  const [manualPoint, setManualPoint] = useState<{ latitude: number; longitude: number } | null>(null)
  const [scheduleOpen, setScheduleOpen] = useState(true)
  const [notice, setNotice] = useState('')
  const [routeOpen, setRouteOpen] = useState(false)
  const [routeStep, setRouteStep] = useState<RouteSelectionStep>('start')
  const [startPinId, setStartPinId] = useState<string | null>(null)
  const [destinationPinId, setDestinationPinId] = useState<string | null>(null)
  const [routeMode, setRouteMode] = useState<RouteMode>('car')
  const [routes, setRoutes] = useState<RouteResult[]>([])
  const [selectedRoute, setSelectedRoute] = useState<RouteResult | null>(null)
  const [routeName, setRouteName] = useState('')
  const [routeLoading, setRouteLoading] = useState(false)
  const [routeSaving, setRouteSaving] = useState(false)
  const [routeError, setRouteError] = useState('')
  const [storedRouteSelection, setStoredRouteSelection] = useState<{ blockId: string; routeId: string | null } | null>(null)
  const [editorRouteId, setEditorRouteId] = useState<string | null>(null)
  const routeGeneration = useRef(0)

  const pins = room.state?.pins ?? EMPTY_PINS
  const storedRoutes = room.state?.routes ?? EMPTY_ROUTES
  const selectedTimeBlock = selection.timeBlocksOfDay.find(block => block.id === selection.selectedTimeBlockId) ?? null
  const routePins = selectedTimeBlock ? pins.filter(pin => pin.timeBlockId === selectedTimeBlock.id) : EMPTY_PINS
  const selectionForCurrentBlock = storedRouteSelection && storedRouteSelection.blockId === selectedTimeBlock?.id
    ? storedRouteSelection.routeId
    : undefined
  const selectedStoredRoute = selectedTimeBlock && selectionForCurrentBlock !== null
    ? (selectionForCurrentBlock ? storedRoutes.find(route => route.id === selectionForCurrentBlock) : storedRoutes.find(route => route.timeBlockId === selectedTimeBlock.id)) ?? null
    : null
  const selectedStoredRouteId = selectedStoredRoute?.id ?? null
  const editorRoute = storedRoutes.find(route => route.id === editorRouteId) ?? null
  const displayedRoute = selectedRoute ?? (selectedStoredRoute ? travelRouteToRouteResult(selectedStoredRoute) : null)

  useEffect(() => { onSelectedTimeBlockChange?.(selection.selectedTimeBlockId) }, [onSelectedTimeBlockChange, selection.selectedTimeBlockId])
  useEffect(() => {
    // RoomState watcher에서 endpoint 핀 삭제를 감지하면 진행 중 계산만 초기화합니다.
    // oxlint-disable-next-line react/set-state-in-effect
    if (startPinId && !pins.some(pin => pin.id === startPinId)) resetRoute()
    if (destinationPinId && !pins.some(pin => pin.id === destinationPinId)) resetRoute()
  }, [destinationPinId, pins, startPinId])

  const openPin = pins.find(pin => pin.id === openPinId) ?? null

  function showNotice(message: string) {
    setNotice(message)
    window.setTimeout(() => setNotice(''), 4000)
  }
  async function handleCreateTimeBlock(dayId: string, values: TimeBlockFormValues) {
    await room.createTimeBlock({ roomId: effectiveRoomId, dayId, title: values.title, startTime: values.startTime,
      endTime: values.endTime, description: values.description, requestId: crypto.randomUUID() })
  }
  async function handleUpdateTimeBlock(block: TimeBlock, values: TimeBlockFormValues) {
    await room.updateTimeBlock({ roomId: effectiveRoomId, timeBlockId: block.id, title: values.title,
      startTime: values.startTime, endTime: values.endTime, description: values.description, expectedVersion: block.version })
  }
  async function handleDeleteTimeBlock(block: TimeBlock) {
    await room.deleteTimeBlock({ roomId: effectiveRoomId, timeBlockId: block.id,
      expectedVersion: block.version, requestId: crypto.randomUUID() })
    if (selection.selectedTimeBlockId === block.id) handleSelectTimeBlock(null)
    setOpenPinId(null)
  }
  async function handleVisitOrder(pin: Pin, visitOrder: number) {
    await room.updatePin({ roomId: effectiveRoomId, pinId: pin.id, title: pin.title,
      description: pin.description, category: pin.category, status: pin.status, visitOrder, expectedVersion: pin.version })
  }
  async function handleAddPin(timeBlockId: string, place: PlaceSearchResult) {
    await room.createPin({ roomId: effectiveRoomId, timeBlockId, title: place.title, latitude: place.latitude,
      longitude: place.longitude, placeProvider: place.placeProvider, placeId: place.placeId,
      description: place.address ?? '', category: place.category ?? '', requestId: crypto.randomUUID() })
  }
  async function handleSavePin(pin: Pin, values: PinMemoValues) {
    await room.updatePin({ roomId: effectiveRoomId, pinId: pin.id, ...values, expectedVersion: pin.version })
  }
  async function handleDeletePin(pin: Pin) {
    await room.deletePin({ roomId: effectiveRoomId, pinId: pin.id, expectedVersion: pin.version, requestId: crypto.randomUUID() })
    setOpenPinId(null)
  }
  async function handleReorderPins(block: TimeBlock, orderedPinIds: string[]) {
    await room.reorderPins({ roomId: effectiveRoomId, timeBlockId: block.id, orderedPinIds, expectedVersion: block.version, requestId: crypto.randomUUID() })
  }
  function handleMapRightClick(point: { latitude: number; longitude: number }) {
    if (!selectedTimeBlock) {
      showNotice('직접 핀을 만들려면 오른쪽 일정에서 타임블록을 먼저 선택하세요.')
      return
    }
    setManualPoint(point)
  }
  async function createManualPin(title: string, description: string) {
    if (!manualPoint || !selectedTimeBlock) return
    await room.createPin({ roomId: effectiveRoomId, timeBlockId: selectedTimeBlock.id, title,
      latitude: manualPoint.latitude, longitude: manualPoint.longitude, placeProvider: 'manual',
      description, category: '직접 지정', requestId: crypto.randomUUID() })
  }

  const calculateRoute = useCallback(async (originId: string, destinationId: string, mode: RouteMode) => {
    const generation = ++routeGeneration.current
    const currentPins = room.state?.pins ?? []
    const origin = currentPins.find(pin => pin.id === originId)
    const destination = currentPins.find(pin => pin.id === destinationId)
    setRouteMode(mode); setRoutes([]); setSelectedRoute(null); setRouteError('')
    if (!selection.selectedTimeBlockId || !origin || !destination ||
      origin.timeBlockId !== selection.selectedTimeBlockId || destination.timeBlockId !== selection.selectedTimeBlockId) {
      setRouteError('같은 타임블록의 출발 핀과 도착 핀을 선택하세요.')
      return
    }
    if (mode !== 'car') return
    setRouteLoading(true)
    try {
      const result = await requestRoutes(origin, destination, mode)
      if (routeGeneration.current !== generation) return
      setRoutes(result); setSelectedRoute(result[0] ?? null)
    } catch (reason) {
      if (routeGeneration.current === generation) setRouteError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      if (routeGeneration.current === generation) setRouteLoading(false)
    }
  }, [room.state?.pins, selection.selectedTimeBlockId])

  function chooseRoutePin(pinId: string) {
    const pin = routePins.find(value => value.id === pinId)
    if (!pin || !selectedTimeBlock || pin.timeBlockId !== selectedTimeBlock.id) return
    if (routeStep === 'start') {
      setStartPinId(pinId); setDestinationPinId(null); setRoutes([]); setSelectedRoute(null); setRouteName(''); setRouteStep('destination')
      return
    }
    if (routeStep === 'destination') {
      if (pinId === startPinId) return
      setDestinationPinId(pinId); setRouteStep('ready')
      const start = routePins.find(value => value.id === startPinId)
      setRouteName(start ? `${start.title} → ${pin.title}` : '')
      if (startPinId) void calculateRoute(startPinId, pinId, routeMode)
    }
  }
  function focusPin(pinId: string) {
    setFocusPinRequest({ pinId, nonce: Date.now() })
  }
  function handlePinClick(pinId: string) {
    setOpenPinId(pinId)
  }
  function resetRoute() {
    routeGeneration.current += 1
    setRouteLoading(false)
    setRouteStep('start'); setStartPinId(null); setDestinationPinId(null); setRoutes([]); setSelectedRoute(null); setRouteName(''); setRouteError('')
  }
  function changeRouteMode(mode: RouteMode) {
    setRouteMode(mode); setRouteError(''); setRoutes([]); setSelectedRoute(null)
    if (startPinId && destinationPinId) void calculateRoute(startPinId, destinationPinId, mode)
  }
  async function handleCreateRoute(name: string) {
    const origin = pins.find(pin => pin.id === startPinId)
    const destination = pins.find(pin => pin.id === destinationPinId)
    const trimmedName = name.trim()
    if (!selectedTimeBlock || !origin || !destination || origin.timeBlockId !== selectedTimeBlock.id || destination.timeBlockId !== selectedTimeBlock.id) {
      setRouteError('저장하려면 같은 타임블록의 출발 핀과 도착 핀이 필요합니다.')
      return
    }
    if (!selectedRoute || routeMode !== 'car' || !trimmedName) {
      setRouteError('저장할 차량 경로와 이름을 확인하세요.')
      return
    }
    const requestId = crypto.randomUUID()
    setRouteSaving(true)
    setRouteError('')
    try {
      await room.createRoute({ roomId: effectiveRoomId, timeBlockId: selectedTimeBlock.id, name: trimmedName,
        mode: 'car', originPinId: origin.id, destinationPinId: destination.id,
        distanceMeters: selectedRoute.distanceMeters, durationSeconds: selectedRoute.durationSeconds,
        path: selectedRoute.path, requestId })
      setStoredRouteSelection({ blockId: selectedTimeBlock.id, routeId: requestId })
      setRouteOpen(false)
      resetRoute()
      showNotice('경로를 저장했습니다. 도착 핀 순서가 출발 핀 바로 다음으로 갱신되었습니다.')
    } catch (reason) {
      setRouteError(reason instanceof Error ? reason.message : String(reason))
    } finally { setRouteSaving(false) }
  }
  function handleSelectDay(dayId: string) {
    setStoredRouteSelection(null)
    setEditorRouteId(null)
    resetRoute()
    selection.selectDay(dayId)
  }
  function handleSelectTimeBlock(timeBlockId: string | null) {
    setStoredRouteSelection(null)
    setEditorRouteId(null)
    resetRoute()
    selection.selectTimeBlock(timeBlockId)
  }
  function handleSelectStoredRoute(route: TravelRoute) {
    setStoredRouteSelection({ blockId: route.timeBlockId, routeId: route.id })
    setEditorRouteId(route.id)
  }
  function dismissStoredRoute() {
    if (selection.selectedTimeBlockId) setStoredRouteSelection({ blockId: selection.selectedTimeBlockId, routeId: null })
    setEditorRouteId(null)
  }
  async function handleUpdateRoute(routeId: string, name: string, recalculated?: RouteResult) {
    const current = room.state?.routes.find(route => route.id === routeId)
    if (!current) throw new Error('수정할 저장 경로를 찾을 수 없습니다.')
    await room.updateRoute({ roomId: effectiveRoomId, routeId, name,
      distanceMeters: recalculated?.distanceMeters ?? current.distanceMeters,
      durationSeconds: recalculated?.durationSeconds ?? current.durationSeconds,
      path: recalculated?.path ?? current.path, expectedVersion: current.version, requestId: crypto.randomUUID() })
  }
  async function handleDeleteRoute(routeId: string) {
    const current = room.state?.routes.find(route => route.id === routeId)
    if (!current) throw new Error('삭제할 저장 경로를 찾을 수 없습니다.')
    await room.deleteRoute({ roomId: effectiveRoomId, routeId, expectedVersion: current.version, requestId: crypto.randomUUID() })
    if (selectedStoredRouteId === routeId && selection.selectedTimeBlockId) {
      setStoredRouteSelection({ blockId: selection.selectedTimeBlockId, routeId: null })
    }
    setEditorRouteId(null)
  }

  return (
    <div style={rootStyle}>
      <div style={mapLayer}><MapView pins={selection.visiblePins} visitOrderByPinId={selection.visitOrderByPinId}
        route={displayedRoute} focusPinRequest={focusPinRequest} onPinClick={handlePinClick} onMapRightClick={handleMapRightClick} /></div>
      <div style={topBanners}>
        {room.mode === 'demo' && <div style={demoBanner}>데모 데이터 모드 · 변경 사항은 새로고침하면 초기화됩니다.</div>}
        {(room.error || notice) && <div style={room.error ? errorBanner : noticeBanner}>{room.error ? `오류: ${room.error}` : notice}</div>}
      </div>
      {selectedStoredRoute && !selectedRoute && <div className="saved-route-banner">
        <button type="button" className="saved-route-banner__main" onClick={() => setEditorRouteId(selectedStoredRoute.id)} title="저장 경로 편집">
          <span aria-hidden="true">🚗</span><span>{selectedStoredRoute.name}</span></button>
        <button type="button" className="saved-route-banner__close" onClick={dismissStoredRoute} aria-label="지도에서 경로 닫기">×</button>
      </div>}

      {scheduleOpen ? <div style={schedulePanel}>
        <div style={schedulePanelHeader}><span style={{ fontWeight: 700 }}>여행 타임라인</span>
          <button type="button" onClick={() => setScheduleOpen(false)} style={collapseBtn} aria-label="일정 접기">›</button></div>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}><ScheduleSidebar
          days={selection.days} selectedDayId={selection.selectedDayId} onSelectDay={handleSelectDay}
          timeBlocks={selection.timeBlocksOfDay} selectedTimeBlockId={selection.selectedTimeBlockId}
          onSelectTimeBlock={handleSelectTimeBlock} pins={pins} routes={storedRoutes} onFocusPin={focusPin}
          onSelectRoute={handleSelectStoredRoute} onReorderPins={handleReorderPins} onSetVisitOrder={handleVisitOrder}
          onDeleteTimeBlock={handleDeleteTimeBlock}
          onCreateTimeBlock={handleCreateTimeBlock} onUpdateTimeBlock={handleUpdateTimeBlock} /></div>
        <PlaceSearchPanel targetTimeBlock={selectedTimeBlock} onAddPin={handleAddPin} />
      </div> : <button type="button" onClick={() => setScheduleOpen(true)} style={expandBtn} aria-label="일정 펼치기">‹ 일정</button>}

      <RoutePlanner open={routeOpen} pins={routePins} selectedTimeBlockTitle={selectedTimeBlock?.title ?? null}
        startPinId={startPinId} destinationPinId={destinationPinId} step={routeStep} mode={routeMode}
        routes={routes} selectedRouteId={selectedRoute?.id ?? null} routeName={routeName}
        loading={routeLoading} saving={routeSaving} error={routeError}
        onOpen={() => { setRouteOpen(true); resetRoute() }} onClose={() => { setRouteOpen(false); resetRoute() }}
        onRestart={resetRoute} onChoosePin={chooseRoutePin} onModeChange={changeRouteMode}
        onSelectRoute={setSelectedRoute} onRouteNameChange={setRouteName} onSaveRoute={handleCreateRoute} />

      {openPin && <PinMemoPopup key={`${openPin.id}:${openPin.version}`} pin={openPin}
        order={selection.visitOrderByPinId[openPin.id]} onSave={handleSavePin} onDelete={handleDeletePin} onClose={() => setOpenPinId(null)} />}
      {manualPoint && selectedTimeBlock && <ManualPinDialog point={manualPoint} timeBlockTitle={selectedTimeBlock.title}
        onCreate={createManualPin} onClose={() => setManualPoint(null)} />}
      {editorRoute && <RouteEditorDialog key={`${editorRoute.id}:${editorRoute.version}`} route={editorRoute} pins={pins}
        onUpdate={handleUpdateRoute} onDelete={handleDeleteRoute} onClose={() => setEditorRouteId(null)} />}
    </div>
  )
}

const rootStyle: CSSProperties = { position: 'relative', width: '100%', height: '100%', minHeight: 400, overflow: 'hidden' }
const mapLayer: CSSProperties = { position: 'absolute', inset: 0 }
const topBanners: CSSProperties = { position: 'absolute', top: '4.75rem', left: '50%', transform: 'translateX(-50%)', zIndex: 20, display: 'flex', flexDirection: 'column', gap: '0.25rem', maxWidth: '90%' }
const schedulePanel: CSSProperties = { position: 'absolute', top: '4.75rem', right: '0.75rem', bottom: '5.25rem', zIndex: 15, width: 340, maxWidth: 'calc(100vw - 1.5rem)', display: 'flex', flexDirection: 'column', background: 'rgba(255,255,255,0.96)', borderRadius: 16, boxShadow: '0 16px 50px rgba(15,23,42,0.2)', overflow: 'hidden', backdropFilter: 'blur(12px)' }
const schedulePanelHeader: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.7rem 0.9rem', borderBottom: '1px solid #e2e8f0', background: 'rgba(248,250,252,0.92)' }
const collapseBtn: CSSProperties = { border: 'none', background: 'none', fontSize: '1.35rem', cursor: 'pointer', color: '#64748b', lineHeight: 1 }
const expandBtn: CSSProperties = { position: 'absolute', top: '4.75rem', right: '0.75rem', zIndex: 15, padding: '0.55rem 0.85rem', border: '1px solid rgba(148,163,184,0.35)', borderRadius: 12, cursor: 'pointer', background: 'rgba(255,255,255,0.96)', boxShadow: '0 8px 24px rgba(15,23,42,0.18)', fontWeight: 700, color: '#334155' }
const demoBanner: CSSProperties = { padding: '0.45rem 0.85rem', background: '#fef3c7', color: '#92400e', fontSize: '0.8rem', borderRadius: 999, border: '1px solid #fde68a', boxShadow: '0 4px 16px rgba(15,23,42,0.1)' }
const errorBanner: CSSProperties = { padding: '0.5rem 1rem', background: '#fee2e2', color: '#991b1b', fontSize: '0.85rem', borderRadius: 8, border: '1px solid #fecaca' }
const noticeBanner: CSSProperties = { ...errorBanner, background: '#dcfce7', color: '#166534', borderColor: '#bbf7d0' }

export default TravelMapPanel
