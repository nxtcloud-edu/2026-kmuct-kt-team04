import type { CSSProperties } from 'react'
import type { Pin } from '../../../../shared/contracts'
import { useKakaoMap } from '../hooks/useKakaoMap'

interface MapViewProps {
  pins: Pin[]
  onPinClick: (pinId: string) => void
}

// 카카오 지도 + 필터된 핀 마커.
// 지도 표시/확대·축소/이동은 SDK 기본 제스처로 동작합니다.
export function MapView({ pins, onPinClick }: MapViewProps) {
  const { containerRef, ready, error } = useKakaoMap({ pins, onPinClick })

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: 320 }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%', minHeight: 320 }} />

      {!ready && !error && (
        <div style={overlayStyle}>지도를 불러오는 중…</div>
      )}
      {error && (
        <div style={{ ...overlayStyle, color: '#b91c1c', textAlign: 'center', padding: '0 1rem' }}>
          <div>
            <p style={{ margin: 0, fontWeight: 600 }}>지도를 불러오지 못했습니다.</p>
            <p style={{ margin: '0.5rem 0 0', fontSize: '0.85rem' }}>{error}</p>
            <p style={{ margin: '0.5rem 0 0', fontSize: '0.8rem', color: '#64748b' }}>
              VITE_KAKAO_JS_KEY 설정과 카카오 개발자 콘솔의 도메인 등록을 확인하세요.
            </p>
          </div>
        </div>
      )}
      {ready && pins.length === 0 && (
        <div style={{ ...overlayStyle, pointerEvents: 'none', background: 'transparent', color: '#64748b' }}>
          표시할 핀이 없습니다. 장소를 검색해 타임블록에 추가해 보세요.
        </div>
      )}
    </div>
  )
}

const overlayStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(248, 250, 252, 0.85)',
  color: '#334155',
  fontSize: '0.9rem',
}
