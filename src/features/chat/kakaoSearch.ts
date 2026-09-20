import { localRequest } from '../../lib/local-api'
import type { PlaceSearchResult } from './types'

/** The Kakao REST credential stays on the server. */
export async function searchPlaces(query: string, options?: { size?: number }): Promise<PlaceSearchResult[]> {
  if (!query.trim()) return []
  const places = await localRequest<PlaceSearchResult[]>('/api/places/search', { query: query.trim() })
  return places.slice(0, Math.min(5, Math.max(1, options?.size ?? 5)))
}
export async function searchFirstPlace(query: string): Promise<PlaceSearchResult | null> {
  return (await searchPlaces(query, { size: 1 }))[0] ?? null
}
