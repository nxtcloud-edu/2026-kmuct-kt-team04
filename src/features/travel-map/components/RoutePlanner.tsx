import type { Pin } from '../../../../shared/contracts'
import type { RouteMode, RouteResult } from '../types/route'

export type RouteSelectionStep = 'start' | 'destination' | 'ready'

interface RoutePlannerProps {
  open: boolean
  pins: Pin[]
  selectedTimeBlockTitle: string | null
  startPinId: string | null
  destinationPinId: string | null
  step: RouteSelectionStep
  mode: RouteMode
  routes: RouteResult[]
  selectedRouteId: string | null
  routeName: string
  loading: boolean
  saving: boolean
  error: string
  onOpen: () => void
  onClose: () => void
  onRestart: () => void
  onChoosePin: (pinId: string) => void
  onModeChange: (mode: RouteMode) => void
  onSelectRoute: (route: RouteResult) => void
  onRouteNameChange: (name: string) => void
  onSaveRoute: (name: string) => Promise<void>
}

const MODES: Array<{ id: RouteMode; icon: string; label: string; available: boolean }> = [
  { id: 'car', icon: '🚗', label: '차량', available: true },
  { id: 'transit', icon: '🚌', label: '대중교통', available: false },
  { id: 'walk', icon: '🚶', label: '도보', available: false },
  { id: 'bicycle', icon: '🚲', label: '자전거', available: false },
]

export function RoutePlanner(props: RoutePlannerProps) {
  const { open, pins, selectedTimeBlockTitle, startPinId, destinationPinId, step, mode, routes,
    selectedRouteId, routeName, loading, saving, error, onOpen, onClose, onRestart, onChoosePin,
    onModeChange, onSelectRoute, onRouteNameChange, onSaveRoute } = props
  if (!open) return <button type="button" className="route-edge-button" onClick={onOpen}>↝ 경로 생성</button>
  const start = pins.find(pin => pin.id === startPinId)
  const destination = pins.find(pin => pin.id === destinationPinId)
  return (
    <section className="route-planner" aria-label="경로 생성">
      <header><div><span>ROUTE</span><strong>경로 생성</strong></div><button type="button" onClick={onClose}>×</button></header>
      <div className="route-planner__guide">
        {!selectedTimeBlockTitle && '경로를 만들려면 오른쪽 일정에서 타임블록을 먼저 선택하세요.'}
        {selectedTimeBlockTitle && step === 'start' && <><b>{selectedTimeBlockTitle}</b>의 출발 핀을 선택하세요.</>}
        {selectedTimeBlockTitle && step === 'destination' && '이제 같은 타임블록의 도착 핀을 선택하세요.'}
        {selectedTimeBlockTitle && step === 'ready' && <><b>{start?.title}</b><span> → </span><b>{destination?.title}</b></>}
      </div>
      {selectedTimeBlockTitle && step !== 'ready' && <div className="route-planner__pins">
        {pins.map(pin => <button type="button" key={pin.id} disabled={step === 'destination' && pin.id === startPinId} onClick={() => onChoosePin(pin.id)}>
          <i className={`route-pin-dot route-pin-dot--${pin.status}`} />{pin.title}</button>)}
        {pins.length < 2 && <p>경로를 만들려면 이 타임블록에 핀이 2개 이상 필요합니다.</p>}
      </div>}
      {selectedTimeBlockTitle && step === 'ready' && <>
        <div className="route-planner__modes">{MODES.map(item => <button type="button" key={item.id} className={mode === item.id ? 'active' : ''}
          onClick={() => onModeChange(item.id)} title={item.available ? item.label : 'Kakao 공식 상세 경로 API 미지원'}>
          <span>{item.icon}</span>{item.label}{!item.available && <small>별도 API</small>}
        </button>)}</div>
        {loading && <p className="route-planner__status">차량 경로를 계산하고 있어요…</p>}
        {error && <p className="route-planner__error">{error}</p>}
        {mode === 'transit' && <div className="route-planner__unsupported"><strong>대중교통 경로 3개</strong><p>Kakao Mobility 차량 길찾기 API에는 대중교통 경로가 없습니다. ODsay 등 대중교통 공급자 키를 연결하면 이 영역에 3개 안을 표시할 수 있습니다.</p></div>}
        {(mode === 'walk' || mode === 'bicycle') && <div className="route-planner__unsupported"><p>Kakao Mobility 공식 상세 경로 API에서 이 이동수단을 제공하지 않습니다.</p></div>}
        {mode === 'car' && routes.length > 0 && <div className="route-planner__results">{routes.map((route, index) => <button type="button" key={route.id}
          className={selectedRouteId === route.id ? 'active' : ''} onClick={() => onSelectRoute(route)}>
          <span>🚗 경로 {index + 1}</span><strong>{route.label}</strong><small>{formatDistance(route.distanceMeters)}</small></button>)}</div>}
        {mode === 'car' && selectedRouteId && <div className="route-planner__save">
          <label htmlFor="route-name">경로 이름</label>
          <div><input id="route-name" value={routeName} maxLength={100} onChange={event => onRouteNameChange(event.target.value)} placeholder="예: 숙소에서 박물관" />
            <button type="button" disabled={saving || !routeName.trim()} onClick={() => void onSaveRoute(routeName)}>{saving ? '저장 중…' : '경로 저장'}</button></div>
          <small>저장하면 서버가 도착 핀을 출발 핀 바로 다음 순서로 정리합니다.</small>
        </div>}
        <button type="button" className="route-planner__restart" onClick={onRestart}>출발·도착 다시 선택</button>
      </>}
    </section>
  )
}

function formatDistance(meters: number) {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${meters} m`
}
