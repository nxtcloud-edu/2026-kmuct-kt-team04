import type { TravelRoute } from '../../../../shared/contracts'

export type RouteMode = 'car' | 'transit' | 'walk' | 'bicycle'

export interface RoutePoint {
  latitude: number
  longitude: number
}

export interface RouteResult {
  id: string
  mode: RouteMode
  distanceMeters: number
  durationSeconds: number
  path: RoutePoint[]
  label: string
}

export function formatRouteDuration(durationSeconds: number): string {
  if (durationSeconds < 60) return '1분 미만'
  return `${Math.round(durationSeconds / 60)}분`
}

export function travelRouteToRouteResult(route: TravelRoute): RouteResult {
  return {
    id: route.id,
    mode: route.mode,
    distanceMeters: route.distanceMeters,
    durationSeconds: route.durationSeconds,
    path: route.path,
    label: `${route.name} · ${formatRouteDuration(route.durationSeconds)}`,
  }
}
