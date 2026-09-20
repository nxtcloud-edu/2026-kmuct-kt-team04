// 장소 검색 어댑터.
// - 브라우저에서 카카오 REST 키를 직접 사용하지 않습니다. (VITE_KAKAO_REST_KEY 미사용)
// - 실제 키워드 검색은 C의 검색 기능/서버 API와 연결할 예정입니다.
// - 지금은 교체 가능한 인터페이스 + Mock 구현만 제공하고, 실제 연결 지점을 TODO로 남깁니다.

export interface PlaceSearchResult {
  /** 표시용 장소명. 핀 title 후보. */
  title: string
  latitude: number
  longitude: number
  /** 카카오 검색 결과이므로 핀 생성 시 placeProvider는 'kakao'가 됩니다. */
  placeProvider: 'kakao'
  /** 카카오 place id. createPin 시 placeId로 필수 전달. */
  placeId: string
  /** 카테고리(선택). 핀 category 후보. */
  category?: string
  /** 표시용 주소(선택). */
  address?: string
}

export interface PlaceSearchService {
  /** 키워드로 장소를 검색합니다. */
  searchByKeyword(keyword: string): Promise<PlaceSearchResult[]>
}

/**
 * Mock 검색 서비스.
 * 실제 검색 결과가 아니라 화면 개발용 고정 예시입니다.
 *
 * TODO(C 연결): 아래 Mock을 C가 제공하는 검색 서비스로 교체하세요.
 *   - C의 서버 API(예: AI/검색 함수)가 카카오 REST 키워드 검색을 수행하고
 *     PlaceSearchResult[] 형태로 반환하도록 협의합니다.
 *   - 브라우저는 C의 엔드포인트만 호출하고, 카카오 REST 키는 서버에만 둡니다.
 *   - 반환값에는 반드시 placeId(카카오 place id)와 좌표(latitude/longitude)가 포함되어야
 *     createPin(placeProvider:'kakao')이 계약 검증을 통과합니다.
 */
export class MockPlaceSearchService implements PlaceSearchService {
  searchByKeyword(keyword: string): Promise<PlaceSearchResult[]> {
    const q = keyword.trim()
    if (!q) return Promise.resolve([])

    // 부산 인근 좌표를 예시로 사용합니다. (실제 검색 결과 아님)
    const base = [
      { name: '해운대해수욕장', lat: 35.1587, lng: 129.1604, category: '관광명소', address: '부산 해운대구' },
      { name: '광안리해수욕장', lat: 35.1532, lng: 129.1187, category: '관광명소', address: '부산 수영구' },
      { name: '감천문화마을', lat: 35.0975, lng: 129.0106, category: '관광명소', address: '부산 사하구' },
      { name: '자갈치시장', lat: 35.0966, lng: 129.0306, category: '시장', address: '부산 중구' },
    ]

    const results: PlaceSearchResult[] = base.map((item, index) => ({
      title: `${item.name} (예시: "${q}")`,
      latitude: item.lat,
      longitude: item.lng,
      placeProvider: 'kakao',
      placeId: `mock-${index + 1}`,
      category: item.category,
      address: item.address,
    }))

    return Promise.resolve(results)
  }
}

/** 현재 사용할 검색 서비스. 실제 연결 시 이 팩토리를 C 서비스로 교체합니다. */
export function createPlaceSearchService(): PlaceSearchService {
  // TODO(C 연결): return new KakaoServerPlaceSearchService(endpoint) 형태로 교체.
  return new MockPlaceSearchService()
}
