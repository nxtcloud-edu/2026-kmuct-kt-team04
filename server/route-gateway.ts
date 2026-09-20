import { z } from 'zod'
import { UpstreamError } from './ai-gateway'

export const routeInput = z.strictObject({
  origin: z.strictObject({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) }),
  destination: z.strictObject({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) }),
  mode: z.enum(['car', 'transit', 'walk', 'bicycle']),
})

interface DirectionsConfig { kakaoKey: string; directionsUrl?: string }
interface KakaoDirectionsBody {
  routes?: Array<{
    result_code: number
    result_msg: string
    summary: { distance: number; duration: number }
    sections?: Array<{ roads?: Array<{ vertexes?: number[] }> }>
  }>
}

export async function getRoutes(input: z.infer<typeof routeInput>, config: DirectionsConfig) {
  if (input.mode !== 'car') {
    throw new UpstreamError('ROUTE_MODE_UNSUPPORTED: Kakao Mobility 공식 상세 경로 API는 차량 경로만 제공합니다. 대중교통·도보·자전거는 별도 경로 공급자가 필요합니다.')
  }
  if (!config.kakaoKey) throw new UpstreamError('KAKAO_KEY_MISSING: 서버에 KAKAO_REST_API_KEY를 설정해 주세요.')
  const url = new URL(config.directionsUrl || 'https://apis-navi.kakaomobility.com/v1/directions')
  url.searchParams.set('origin', `${input.origin.longitude},${input.origin.latitude}`)
  url.searchParams.set('destination', `${input.destination.longitude},${input.destination.latitude}`)
  url.searchParams.set('priority', 'RECOMMEND')
  url.searchParams.set('alternatives', 'true')
  url.searchParams.set('summary', 'false')
  let response: Response
  try {
    response = await fetch(url, { headers: { Authorization: `KakaoAK ${config.kakaoKey}`, Accept: 'application/json' }, signal: AbortSignal.timeout(20000) })
  } catch {
    throw new UpstreamError('KAKAO_ROUTE_CONNECTION: Kakao Mobility 길찾기에 연결하지 못했습니다.')
  }
  if (!response.ok) {
    const hint = response.status === 401 || response.status === 403 ? ' Kakao Mobility 길찾기 API 사용 권한과 앱 연결 상태를 확인해 주세요.' : ''
    throw new UpstreamError(`KAKAO_ROUTE_HTTP_${response.status}:${hint}`)
  }
  const body = await response.json() as KakaoDirectionsBody
  const routes = (body.routes ?? []).filter(route => route.result_code === 0).map((route, index) => {
    const path = (route.sections ?? []).flatMap(section => (section.roads ?? []).flatMap(road => {
      const vertices = road.vertexes ?? []
      const points: Array<{ latitude: number; longitude: number }> = []
      for (let i = 0; i + 1 < vertices.length; i += 2) points.push({ longitude: vertices[i], latitude: vertices[i + 1] })
      return points
    }))
    return { id: `car-${index + 1}`, mode: 'car' as const, distanceMeters: route.summary.distance,
      durationSeconds: route.summary.duration, path, label: formatDuration(route.summary.duration) }
  }).filter(route => route.path.length >= 2)
  if (!routes.length) throw new UpstreamError(`KAKAO_ROUTE_EMPTY: ${body.routes?.[0]?.result_msg || '경로를 찾지 못했습니다.'}`)
  return routes.slice(0, 3)
}

function formatDuration(seconds: number) {
  const minutes = Math.max(1, Math.round(seconds / 60))
  return minutes >= 60 ? `${Math.floor(minutes / 60)}시간 ${minutes % 60}분` : `${minutes}분`
}
