import { Amplify } from 'aws-amplify'
import { generateClient } from 'aws-amplify/data'
import { Hub } from 'aws-amplify/utils'
import { isLocalBackend, localRequest, localRoomCall } from './local-api'
import type { Schema } from '../../amplify/data/resource'
import type {
  Room, RoomState, RoomEvent, RoomInvite, CreateRoomInput, UpdateRoomInput, JoinRoomInput,
  CreateTimeBlockInput, UpdateTimeBlockInput, CreatePinInput, UpdatePinInput, DeletePinInput,
  ReorderPinsInput, CreateRouteInput, UpdateRouteInput, DeleteRouteInput, SendMessageInput,
} from '../../shared/contracts'

export type * from '../../shared/contracts'

export function configureBackend(outputs: Parameters<typeof Amplify.configure>[0]) {
  Amplify.configure(outputs)
}

type Result<T> = { data?: T | null; errors?: readonly { message: string }[] }
function unwrap<T>(result: Result<T>): T {
  if (result.errors?.length) throw new Error(result.errors.map(error => error.message).join('\n'))
  if (result.data === undefined || result.data === null) throw new Error('EMPTY_RESPONSE: 서버 응답이 없습니다.')
  return result.data
}
function json<T>(value: unknown): T { return (typeof value === 'string' ? JSON.parse(value) : value) as T }
function decodeEvent(value: unknown): RoomEvent {
  const event = value as RoomEvent
  return { ...event, data: json(event.data) }
}
const client = () => generateClient<Schema>({ authMode: 'userPool' })

export const roomApi = {
  async listMyRooms(): Promise<Room[]> {
    if (isLocalBackend) return localRoomCall('listMyRooms')
    return json(unwrap(await client().queries.listMyRooms()))
  },
  async getRoomState(roomId: string): Promise<RoomState> {
    if (isLocalBackend) return localRoomCall('getRoomState', { roomId })
    return json(unwrap(await client().queries.getRoomState({ roomId })))
  },
  async createInvite(roomId: string): Promise<RoomInvite> {
    if (isLocalBackend) return localRoomCall('createInvite', { roomId })
    return unwrap(await client().mutations.createInvite({ roomId })) as RoomInvite
  },
  async createRoom(input: CreateRoomInput): Promise<RoomEvent> {
    if (isLocalBackend) return localRoomCall('createRoom', { input })
    return decodeEvent(unwrap(await client().mutations.createRoom({ input: JSON.stringify(input) })))
  },
  async updateRoom(input: UpdateRoomInput): Promise<RoomEvent> {
    if (isLocalBackend) return localRoomCall('updateRoom', { input })
    return decodeEvent(unwrap(await client().mutations.updateRoom({ input: JSON.stringify(input) })))
  },
  async joinRoom(input: JoinRoomInput): Promise<RoomEvent> {
    if (isLocalBackend) return localRoomCall('joinRoom', { input })
    return decodeEvent(unwrap(await client().mutations.joinRoom({ input: JSON.stringify(input) })))
  },
  async createTimeBlock(input: CreateTimeBlockInput): Promise<RoomEvent> {
    if (isLocalBackend) return localRoomCall('createTimeBlock', { input })
    return decodeEvent(unwrap(await client().mutations.createTimeBlock({ input: JSON.stringify(input) })))
  },
  async updateTimeBlock(input: UpdateTimeBlockInput): Promise<RoomEvent> {
    if (isLocalBackend) return localRoomCall('updateTimeBlock', { input })
    return decodeEvent(unwrap(await client().mutations.updateTimeBlock({ input: JSON.stringify(input) })))
  },
  async createPin(input: CreatePinInput): Promise<RoomEvent> {
    if (isLocalBackend) return localRoomCall('createPin', { input })
    return decodeEvent(unwrap(await client().mutations.createPin({ input: JSON.stringify(input) })))
  },
  async updatePin(input: UpdatePinInput): Promise<RoomEvent> {
    if (isLocalBackend) return localRoomCall('updatePin', { input })
    return decodeEvent(unwrap(await client().mutations.updatePin({ input: JSON.stringify(input) })))
  },
  async deletePin(input: DeletePinInput): Promise<RoomEvent> {
    if (isLocalBackend) return localRoomCall('deletePin', { input })
    return decodeEvent(unwrap(await client().mutations.deletePin({ input: JSON.stringify(input) })))
  },
  async reorderPins(input: ReorderPinsInput): Promise<RoomEvent> {
    if (isLocalBackend) return localRoomCall('reorderPins', { input })
    return decodeEvent(unwrap(await client().mutations.reorderPins({ input: JSON.stringify(input) })))
  },
  async createRoute(input: CreateRouteInput): Promise<RoomEvent> {
    if (isLocalBackend) return localRoomCall('createRoute', { input })
    return decodeEvent(unwrap(await client().mutations.createRoute({ input: JSON.stringify(input) })))
  },
  async updateRoute(input: UpdateRouteInput): Promise<RoomEvent> {
    if (isLocalBackend) return localRoomCall('updateRoute', { input })
    return decodeEvent(unwrap(await client().mutations.updateRoute({ input: JSON.stringify(input) })))
  },
  async deleteRoute(input: DeleteRouteInput): Promise<RoomEvent> {
    if (isLocalBackend) return localRoomCall('deleteRoute', { input })
    return decodeEvent(unwrap(await client().mutations.deleteRoute({ input: JSON.stringify(input) })))
  },
  async sendMessage(input: SendMessageInput): Promise<RoomEvent> {
    if (isLocalBackend) return localRoomCall('sendMessage', { input })
    return decodeEvent(unwrap(await client().mutations.sendMessage({ input: JSON.stringify(input) })))
  },
  subscribeRoom(roomId: string, onEvent: (event: RoomEvent) => void, onError: (error: unknown) => void) {
    if (isLocalBackend) {
      const source = new EventSource(`/api/room-events?roomId=${encodeURIComponent(roomId)}`)
      source.onmessage = message => onEvent(JSON.parse(message.data) as RoomEvent)
      source.onerror = () => onError(new Error('LOCAL_CONNECTION: 로컬 실시간 연결을 재시도합니다.'))
      return { unsubscribe() { source.close() } }
    }
    return client().subscriptions.onRoomEvent({ roomId }).subscribe({
      next: event => onEvent(decodeEvent(event)), error: onError,
    })
  },
}

export function getLocalStatus() {
  return localRequest<{ roomId: string; currentUserId: string; aiConfigured: boolean; kakaoConfigured: boolean; model: string; storage: string }>('/api/local-status')
}

/** Refetch on events and reconnection; serialize reads to prevent older responses replacing newer state. */
export function watchRoom(roomId: string, onState: (state: RoomState) => void, onError: (error: unknown) => void) {
  let closed = false
  let running = false
  let dirty = false
  async function refresh() {
    if (closed) return
    dirty = true
    if (running) return
    running = true
    try {
      while (dirty && !closed) {
        dirty = false
        const state = await roomApi.getRoomState(roomId)
        if (!closed) onState(state)
      }
    } catch (error) { if (!closed) onError(error) }
    finally { running = false }
  }
  const cancelHub = Hub.listen('api', ({ payload }) => {
    const detail = payload.data as { connectionState?: string } | undefined
    if (payload.event === 'ConnectionStateChange' && detail?.connectionState === 'Connected') void refresh()
  })
  const subscription = roomApi.subscribeRoom(roomId, () => { void refresh() }, onError)
  void refresh()
  const recoveryTimer = setInterval(() => { void refresh() }, 15000)
  return {
    refresh,
    unsubscribe() { closed = true; clearInterval(recoveryTimer); subscription.unsubscribe(); cancelHub() },
  }
}
