import { randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { resolve } from 'node:path'
import { z } from 'zod'
import { createRoomService, publicError } from '../amplify/functions/room-service/service'
import type { Pin, RoomEvent, RoomState } from '../shared/contracts'
import { createFileStore } from './file-store'
import { askGateway, searchKakao, UpstreamError, type AiConfig } from './ai-gateway'

const localRoomId = '10000000-0000-4000-8000-000000000001'
const actor = { userId: 'local-test-user' }
const aiInput = z.strictObject({ roomId: z.uuid(), userMessage: z.string().trim().min(1).max(4000),
  selectedTimeBlockId: z.uuid().optional(), requestId: z.uuid() })

export async function createLocalBackend(root: string, config: () => AiConfig) {
  const service = createRoomService(await createFileStore(resolve(root, '.local-data/rooms.json')))
  const listeners = new Map<string, Set<ServerResponse>>()
  function publish(event: RoomEvent) {
    for (const response of listeners.get(event.roomId) ?? []) response.write(`data: ${JSON.stringify(event)}\n\n`)
  }
  const execute = async (operation: string, args: Record<string, unknown>) => {
    const result = await service.execute(operation, args, actor)
    if (result && typeof result === 'object' && 'eventId' in result) publish(result as RoomEvent)
    return result
  }
  await execute('createRoom', { input: { name: '부산 연결 테스트', destination: '부산',
    startDate: '2026-10-01', endDate: '2026-10-02', displayName: '로컬 테스트 사용자', requestId: localRoomId } })
  const first = await service.execute('getRoomState', { roomId: localRoomId }, actor) as RoomState
  await execute('createTimeBlock', { input: { roomId: localRoomId, dayId: first.days[0].id,
    title: '해운대 산책', startTime: '10:00', endTime: '12:00', requestId: '30000000-0000-4000-8000-000000000001' } })
  const running = new Map<string, Promise<unknown>>()

  async function runAi(input: z.infer<typeof aiInput>) {
    const state = await service.execute('getRoomState', { roomId: input.roomId }, actor) as RoomState
    const plan = await askGateway(input.userMessage, state, config(), input.selectedTimeBlockId)
    const createdPins: Pin[] = []
    const notes: string[] = []
    for (const suggestion of plan.pinSuggestions) {
      const places = await searchKakao(suggestion.query, config())
      const place = places[0]
      if (!place) { notes.push(`“${suggestion.query}” 검색 결과가 없어 핀을 생성하지 않았습니다.`); continue }
      if ([...state.pins, ...createdPins].some(pin => pin.placeId === place.placeId && pin.timeBlockId === suggestion.timeBlockId)) {
        notes.push(`${place.name}은 이미 해당 타임블록에 있습니다.`); continue
      }
      const result = await execute('createPin', { input: {
        roomId: input.roomId, timeBlockId: suggestion.timeBlockId, title: place.name,
        latitude: place.latitude, longitude: place.longitude, placeProvider: 'kakao', placeId: place.placeId,
        description: [suggestion.description, place.address].filter(Boolean).join('\n').slice(0, 2000),
        category: place.category.slice(0, 50), status: 'candidate', requestId: randomUUID(),
      } }) as RoomEvent
      createdPins.push(result.data as Pin)
      notes.push(`${place.name}을 타임블록에 저장했습니다.`)
    }
    const reply = [plan.reply, plan.clarifyingQuestion, ...notes].filter(Boolean).join('\n\n')
    publish(await service.appendAssistantMessage(input.roomId, reply, actor, input.requestId))
    return { reply: plan.reply, notes, createdPins, plannedPins: plan.pinSuggestions, persisted: true, storage: 'local-file' }
  }

  return async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (!req.url?.startsWith('/api/')) return next()
    const host = req.headers.host ?? ''
    if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host) ||
      (req.headers.origin && req.headers.origin !== `http://${host}`)) {
      return respond(res, 403, { error: 'LOCAL_ONLY: 이 테스트 서버는 같은 로컬 사이트에서만 사용할 수 있습니다.' })
    }
    try {
      const url = new URL(req.url, `http://${host}`)
      if (url.pathname === '/api/local-status' && req.method === 'GET') {
        const settings = config()
        return respond(res, 200, { roomId: localRoomId, currentUserId: actor.userId,
          aiConfigured: Boolean(settings.apiKey), kakaoConfigured: Boolean(settings.kakaoKey),
          model: settings.model, storage: 'local-file' })
      }
      if (url.pathname === '/api/room-events' && req.method === 'GET') {
        const roomId = z.uuid().parse(url.searchParams.get('roomId'))
        await service.execute('getRoomState', { roomId }, actor)
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' })
        res.write(': connected\n\n')
        const responses = listeners.get(roomId) ?? new Set<ServerResponse>()
        responses.add(res); listeners.set(roomId, responses)
        const heartbeat = setInterval(() => { res.write(': keepalive\n\n') }, 20000)
        res.on('close', () => { clearInterval(heartbeat); responses.delete(res) })
        return
      }
      if (req.method !== 'POST' || !req.headers['content-type']?.startsWith('application/json')) {
        return respond(res, 405, { error: 'JSON POST 요청이 필요합니다.' })
      }
      const body = await readBody(req)
      if (url.pathname === '/api/ai/plan') {
        const input = aiInput.parse(body)
        const state = await service.execute('getRoomState', { roomId: input.roomId }, actor) as RoomState
        return respond(res, 200, await askGateway(input.userMessage, state, config(), input.selectedTimeBlockId))
      }
      if (url.pathname === '/api/ai/run') {
        const input = aiInput.parse(body)
        const key = `${input.roomId}:${input.requestId}`
        let task = running.get(key)
        if (!task) {
          task = runAi(input); running.set(key, task)
          // Short-lived retry deduplication. Persisted room records are the durable source of truth.
          const cleanup = () => { const timer = setTimeout(() => running.delete(key), 300000); timer.unref() }
          void task.then(cleanup, cleanup)
        }
        return respond(res, 200, await task)
      }
      if (url.pathname === '/api/places/search') {
        const { query } = z.strictObject({ query: z.string().trim().min(1).max(200) }).parse(body)
        return respond(res, 200, await searchKakao(query, config()))
      }
      if (url.pathname.startsWith('/api/room/')) {
        const args = z.record(z.string(), z.unknown()).parse(body)
        return respond(res, 200, await execute(url.pathname.slice('/api/room/'.length), args))
      }
      return respond(res, 404, { error: '지원하지 않는 API입니다.' })
    } catch (error) {
      const safe = error instanceof UpstreamError ? error : publicError(error)
      return respond(res, 400, { error: safe.message })
    }
  }
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []; let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > 64000) throw new UpstreamError('BODY_TOO_LARGE: 요청이 너무 큽니다.')
    chunks.push(Buffer.from(chunk))
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}
function respond(res: ServerResponse, status: number, value: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(value))
}
