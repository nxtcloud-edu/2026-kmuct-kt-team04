import { localRequest } from '../../../lib/local-api'
import type { Pin } from '../../../../shared/contracts'
import type { RouteMode, RouteResult } from '../types/route'

export async function requestRoutes(origin: Pin, destination: Pin, mode: RouteMode): Promise<RouteResult[]> {
  return localRequest('/api/routes/directions', {
    origin: { latitude: origin.latitude, longitude: origin.longitude },
    destination: { latitude: destination.latitude, longitude: destination.longitude },
    mode,
  })
}
