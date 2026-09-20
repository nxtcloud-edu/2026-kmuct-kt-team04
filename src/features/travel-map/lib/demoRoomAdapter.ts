import { exampleRoomState } from '../../../../shared/example-room-state'
import {
  createTimeBlockInput, updateTimeBlockInput, createPinInput, updatePinInput, deletePinInput, reorderPinsInput,
  createRouteInput, updateRouteInput, deleteRouteInput,
} from '../../../../shared/contracts'
import type {
  RoomState, RoomEvent, Pin, TimeBlock, TravelRoute, CreateTimeBlockInput, UpdateTimeBlockInput, CreatePinInput,
  UpdatePinInput, DeletePinInput, ReorderPinsInput, CreateRouteInput, UpdateRouteInput, DeleteRouteInput,
} from '../../../../shared/contracts'
import type { RoomAdapter, RoomWatcher } from './roomAdapter'

const DEMO_USER = 'demo-user-b'
const deepClone = <T>(value: T): T => typeof structuredClone === 'function'
  ? structuredClone(value) : JSON.parse(JSON.stringify(value)) as T
const nowIso = () => new Date().toISOString()
const newId = () => crypto.randomUUID()
function validate<T>(schema: { parse: (value: unknown) => T }, input: unknown): T {
  try { return schema.parse(input) }
  catch (error) { throw new Error(`VALIDATION: ${error instanceof Error ? error.message : String(error)}`) }
}
function normalizePinOrder(block: TimeBlock, pins: Pin[]): string[] {
  const blockPins = pins.filter(pin => pin.timeBlockId === block.id)
  const ids = new Set(blockPins.map(pin => pin.id))
  const seen = new Set<string>()
  const retained = (block.pinOrder ?? []).filter(id => ids.has(id) && !seen.has(id) && Boolean(seen.add(id)))
  return [...retained, ...blockPins.filter(pin => !seen.has(pin.id))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)).map(pin => pin.id)]
}
function placeDestinationAfterOrigin(order: string[], originPinId: string, destinationPinId: string): string[] {
  const withoutDestination = order.filter(id => id !== destinationPinId)
  const originIndex = withoutDestination.indexOf(originPinId)
  if (originIndex < 0) throw new Error('INVALID_ROUTE_PINS: 출발 핀이 타임블록의 핀 순서에 없습니다.')
  withoutDestination.splice(originIndex + 1, 0, destinationPinId)
  return withoutDestination
}

export function createDemoRoomAdapter(_roomId: string): RoomAdapter {
  const state: RoomState = deepClone(exampleRoomState)
  state.timeBlocks.forEach(block => { block.pinOrder = normalizePinOrder(block, state.pins) })
  const idempotency = new Map<string, RoomEvent>()
  const listeners = new Set<(state: RoomState) => void>()
  function emit() {
    const snapshot = deepClone(state)
    listeners.forEach(listener => listener(snapshot))
  }
  function event(entityType: RoomEvent['entityType'], action: RoomEvent['action'], entityId: string, data: unknown): RoomEvent {
    return { roomId: state.room.id, eventId: newId(), entityType, entityId, action, occurredAt: nowIso(), data }
  }
  function ensureRoom(roomId: string) {
    if (roomId !== state.room.id) throw new Error('NOT_FOUND: 같은 여행방에서 대상을 찾을 수 없습니다.')
  }

  return {
    mode: 'demo',
    loadRoomState: () => Promise.resolve(deepClone(state)),
    watch(onState, _onError): RoomWatcher {
      listeners.add(onState)
      onState(deepClone(state))
      return { refresh: () => onState(deepClone(state)), unsubscribe: () => { listeners.delete(onState) } }
    },
    createTimeBlock(input: CreateTimeBlockInput) {
      const parsed = validate(createTimeBlockInput, input)
      ensureRoom(parsed.roomId)
      const cacheKey = `timeBlock:create:${parsed.requestId}`
      const cached = idempotency.get(cacheKey)
      if (cached) return Promise.resolve(cached)
      if (!state.days.some(day => day.id === parsed.dayId)) return Promise.reject(new Error('NOT_FOUND: 여행 일자를 찾을 수 없습니다.'))
      const block: TimeBlock = {
        id: newId(), roomId: state.room.id, dayId: parsed.dayId, title: parsed.title,
        startTime: parsed.startTime, endTime: parsed.endTime, description: parsed.description ?? '',
        createdBy: DEMO_USER, pinOrder: [], version: 1, createdAt: nowIso(), updatedAt: nowIso(),
      }
      state.timeBlocks.push(block)
      const result = event('timeBlock', 'created', block.id, deepClone(block))
      idempotency.set(cacheKey, result); emit()
      return Promise.resolve(result)
    },
    updateTimeBlock(input: UpdateTimeBlockInput) {
      const parsed = validate(updateTimeBlockInput, input)
      ensureRoom(parsed.roomId)
      const block = state.timeBlocks.find(value => value.id === parsed.timeBlockId)
      if (!block) return Promise.reject(new Error('NOT_FOUND: 타임블록을 찾을 수 없습니다.'))
      if (block.version !== parsed.expectedVersion) return Promise.reject(new Error('CONFLICT: 다른 사용자가 먼저 수정했습니다. 최신 데이터를 다시 읽으세요.'))
      Object.assign(block, { title: parsed.title, startTime: parsed.startTime, endTime: parsed.endTime,
        description: parsed.description, version: block.version + 1, updatedAt: nowIso() })
      const result = event('timeBlock', 'updated', block.id, deepClone(block)); emit()
      return Promise.resolve(result)
    },
    createPin(input: CreatePinInput) {
      const parsed = validate(createPinInput, input)
      ensureRoom(parsed.roomId)
      const cacheKey = `pin:create:${parsed.requestId}`
      const cached = idempotency.get(cacheKey)
      if (cached) return Promise.resolve(cached)
      const block = state.timeBlocks.find(value => value.id === parsed.timeBlockId)
      if (!block) return Promise.reject(new Error('NOT_FOUND: 타임블록을 찾을 수 없습니다.'))
      const pin: Pin = {
        id: parsed.requestId, roomId: state.room.id, timeBlockId: parsed.timeBlockId, title: parsed.title,
        latitude: parsed.latitude, longitude: parsed.longitude, placeProvider: parsed.placeProvider, placeId: parsed.placeId,
        description: parsed.description ?? '', category: parsed.category ?? '', status: parsed.status ?? 'candidate',
        createdBy: DEMO_USER, version: 1, createdAt: nowIso(), updatedAt: nowIso(),
      }
      block.pinOrder = [...normalizePinOrder(block, state.pins), pin.id]
      block.version += 1; block.updatedAt = nowIso()
      state.pins.push(pin)
      const result = event('pin', 'created', pin.id, deepClone(pin))
      idempotency.set(cacheKey, result); emit()
      return Promise.resolve(result)
    },
    updatePin(input: UpdatePinInput) {
      const parsed = validate(updatePinInput, input)
      ensureRoom(parsed.roomId)
      const pin = state.pins.find(value => value.id === parsed.pinId)
      if (!pin) return Promise.reject(new Error('NOT_FOUND: 핀을 찾을 수 없습니다.'))
      if (pin.version !== parsed.expectedVersion) return Promise.reject(new Error('CONFLICT: 다른 사용자가 먼저 수정했습니다. 최신 데이터를 다시 읽으세요.'))
      Object.assign(pin, { title: parsed.title, description: parsed.description, category: parsed.category,
        status: parsed.status, version: pin.version + 1, updatedAt: nowIso() })
      const result = event('pin', 'updated', pin.id, deepClone(pin)); emit()
      return Promise.resolve(result)
    },
    deletePin(input: DeletePinInput) {
      const parsed = validate(deletePinInput, input)
      ensureRoom(parsed.roomId)
      const cacheKey = `pin:delete:${parsed.requestId}`
      const cached = idempotency.get(cacheKey)
      if (cached) return Promise.resolve(cached)
      const index = state.pins.findIndex(value => value.id === parsed.pinId)
      if (index < 0) return Promise.reject(new Error('NOT_FOUND: 핀을 찾을 수 없습니다.'))
      const pin = state.pins[index]
      if (pin.version !== parsed.expectedVersion) return Promise.reject(new Error('CONFLICT: 다른 사용자가 먼저 수정했습니다. 최신 데이터를 다시 읽으세요.'))
      const block = state.timeBlocks.find(value => value.id === pin.timeBlockId)
      if (!block) return Promise.reject(new Error('NOT_FOUND: 타임블록을 찾을 수 없습니다.'))
      block.pinOrder = normalizePinOrder(block, state.pins).filter(id => id !== pin.id)
      block.version += 1; block.updatedAt = nowIso()
      state.pins.splice(index, 1)
      state.routes = state.routes.filter(route => route.originPinId !== pin.id && route.destinationPinId !== pin.id)
      const result = event('pin', 'deleted', pin.id, deepClone(pin))
      idempotency.set(cacheKey, result); emit()
      return Promise.resolve(result)
    },
    reorderPins(input: ReorderPinsInput) {
      const parsed = validate(reorderPinsInput, input)
      ensureRoom(parsed.roomId)
      const cacheKey = `pin:reorder:${parsed.requestId}`
      const cached = idempotency.get(cacheKey)
      if (cached) return Promise.resolve(cached)
      const block = state.timeBlocks.find(value => value.id === parsed.timeBlockId)
      if (!block) return Promise.reject(new Error('NOT_FOUND: 타임블록을 찾을 수 없습니다.'))
      if (block.version !== parsed.expectedVersion) return Promise.reject(new Error('CONFLICT: 다른 사용자가 먼저 수정했습니다. 최신 데이터를 다시 읽으세요.'))
      const currentIds = normalizePinOrder(block, state.pins)
      const submitted = new Set(parsed.orderedPinIds)
      if (submitted.size !== parsed.orderedPinIds.length || parsed.orderedPinIds.length !== currentIds.length
        || currentIds.some(id => !submitted.has(id))) {
        return Promise.reject(new Error('INVALID_PIN_ORDER: 현재 타임블록의 모든 핀을 중복 없이 정확히 한 번씩 보내야 합니다.'))
      }
      block.pinOrder = [...parsed.orderedPinIds]
      block.version += 1; block.updatedAt = nowIso()
      const result = event('timeBlock', 'updated', block.id, deepClone(block))
      idempotency.set(cacheKey, result); emit()
      return Promise.resolve(result)
    },
    createRoute(input: CreateRouteInput) {
      const parsed = validate(createRouteInput, input)
      ensureRoom(parsed.roomId)
      const cacheKey = `route:create:${parsed.requestId}`
      const cached = idempotency.get(cacheKey)
      if (cached) return Promise.resolve(cached)
      const block = state.timeBlocks.find(value => value.id === parsed.timeBlockId)
      if (!block) return Promise.reject(new Error('NOT_FOUND: 타임블록을 찾을 수 없습니다.'))
      const origin = state.pins.find(value => value.id === parsed.originPinId)
      const destination = state.pins.find(value => value.id === parsed.destinationPinId)
      if (!origin || !destination) return Promise.reject(new Error('NOT_FOUND: 핀을 찾을 수 없습니다.'))
      if (origin.timeBlockId !== parsed.timeBlockId || destination.timeBlockId !== parsed.timeBlockId) {
        return Promise.reject(new Error('INVALID_ROUTE_PINS: 출발 핀과 도착 핀은 지정한 같은 타임블록에 있어야 합니다.'))
      }
      const routeCountFor = (pinId: string) => state.routes.filter(route =>
        route.originPinId === pinId || route.destinationPinId === pinId).length
      if (routeCountFor(origin.id) >= 96 || routeCountFor(destination.id) >= 96) {
        return Promise.reject(new Error('ROUTE_LIMIT: 핀 하나에는 최대 96개의 경로를 연결할 수 있습니다.'))
      }
      const createdAt = nowIso()
      const route: TravelRoute = {
        id: parsed.requestId, roomId: parsed.roomId, timeBlockId: parsed.timeBlockId, name: parsed.name,
        mode: parsed.mode, originPinId: parsed.originPinId, destinationPinId: parsed.destinationPinId,
        distanceMeters: parsed.distanceMeters, durationSeconds: parsed.durationSeconds, path: deepClone(parsed.path),
        createdBy: DEMO_USER, version: 1, createdAt, updatedAt: createdAt,
      }
      block.pinOrder = placeDestinationAfterOrigin(
        normalizePinOrder(block, state.pins), route.originPinId, route.destinationPinId,
      )
      block.version += 1; block.updatedAt = nowIso()
      state.routes.push(route)
      const result = event('route', 'created', route.id, deepClone(route))
      idempotency.set(cacheKey, result); emit()
      return Promise.resolve(result)
    },
    updateRoute(input: UpdateRouteInput) {
      const parsed = validate(updateRouteInput, input)
      ensureRoom(parsed.roomId)
      const cacheKey = `route:update:${parsed.requestId}`
      const cached = idempotency.get(cacheKey)
      if (cached) return Promise.resolve(cached)
      const route = state.routes.find(value => value.id === parsed.routeId)
      if (!route) return Promise.reject(new Error('NOT_FOUND: 경로를 찾을 수 없습니다.'))
      if (route.version !== parsed.expectedVersion) return Promise.reject(new Error('CONFLICT: 다른 사용자가 먼저 수정했습니다. 최신 데이터를 다시 읽으세요.'))
      Object.assign(route, {
        name: parsed.name, distanceMeters: parsed.distanceMeters, durationSeconds: parsed.durationSeconds,
        path: deepClone(parsed.path), version: route.version + 1, updatedAt: nowIso(),
      })
      const result = event('route', 'updated', route.id, deepClone(route))
      idempotency.set(cacheKey, result); emit()
      return Promise.resolve(result)
    },
    deleteRoute(input: DeleteRouteInput) {
      const parsed = validate(deleteRouteInput, input)
      ensureRoom(parsed.roomId)
      const cacheKey = `route:delete:${parsed.requestId}`
      const cached = idempotency.get(cacheKey)
      if (cached) return Promise.resolve(cached)
      const index = state.routes.findIndex(value => value.id === parsed.routeId)
      if (index < 0) return Promise.reject(new Error('NOT_FOUND: 경로를 찾을 수 없습니다.'))
      const route = state.routes[index]
      if (route.version !== parsed.expectedVersion) return Promise.reject(new Error('CONFLICT: 다른 사용자가 먼저 수정했습니다. 최신 데이터를 다시 읽으세요.'))
      state.routes.splice(index, 1)
      const result = event('route', 'deleted', route.id, deepClone(route))
      idempotency.set(cacheKey, result); emit()
      return Promise.resolve(result)
    },
  }
}
