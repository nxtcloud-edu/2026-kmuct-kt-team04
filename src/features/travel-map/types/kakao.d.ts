// Kakao Maps JavaScript SDK — Pintravle에서 사용하는 최소 타입 선언.

export interface KakaoLatLng {
  getLat(): number
  getLng(): number
}

export interface KakaoMouseEvent { latLng: KakaoLatLng }

export interface KakaoMap {
  setCenter(latlng: KakaoLatLng): void
  getCenter(): KakaoLatLng
  setLevel(level: number): void
  getLevel(): number
  panTo(latlng: KakaoLatLng): void
  setBounds(bounds: KakaoLatLngBounds): void
}

export interface KakaoLatLngBounds {
  extend(latlng: KakaoLatLng): void
  isEmpty(): boolean
}

export interface KakaoCustomOverlay {
  setMap(map: KakaoMap | null): void
  setPosition(latlng: KakaoLatLng): void
}

export interface KakaoPolyline { setMap(map: KakaoMap | null): void }

export interface KakaoMapsNamespace {
  Map: new (container: HTMLElement, options: { center: KakaoLatLng; level: number }) => KakaoMap
  LatLng: new (lat: number, lng: number) => KakaoLatLng
  LatLngBounds: new () => KakaoLatLngBounds
  CustomOverlay: new (options: {
    position: KakaoLatLng
    content: HTMLElement | string
    map?: KakaoMap
    xAnchor?: number
    yAnchor?: number
    zIndex?: number
    clickable?: boolean
  }) => KakaoCustomOverlay
  Polyline: new (options: {
    path: KakaoLatLng[]
    map?: KakaoMap
    strokeWeight?: number
    strokeColor?: string
    strokeOpacity?: number
    strokeStyle?: string
  }) => KakaoPolyline
  event: {
    addListener(target: object, type: string, handler: (...args: unknown[]) => void): void
    removeListener(target: object, type: string, handler: (...args: unknown[]) => void): void
  }
  load(callback: () => void): void
}

declare global {
  interface Window { kakao?: { maps?: KakaoMapsNamespace } }
}

export {}
