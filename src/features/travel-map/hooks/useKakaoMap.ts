import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { Pin } from '../../../../shared/contracts'
import type { KakaoCustomOverlay, KakaoMap, KakaoMapsNamespace, KakaoMouseEvent, KakaoPolyline } from '../types/kakao'
import type { RouteResult } from '../types/route'
import { loadKakaoMaps } from '../lib/kakaoLoader'

const DEFAULT_CENTER = { lat: 35.1587, lng: 129.1604 }
const DEFAULT_LEVEL = 6

interface UseKakaoMapOptions {
  pins: Pin[]
  visitOrderByPinId: Record<string, number>
  route: RouteResult | null
  focusPinRequest: { pinId: string; nonce: number } | null
  onPinClick: (pinId: string) => void
  onMapRightClick: (point: { latitude: number; longitude: number }) => void
}

interface UseKakaoMapResult {
  containerRef: RefObject<HTMLDivElement | null>
  ready: boolean
  error: string | null
}

export function useKakaoMap({ pins, visitOrderByPinId, route, focusPinRequest, onPinClick, onMapRightClick }: UseKakaoMapOptions): UseKakaoMapResult {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapsRef = useRef<KakaoMapsNamespace | null>(null)
  const mapRef = useRef<KakaoMap | null>(null)
  const markerOverlaysRef = useRef<KakaoCustomOverlay[]>([])
  const routePolylineRef = useRef<KakaoPolyline | null>(null)
  const routeLabelRef = useRef<KakaoCustomOverlay | null>(null)
  const fittedPinsRef = useRef('')
  const pinClickRef = useRef(onPinClick)
  const rightClickRef = useRef(onMapRightClick)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { pinClickRef.current = onPinClick }, [onPinClick])
  useEffect(() => { rightClickRef.current = onMapRightClick }, [onMapRightClick])

  useEffect(() => {
    let cancelled = false
    let map: KakaoMap | null = null
    let maps: KakaoMapsNamespace | null = null
    const handleRightClick = (...args: unknown[]) => {
      const event = args[0] as KakaoMouseEvent | undefined
      if (event?.latLng) rightClickRef.current({ latitude: event.latLng.getLat(), longitude: event.latLng.getLng() })
    }
    void (async () => {
      try {
        maps = await loadKakaoMaps()
        if (cancelled || !containerRef.current) return
        mapsRef.current = maps
        map = new maps.Map(containerRef.current, {
          center: new maps.LatLng(DEFAULT_CENTER.lat, DEFAULT_CENTER.lng), level: DEFAULT_LEVEL,
        })
        mapRef.current = map
        maps.event.addListener(map, 'rightclick', handleRightClick)
        setReady(true)
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason))
      }
    })()
    return () => {
      cancelled = true
      if (maps && map) maps.event.removeListener(map, 'rightclick', handleRightClick)
    }
  }, [])

  useEffect(() => {
    const maps = mapsRef.current
    const map = mapRef.current
    if (!maps || !map) return
    markerOverlaysRef.current.forEach(overlay => overlay.setMap(null))
    markerOverlaysRef.current = []
    if (pins.length === 0) { fittedPinsRef.current = ''; return }

    const bounds = new maps.LatLngBounds()
    for (const pin of pins) {
      const position = new maps.LatLng(pin.latitude, pin.longitude)
      const button = document.createElement('button')
      button.type = 'button'
      button.className = `pin-map-marker pin-map-marker--${pin.status}`
      button.title = `${visitOrderByPinId[pin.id] ?? '-'}번째 · ${pin.title}`
      button.setAttribute('aria-label', button.title)
      const glyph = document.createElement('span')
      glyph.className = 'pin-map-marker__glyph'
      glyph.textContent = '●'
      const order = document.createElement('span')
      order.className = 'pin-map-marker__order'
      order.textContent = String(visitOrderByPinId[pin.id] ?? '·')
      button.append(glyph, order)
      button.addEventListener('click', event => { event.stopPropagation(); pinClickRef.current(pin.id) })
      const overlay = new maps.CustomOverlay({ position, content: button, map, xAnchor: 0.5, yAnchor: 1, zIndex: 6, clickable: true })
      markerOverlaysRef.current.push(overlay)
      bounds.extend(position)
    }
    const positionSignature = pins.map(pin => `${pin.id}:${pin.latitude}:${pin.longitude}`).sort().join('|')
    if (positionSignature !== fittedPinsRef.current) {
      if (!route && pins.length > 1 && !bounds.isEmpty()) map.setBounds(bounds)
      else if (!route && pins.length === 1) map.panTo(new maps.LatLng(pins[0].latitude, pins[0].longitude))
      fittedPinsRef.current = positionSignature
    }
  }, [pins, ready, route, visitOrderByPinId])

  useEffect(() => {
    const maps = mapsRef.current
    const map = mapRef.current
    routePolylineRef.current?.setMap(null)
    routeLabelRef.current?.setMap(null)
    routePolylineRef.current = null
    routeLabelRef.current = null
    if (!maps || !map || !route || route.path.length < 2) return

    const path = route.path.map(point => new maps.LatLng(point.latitude, point.longitude))
    routePolylineRef.current = new maps.Polyline({
      map, path, strokeWeight: 6, strokeColor: '#2563eb', strokeOpacity: 0.88, strokeStyle: 'solid',
    })
    const midpoint = route.path[Math.floor(route.path.length / 2)]
    const label = document.createElement('div')
    label.className = 'map-route-label'
    label.textContent = `🚗 ${route.label}`
    routeLabelRef.current = new maps.CustomOverlay({
      map, position: new maps.LatLng(midpoint.latitude, midpoint.longitude), content: label,
      xAnchor: 0.5, yAnchor: 1.5, zIndex: 8,
    })
    const bounds = new maps.LatLngBounds()
    path.forEach(point => bounds.extend(point))
    if (!bounds.isEmpty()) map.setBounds(bounds)
  }, [ready, route])

  useEffect(() => {
    const maps = mapsRef.current
    const map = mapRef.current
    if (!maps || !map || !focusPinRequest) return
    const pin = pins.find(value => value.id === focusPinRequest.pinId)
    if (pin) map.panTo(new maps.LatLng(pin.latitude, pin.longitude))
  }, [focusPinRequest, pins, ready])

  useEffect(() => () => {
    markerOverlaysRef.current.forEach(overlay => overlay.setMap(null))
    routePolylineRef.current?.setMap(null)
    routeLabelRef.current?.setMap(null)
  }, [])

  return { containerRef, ready, error }
}
