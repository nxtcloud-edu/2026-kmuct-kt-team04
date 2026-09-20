import type { CSSProperties } from 'react'
import type { Pin } from '../../../../shared/contracts'
import type { RouteResult } from '../types/route'
import { useKakaoMap } from '../hooks/useKakaoMap'

interface MapViewProps {
  pins: Pin[]
  visitOrderByPinId: Record<string, number>
  route: RouteResult | null
  focusPinRequest: { pinId: string; nonce: number } | null
  onPinClick: (pinId: string) => void
  onMapRightClick: (point: { latitude: number; longitude: number }) => void
}

export function MapView(props: MapViewProps) {
  const { containerRef, ready, error } = useKakaoMap(props)
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: 320 }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%', minHeight: 320 }} />
      {!ready && !error && <div style={overlayStyle}>지도를 불러오는 중…</div>}
      {error && (
        <div style={{ ...overlayStyle, color: '#b91c1c', textAlign: 'center', padding: '0 1rem' }}>
          <div><p style={{ margin: 0, fontWeight: 600 }}>지도를 불러오지 못했습니다.</p>
            <p style={{ margin: '0.5rem 0 0', fontSize: '0.85rem' }}>{error}</p>
            <p style={{ margin: '0.5rem 0 0', fontSize: '0.8rem', color: '#64748b' }}>VITE_KAKAO_JS_KEY와 등록 도메인을 확인하세요.</p></div>
        </div>
      )}
      {ready && props.pins.length === 0 && (
        <div style={{ ...overlayStyle, pointerEvents: 'none', background: 'transparent', color: '#64748b' }}>
          표시할 핀이 없습니다. 타임블록을 선택한 뒤 지도를 우클릭해 핀을 추가하세요.
        </div>
      )}
    </div>
  )
}

const overlayStyle: CSSProperties = {
  position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'rgba(248, 250, 252, 0.85)', color: '#334155', fontSize: '0.9rem',
}
