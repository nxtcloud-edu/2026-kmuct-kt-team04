import { isLocalBackend, localRequest } from '../../../lib/local-api'

export interface PlaceSearchResult {
  title: string
  latitude: number
  longitude: number
  placeProvider: 'kakao' | 'manual'
  placeId?: string
  category?: string
  address?: string
}

export interface PlaceSearchService {
  readonly mode: 'live' | 'demo' | 'unavailable'
  searchByKeyword(keyword: string): Promise<PlaceSearchResult[]>
}

interface LocalPlaceResult {
  placeId: string
  name: string
  latitude: number
  longitude: number
  address: string
  category: string
}

class LocalKakaoPlaceSearchService implements PlaceSearchService {
  readonly mode = 'live' as const

  async searchByKeyword(keyword: string): Promise<PlaceSearchResult[]> {
    const query = keyword.trim()
    if (!query) return []
    const places = await localRequest<LocalPlaceResult[]>('/api/places/search', { query })
    return places.map(place => ({
      title: place.name, latitude: place.latitude, longitude: place.longitude,
      placeProvider: 'kakao', placeId: place.placeId,
      category: place.category, address: place.address,
    }))
  }
}

class UnavailablePlaceSearchService implements PlaceSearchService {
  readonly mode = 'unavailable' as const
  searchByKeyword(): Promise<PlaceSearchResult[]> {
    return Promise.reject(new Error('PLACE_SEARCH_NOT_DEPLOYED: AWS 장소 검색 서버가 아직 연결되지 않았습니다.'))
  }
}

export class MockPlaceSearchService implements PlaceSearchService {
  readonly mode = 'demo' as const

  searchByKeyword(keyword: string): Promise<PlaceSearchResult[]> {
    const query = keyword.trim()
    if (!query) return Promise.resolve([])
    const base = [
      { name: '해운대해수욕장', lat: 35.1587, lng: 129.1604, category: '관광명소', address: '부산 해운대구' },
      { name: '광안리해수욕장', lat: 35.1532, lng: 129.1187, category: '관광명소', address: '부산 수영구' },
      { name: '감천문화마을', lat: 35.0975, lng: 129.0106, category: '관광명소', address: '부산 사하구' },
      { name: '자갈치시장', lat: 35.0966, lng: 129.0306, category: '시장', address: '부산 중구' },
    ]
    return Promise.resolve(base.map(item => ({
      title: `${item.name} (예시: "${query}")`, latitude: item.lat, longitude: item.lng,
      placeProvider: 'manual' as const, category: item.category, address: item.address,
    })))
  }
}

export function createPlaceSearchService(): PlaceSearchService {
  if (isLocalBackend) return new LocalKakaoPlaceSearchService()
  if (import.meta.env.VITE_ROOM_ADAPTER === 'live') return new UnavailablePlaceSearchService()
  return new MockPlaceSearchService()
}
