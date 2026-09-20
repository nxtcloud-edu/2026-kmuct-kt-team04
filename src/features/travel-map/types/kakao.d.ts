// Kakao Maps JavaScript SDK — 최소 타입 선언 (B의 지도 기능에 필요한 부분만).
// 전체 SDK 타입이 필요해지면 확장하세요. 공식 문서: https://apis.map.kakao.com/web/documentation/

export interface KakaoLatLng {
  getLat(): number
  getLng(): number
}

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

export interface KakaoMarker {
  setMap(map: KakaoMap | null): void
  setPosition(latlng: KakaoLatLng): void
  getPosition(): KakaoLatLng
}

export interface KakaoMarkerImage {
  readonly _brand?: 'markerImage'
}

export interface KakaoSize {
  readonly _brand?: 'size'
}

export interface KakaoPoint {
  readonly _brand?: 'point'
}

export interface KakaoMapsNamespace {
  Map: new (container: HTMLElement, options: { center: KakaoLatLng; level: number }) => KakaoMap
  LatLng: new (lat: number, lng: number) => KakaoLatLng
  LatLngBounds: new () => KakaoLatLngBounds
  Marker: new (options: {
    position: KakaoLatLng
    map?: KakaoMap
    title?: string
    image?: KakaoMarkerImage
  }) => KakaoMarker
  MarkerImage: new (src: string, size: KakaoSize, options?: { offset?: KakaoPoint }) => KakaoMarkerImage
  Size: new (width: number, height: number) => KakaoSize
  Point: new (x: number, y: number) => KakaoPoint
  event: {
    addListener(target: object, type: string, handler: (...args: unknown[]) => void): void
    removeListener(target: object, type: string, handler: (...args: unknown[]) => void): void
  }
  load(callback: () => void): void
}

declare global {
  interface Window {
    kakao?: { maps?: KakaoMapsNamespace }
  }
}

export {}
