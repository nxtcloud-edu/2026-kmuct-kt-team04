import type { PlaceSearchResult } from './types'

/**
 * 카카오 로컬 키워드 검색.
 * 백엔드 계약: 카카오 결과는 placeProvider 'kakao', placeId 필수, 좌표는 latitude/longitude.
 * 카카오 응답의 x=경도(longitude), y=위도(latitude)이므로 순서를 뒤집지 않도록 주의한다.
 */
const KAKAO_LOCAL_URL = 'https://dapi.kakao.com/v2/local/search/keyword.json'

interface KakaoDocument {
  id: string
  place_name: string
  category_name: string
  address_name: string
  road_address_name: string
  x: string // longitude
  y: string // latitude
  place_url: string
}

interface KakaoResponse {
  documents: KakaoDocument[]
}

function restKey(): string {
  const key = import.meta.env.VITE_KAKAO_REST_KEY
  if (!key) {
    throw new Error(
      'KAKAO_KEY_MISSING: VITE_KAKAO_REST_KEY 환경변수가 없습니다. .env.local에 카카오 REST 키를 설정하세요.',
    )
  }
  return key
}

export async function searchPlaces(query: string, options?: { size?: number }): Promise<PlaceSearchResult[]> {
  const trimmed = query.trim()
  if (!trimmed) return []
  const size = Math.min(Math.max(options?.size ?? 5, 1), 15)
  const url = `${KAKAO_LOCAL_URL}?query=${encodeURIComponent(trimmed)}&size=${size}`

  let response: Response
  try {
    response = await fetch(url, {
      headers: { Authorization: `KakaoAK ${restKey()}` },
    })
  } catch (cause) {
    throw new Error('KAKAO_NETWORK: 카카오 장소 검색 요청에 실패했습니다.', { cause })
  }
  if (!response.ok) {
    throw new Error(`KAKAO_HTTP_${response.status}: 카카오 장소 검색이 실패했습니다.`)
  }
  const body = (await response.json()) as KakaoResponse
  return body.documents.map(toResult)
}

/** 첫 번째 검색 결과만 필요할 때 쓰는 헬퍼. 결과가 없으면 null. */
export async function searchFirstPlace(query: string): Promise<PlaceSearchResult | null> {
  const results = await searchPlaces(query, { size: 1 })
  return results[0] ?? null
}

function toResult(doc: KakaoDocument): PlaceSearchResult {
  return {
    placeId: doc.id,
    name: doc.place_name,
    address: doc.road_address_name || doc.address_name,
    category: doc.category_name,
    latitude: Number(doc.y),
    longitude: Number(doc.x),
    url: doc.place_url,
  }
}
