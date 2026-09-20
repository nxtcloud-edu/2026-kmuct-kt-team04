import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { KakaoMap, KakaoMapsNamespace, KakaoMarker } from '../types/kakao'
import type { Pin } from '../../../../shared/contracts'
import { loadKakaoMaps } from '../lib/kakaoLoader'

// Kakao 지도 인스턴스를 생성하고, 핀 목록을 마커로 렌더/정리합니다.
// 지도 표시·확대/축소·이동은 SDK 기본 동작이며, 마커 클릭은 onPinClick으로 전달합니다.

const DEFAULT_CENTER = { lat: 35.1587, lng: 129.1604 } // 부산 인근 (예시)
const DEFAULT_LEVEL = 6

interface UseKakaoMapOptions {
  pins: Pin[]
  onPinClick: (pinId: string) => void
}

interface UseKakaoMapResult {
  containerRef: RefObject<HTMLDivElement | null>
  ready: boolean
  error: string | null
}

export function useKakaoMap({ pins, onPinClick }: UseKakaoMapOptions): UseKakaoMapResult {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapsRef = useRef<KakaoMapsNamespace | null>(null)
  const mapRef = useRef<KakaoMap | null>(null)
  const markersRef = useRef<KakaoMarker[]>([])
  const clickRef = useRef(onPinClick)
  clickRef.current = onPinClick

  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 지도 1회 생성
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const maps = await loadKakaoMaps()
        if (cancelled || !containerRef.current) return
        mapsRef.current = maps
        mapRef.current = new maps.Map(containerRef.current, {
          center: new maps.LatLng(DEFAULT_CENTER.lat, DEFAULT_CENTER.lng),
          level: DEFAULT_LEVEL,
        })
        setReady(true)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // 핀 → 마커 렌더 (핀 목록이 바뀔 때마다 갱신)
  useEffect(() => {
    const maps = mapsRef.current
    const map = mapRef.current
    if (!maps || !map) return

    // 기존 마커 제거
    markersRef.current.forEach(m => m.setMap(null))
    markersRef.current = []

    if (pins.length === 0) return

    const bounds = new maps.LatLngBounds()
    pins.forEach(pin => {
      const position = new maps.LatLng(pin.latitude, pin.longitude)
      const marker = new maps.Marker({ position, map, title: pin.title })
      maps.event.addListener(marker, 'click', () => clickRef.current(pin.id))
      markersRef.current.push(marker)
      bounds.extend(position)
    })

    // 마커가 여러 개면 전체가 보이도록 범위 맞춤 (지도 이동은 화면 상태일 뿐 저장하지 않음)
    if (pins.length > 1 && !bounds.isEmpty()) {
      map.setBounds(bounds)
    } else if (pins.length === 1) {
      map.panTo(new maps.LatLng(pins[0].latitude, pins[0].longitude))
    }
  }, [pins, ready])

  // 언마운트 시 마커 정리
  useEffect(() => {
    return () => {
      markersRef.current.forEach(m => m.setMap(null))
      markersRef.current = []
    }
  }, [])

  return { containerRef, ready, error }
}
