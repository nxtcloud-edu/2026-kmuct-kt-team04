import { exampleRoomState } from '../../../../shared/example-room-state'
import {
  createTimeBlockInput, updateTimeBlockInput, createPinInput, updatePinInput,
} from '../../../../shared/contracts'
import type {
  RoomState, RoomEvent, Pin, TimeBlock,
  CreateTimeBlockInput, UpdateTimeBlockInput, CreatePinInput, UpdatePinInput,
} from '../../../../shared/contracts'
import type { RoomAdapter, RoomWatcher } from './roomAdapter'

// 화면 시험용 임시 어댑터.
// - exampleRoomState를 깊은 복제해서 메모리에 보관합니다. 원본 파일/객체는 수정하지 않습니다.
// - 서버 계약의 규칙(version 증가, expectedVersion 충돌, requestId 멱등)을 로컬에서 흉내 냅니다.
// - 실제 저장은 하지 않습니다. AWS 연결 후 live 어댑터로 교체하세요.
// - 이 어댑터는 계약에 존재하는 함수만 구현합니다. deletePin은 미구현입니다.

const DEMO_USER = 'demo-user-b'

function deepClone<T>(value: T): T {
  return typeof structuredClone === 'function'
    ? structuredClone(value)
    : (JSON.parse(JSON.stringify(value)) as T)
}

function nowIso(): string {
  return new Date().toISOString()
}

function newId(): string {
  return crypto.randomUUID()
}

/** 계약 검증 실패 메시지를 VALIDATION 형태로 통일합니다. */
function validate<T>(schema: { parse: (v: unknown) => T }, input: unknown): T {
  try {
    return schema.parse(input)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`VALIDATION: ${message}`)
  }
}

export function createDemoRoomAdapter(_roomId: string): RoomAdapter {
  // exampleRoomState를 깊은 복제 (원본 불변)
  const state: RoomState = deepClone(exampleRoomState)

  // requestId 멱등: 같은 작업 종류에서 같은 requestId는 최초 결과를 반환합니다.
  const idempotency = new Map<string, RoomEvent>()

  const listeners = new Set<(state: RoomState) => void>()
  function emit() {
    const snapshot = deepClone(state)
    listeners.forEach(fn => fn(snapshot))
  }

  function event(
    entityType: RoomEvent['entityType'],
    action: RoomEvent['action'],
    entityId: string,
    data: unknown,
  ): RoomEvent {
    return {
      roomId: state.room.id,
      eventId: newId(),
      entityType,
      entityId,
      action,
      occurredAt: nowIso(),
      data,
    }
  }

  return {
    mode: 'demo',

    loadRoomState() {
      return Promise.resolve(deepClone(state))
    },

    watch(onState, _onError): RoomWatcher {
      listeners.add(onState)
      // 최초 상태 전달
      onState(deepClone(state))
      return {
        refresh() {
          onState(deepClone(state))
        },
        unsubscribe() {
          listeners.delete(onState)
        },
      }
    },

    createTimeBlock(input: CreateTimeBlockInput) {
      const parsed = validate(createTimeBlockInput, input)
      const cacheKey = `timeBlock:create:${parsed.requestId}`
      const cached = idempotency.get(cacheKey)
      if (cached) return Promise.resolve(cached)

      const block: TimeBlock = {
        id: newId(),
        roomId: state.room.id,
        dayId: parsed.dayId,
        title: parsed.title,
        startTime: parsed.startTime,
        endTime: parsed.endTime,
        description: parsed.description ?? '',
        createdBy: DEMO_USER,
        version: 1,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      }
      state.timeBlocks.push(block)
      const evt = event('timeBlock', 'created', block.id, deepClone(block))
      idempotency.set(cacheKey, evt)
      emit()
      return Promise.resolve(evt)
    },

    updateTimeBlock(input: UpdateTimeBlockInput) {
      const parsed = validate(updateTimeBlockInput, input)
      const block = state.timeBlocks.find(b => b.id === parsed.timeBlockId)
      if (!block) return Promise.reject(new Error('NOT_FOUND: 타임블록을 찾을 수 없습니다.'))
      if (block.version !== parsed.expectedVersion) {
        return Promise.reject(new Error('CONFLICT: 다른 사용자가 먼저 수정했습니다. 최신 데이터를 다시 읽으세요.'))
      }
      block.title = parsed.title
      block.startTime = parsed.startTime
      block.endTime = parsed.endTime
      block.description = parsed.description
      block.version += 1
      block.updatedAt = nowIso()
      const evt = event('timeBlock', 'updated', block.id, deepClone(block))
      emit()
      return Promise.resolve(evt)
    },

    createPin(input: CreatePinInput) {
      const parsed = validate(createPinInput, input)
      const cacheKey = `pin:create:${parsed.requestId}`
      const cached = idempotency.get(cacheKey)
      if (cached) return Promise.resolve(cached)

      const pin: Pin = {
        id: newId(),
        roomId: state.room.id,
        timeBlockId: parsed.timeBlockId,
        title: parsed.title,
        latitude: parsed.latitude,
        longitude: parsed.longitude,
        placeProvider: parsed.placeProvider,
        placeId: parsed.placeId,
        description: parsed.description ?? '',
        category: parsed.category ?? '',
        status: parsed.status ?? 'candidate',
        createdBy: DEMO_USER,
        version: 1,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      }
      state.pins.push(pin)
      const evt = event('pin', 'created', pin.id, deepClone(pin))
      idempotency.set(cacheKey, evt)
      emit()
      return Promise.resolve(evt)
    },

    updatePin(input: UpdatePinInput) {
      const parsed = validate(updatePinInput, input)
      const pin = state.pins.find(p => p.id === parsed.pinId)
      if (!pin) return Promise.reject(new Error('NOT_FOUND: 핀을 찾을 수 없습니다.'))
      if (pin.version !== parsed.expectedVersion) {
        return Promise.reject(new Error('CONFLICT: 다른 사용자가 먼저 수정했습니다. 최신 데이터를 다시 읽으세요.'))
      }
      // 계약상 updatePin은 timeBlockId를 변경하지 않습니다. (핀 이동 기능 없음)
      pin.title = parsed.title
      pin.description = parsed.description
      pin.category = parsed.category
      pin.status = parsed.status
      pin.version += 1
      pin.updatedAt = nowIso()
      const evt = event('pin', 'updated', pin.id, deepClone(pin))
      emit()
      return Promise.resolve(evt)
    },

    // TODO(A/백엔드): 계약에 deletePin이 없어 임의 구현하지 않습니다. 서버 구현 후 연결하세요.
    deletePin() {
      return Promise.reject(new Error('NOT_IMPLEMENTED: deletePin은 서버 계약에 없습니다. 백엔드 구현 후 연결하세요.'))
    },
  }
}
