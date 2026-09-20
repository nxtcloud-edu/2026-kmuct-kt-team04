import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { resolve } from 'node:path'
import { z } from 'zod'
import { createRoomService, publicError } from '../amplify/functions/room-service/service'
import type { RoomEvent } from '../shared/contracts'
import { createFileStore } from './file-store'
import { askGateway, searchKakao, UpstreamError, type AiConfig } from './ai-gateway'
import { runAssistant } from './ai-runner'
import { getRoutes, routeInput } from './route-gateway'

export const sharedRoomId = '10000000-0000-4000-8000-000000000001'
const aiInput = z.strictObject({ roomId: z.literal(sharedRoomId), userMessage: z.string().trim().min(1).max(4000),
  selectedTimeBlockId: z.uuid().optional(), requestId: z.uuid() })
interface Options { publicOrigin?: () => string; dataDirectory?: string }
export async function createLocalBackend(root: string, config: () => AiConfig, options: Options = {}) {
  const directory = options.dataDirectory ?? resolve(root, '.local-data')
  await mkdir(directory, { recursive: true })
  let secret: Buffer
  try { secret = await readFile(resolve(directory, 'session.key')) }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    secret = randomBytes(32); await writeFile(resolve(directory, 'session.key'), secret, { mode: 0o600, flag: 'wx' })
  }
  const sign = (value: string) => createHmac('sha256', secret).update(value).digest('base64url')
  const service = createRoomService(await createFileStore(resolve(directory, 'rooms.json')))
  const owner = { userId: 'local-test-user' }
  // Existing travel data is preserved. New rooms no longer assume Busan or create a sample block.
  await service.execute('createRoom', { input: { name: '함께 만드는 여행', destination: '미정',
    startDate: '2026-10-01', endDate: '2026-10-02', displayName: '여행 준비', requestId: sharedRoomId } }, owner)
  const listeners = new Map<string, Set<ServerResponse>>()
  function publish(event: RoomEvent) {
    for (const response of listeners.get(event.roomId) ?? []) response.write(`data: ${JSON.stringify(event)}\n\n`)
  }
  const running = new Map<string, Promise<unknown>>()
  let activeAi = 0
  let aiWindow = Date.now(), aiCalls = 0
  const operations = new Set(['getRoomState', 'updateRoom', 'createTimeBlock', 'updateTimeBlock', 'deleteTimeBlock',
    'createPin', 'updatePin', 'deletePin', 'reorderPins', 'createRoute', 'updateRoute', 'deleteRoute', 'sendMessage'])

  return async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (!req.url?.startsWith('/api/')) return next()
    try {
      const host = req.headers.host ?? ''
      const publicOrigin = options.publicOrigin?.() || ''
      const expectedHost = publicOrigin ? new URL(publicOrigin).host : ''
      if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host) && host !== expectedHost) throw new UpstreamError('HOST_DENIED: 서버에 등록되지 않은 주소입니다.')
      if (req.headers.origin && req.headers.origin !== `http://${host}` && req.headers.origin !== publicOrigin) throw new UpstreamError('ORIGIN_DENIED: 같은 사이트에서 요청해 주세요.')
      if (req.headers['sec-fetch-site'] === 'cross-site') throw new UpstreamError('ORIGIN_DENIED: 외부 사이트 요청입니다.')
      const url = new URL(req.url, `http://${host}`)
      const cookie = req.headers.cookie?.split(';').map(v => v.trim()).find(v => v.startsWith('travel_guest='))?.slice(13)
      let token = cookie?.split('.')[0] ?? ''
      const signature = cookie?.split('.')[1] ?? ''
      const correct = sign(token)
      if (!/^[a-f0-9]{32}$/.test(token) || signature.length !== correct.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(correct))) {
        if (url.pathname !== '/api/local-status') return respond(res, 401, { error: 'SESSION_REQUIRED: 페이지를 새로고침해 참여해 주세요.' })
        token = randomBytes(16).toString('hex')
        res.setHeader('Set-Cookie', `travel_guest=${token}.${sign(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${publicOrigin.startsWith('https:') && req.headers.origin !== `http://${host}` && host === expectedHost ? '; Secure' : ''}`)
      }
      const actor = { userId: `guest-${token}` }
      if (url.pathname === '/api/local-status' && req.method === 'GET') {
        // Keep a previously chosen nickname on reload.
        let displayName = `여행자 ${token.slice(0, 4)}`
        try {
          const current = await service.execute('getRoomState', { roomId: sharedRoomId }, actor) as import('../shared/contracts').RoomState
          displayName = current.members.find(m => m.userId === actor.userId)?.displayName ?? displayName
        } catch { const event = await service.enterSharedRoom(sharedRoomId, actor, displayName); if (event) publish(event) }
        const settings = config()
        return respond(res, 200, { roomId: sharedRoomId, currentUserId: actor.userId, displayName,
          aiConfigured: Boolean(settings.apiKey), kakaoConfigured: Boolean(settings.kakaoKey), model: settings.model, storage: 'shared-file' })
      }
      if (url.pathname === '/api/room-events' && req.method === 'GET') {
        if (url.searchParams.get('roomId') !== sharedRoomId) throw new UpstreamError('ROOM_DENIED: 공용 여행방만 이용할 수 있습니다.')
        await service.execute('getRoomState', { roomId: sharedRoomId }, actor)
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' })
        res.write(': connected\n\n')
        const clients = listeners.get(sharedRoomId) ?? new Set<ServerResponse>()
        clients.add(res); listeners.set(sharedRoomId, clients)
        const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 20000)
        res.on('close', () => { clearInterval(heartbeat); clients.delete(res) }); return
      }
      if (req.method !== 'POST' || !req.headers['content-type']?.startsWith('application/json')) return respond(res, 405, { error: 'JSON POST 요청이 필요합니다.' })
      const body = await readBody(req)
      await service.execute('getRoomState', { roomId: sharedRoomId }, actor)
      if (url.pathname === '/api/profile') {
        const input = z.strictObject({ displayName: z.string().trim().min(1).max(40) }).parse(body)
        const event = await service.enterSharedRoom(sharedRoomId, actor, input.displayName)
        if (event) publish(event)
        return respond(res, 200, input)
      }
      if (url.pathname === '/api/ai/run' || url.pathname === '/api/ai/plan') {
        const input = aiInput.parse(body)
        const key = `${actor.userId}:${input.requestId}`
        let task = running.get(key)
        if (!task) {
          if (Date.now() - aiWindow > 300000) { aiWindow = Date.now(); aiCalls = 0 }
          if (activeAi >= 2 || aiCalls >= 30) return respond(res, 429, { error: 'AI_BUSY: 요청이 몰렸습니다. 잠시 후 다시 시도해 주세요.' })
          activeAi++; aiCalls++
          task = (async () => {
            if (url.pathname === '/api/ai/plan') {
              const state = await service.execute('getRoomState', { roomId: sharedRoomId }, actor) as import('../shared/contracts').RoomState
              return askGateway(input.userMessage, state, config(), input.selectedTimeBlockId)
            }
            return runAssistant(service, actor, input, config(), publish)
          })().finally(() => { activeAi--; const timer = setTimeout(() => running.delete(key), 300000); timer.unref() })
          running.set(key, task)
        }
        return respond(res, 200, await task)
      }
      if (url.pathname === '/api/places/search') {
        const { query } = z.strictObject({ query: z.string().trim().min(1).max(200) }).parse(body)
        return respond(res, 200, await searchKakao(query, config()))
      }
      if (url.pathname === '/api/routes/directions') return respond(res, 200, await getRoutes(routeInput.parse(body), config()))
      if (url.pathname.startsWith('/api/room/')) {
        const operation = url.pathname.slice('/api/room/'.length)
        const args = z.record(z.string(), z.unknown()).parse(body)
        if (!operations.has(operation) || (args.roomId ?? (args.input as { roomId?: string })?.roomId) !== sharedRoomId) throw new UpstreamError('ROOM_DENIED: 공용 여행방만 이용할 수 있습니다.')
        const result = await service.execute(operation, args, actor)
        if (result && typeof result === 'object' && 'eventId' in result) publish(result as RoomEvent)
        return respond(res, 200, result)
      }
      return respond(res, 404, { error: '지원하지 않는 API입니다.' })
    } catch (error) { return respond(res, 400, { error: error instanceof UpstreamError ? error.message : publicError(error).message }) }
  }
}
async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []; let size = 0
  for await (const chunk of req) { size += chunk.length; if (size > 1500000) throw new UpstreamError('BODY_TOO_LARGE: 요청이 너무 큽니다.'); chunks.push(Buffer.from(chunk)) }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}
function respond(res: ServerResponse, status: number, value: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(value))
}
