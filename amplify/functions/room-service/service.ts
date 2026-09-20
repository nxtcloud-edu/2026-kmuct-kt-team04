import { Buffer } from 'node:buffer'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { z } from 'zod'
import {
  createRoomInput, updateRoomInput, joinRoomInput, createTimeBlockInput, updateTimeBlockInput, deleteTimeBlockInput,
  createPinInput, updatePinInput, deletePinInput, reorderPinsInput, sendMessageInput,
  createRouteInput, updateRouteInput, deleteRouteInput, idSchema,
  type Room, type RoomMember, type TravelDay, type TimeBlock, type Pin, type TravelRoute, type Message,
  type RoomEvent, type RoomState, type RoomInvite,
} from '../../../shared/contracts'
import { ConflictError, type Key, type RecordItem, type Store, type Write } from './store'
import type { PlaceRecommendation } from '../../../shared/contracts'

export class ServiceError extends Error {
  readonly code: string
  constructor(code: string, message: string) { super(`${code}: ${message}`); this.code = code }
}
type Actor = { userId: string }
const roomKey = (roomId: string, sk: string): Key => ({ pk: `ROOM#${roomId}`, sk })
const memberKey = (roomId: string, userId: string) => roomKey(roomId, `MEMBER#${userId}`)
const inviteKey = (token: string): Key => ({ pk: `INVITE#${createHash('sha256').update(token).digest('hex')}`, sk: 'META' })
type RecordExpectation = 'absent' | 'exists' | 'unversioned' | number
const put = (key: Key, data: unknown, expected: RecordExpectation = 'absent', version?: number): Write => ({
  kind: 'put', item: { ...key, data, ...(version ? { version } : {}) }, expected,
})
const expectation = (record: RecordItem): 'unversioned' | number => record.version ?? 'unversioned'
const remove = (key: Key, expected: 'exists' | 'unversioned' | number = 'exists'): Write => ({ kind: 'delete', key, expected })
const check = (key: Key): Write => ({ kind: 'check', key })
const getData = <T>(record: RecordItem) => record.data as T
const inputId = (value: unknown) => idSchema.parse(value)
type StoredTravelRoute = Omit<TravelRoute, 'path'> & {
  pathEncoding: 'float64-base64'
  pathData: string
}
function encodeTravelRoute(route: TravelRoute): StoredTravelRoute {
  const bytes = Buffer.allocUnsafe(route.path.length * 16)
  route.path.forEach((point, index) => {
    bytes.writeDoubleLE(point.latitude, index * 16)
    bytes.writeDoubleLE(point.longitude, index * 16 + 8)
  })
  const { path: _path, ...stored } = route
  return { ...stored, pathEncoding: 'float64-base64', pathData: bytes.toString('base64') }
}
function decodeTravelRoute(value: unknown): TravelRoute {
  const valueWithPath = value as TravelRoute
  if (Array.isArray(valueWithPath.path)) return valueWithPath
  const stored = value as StoredTravelRoute
  const bytes = Buffer.from(stored.pathData, 'base64')
  if (stored.pathEncoding !== 'float64-base64' || bytes.length % 16 !== 0) {
    throw new ServiceError('INTERNAL', '저장된 경로 형식을 읽을 수 없습니다.')
  }
  const path = Array.from({ length: bytes.length / 16 }, (_, index) => ({
    latitude: bytes.readDoubleLE(index * 16), longitude: bytes.readDoubleLE(index * 16 + 8),
  }))
  const { pathEncoding: _pathEncoding, pathData: _pathData, ...route } = stored
  return { ...route, path }
}
function encodeRouteReplay(userId: string, result: RoomEvent, route: TravelRoute) {
  return { userId, result: { ...result, data: encodeTravelRoute(route) } }
}
function decodeRouteReplay(value: unknown): { userId: string; result: RoomEvent } {
  const saved = value as { userId: string; result: RoomEvent }
  return { ...saved, result: { ...saved.result, data: decodeTravelRoute(saved.result.data) } }
}
const normalizeRoom = (room: Room): Room => ({ ...room, participantCount: room.participantCount ?? 1 })
function activeBlock(record: RecordItem): TimeBlock {
  const block = getData<TimeBlock>(record)
  if (block.deleting) throw new ServiceError('NOT_FOUND', '삭제 중인 타임블록입니다.')
  return block
}
function normalizePinOrder(block: TimeBlock, pins: Pin[]): string[] {
  const blockPins = pins.filter(pin => pin.timeBlockId === block.id)
  const currentIds = new Set(blockPins.map(pin => pin.id))
  const seen = new Set<string>()
  const retained = (block.pinOrder ?? []).filter(id => currentIds.has(id) && !seen.has(id) && Boolean(seen.add(id)))
  const missing = blockPins.filter(pin => !seen.has(pin.id))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
    .map(pin => pin.id)
  return [...retained, ...missing]
}
function placeDestinationAfterOrigin(order: string[], originPinId: string, destinationPinId: string): string[] {
  const withoutDestination = order.filter(id => id !== destinationPinId)
  const originIndex = withoutDestination.indexOf(originPinId)
  if (originIndex < 0) throw new ServiceError('INVALID_ROUTE_PINS', '출발 핀이 타임블록의 핀 순서에 없습니다.')
  withoutDestination.splice(originIndex + 1, 0, destinationPinId)
  return withoutDestination
}
function datesBetween(startDate: string, endDate: string): string[] {
  const dates: string[] = []
  for (let value = Date.parse(startDate); value <= Date.parse(endDate); value += 86400000) {
    dates.push(new Date(value).toISOString().slice(0, 10))
  }
  return dates
}

export function createRoomService(store: Store, clock: () => Date = () => new Date()) {
  const now = () => clock().toISOString()
  const stamp = () => ({ version: 1, createdAt: now(), updatedAt: now() })
  async function requireMember(roomId: string, actor: Actor): Promise<RoomMember> {
    const member = await store.get(memberKey(roomId, actor.userId))
    if (!member) throw new ServiceError('FORBIDDEN', '이 여행방에 참여해야 합니다.')
    return getData<RoomMember>(member)
  }
  async function entity<T>(key: Key): Promise<T> {
    const result = await store.get(key)
    if (!result) throw new ServiceError('NOT_FOUND', '같은 여행방에서 대상을 찾을 수 없습니다.')
    return getData<T>(result)
  }
  async function record(key: Key): Promise<RecordItem> {
    const result = await store.get(key)
    if (!result) throw new ServiceError('NOT_FOUND', '같은 여행방에서 대상을 찾을 수 없습니다.')
    return result
  }
  function event(roomId: string, entityType: RoomEvent['entityType'], entityId: string,
    data: unknown, action: RoomEvent['action'] = 'created'): RoomEvent {
    return { roomId, eventId: randomUUID(), entityType, entityId, action, occurredAt: now(), data }
  }
  async function createOnce<T extends { createdBy?: string; userId?: string }>(
    key: Key, value: T, actor: Actor, writes: Write[],
  ): Promise<T> {
    const previous = await store.get(key)
    if (previous) {
      const saved = getData<T>(previous)
      if ((saved.createdBy ?? saved.userId) !== actor.userId) throw new ConflictError()
      return saved
    }
    try { await store.transact(writes); return value }
    catch (error) {
      if (!(error instanceof ConflictError)) throw error
      const winner = await store.get(key)
      if (winner) {
        const saved = getData<T>(winner)
        if ((saved.createdBy ?? saved.userId) === actor.userId) return saved
      }
      throw error
    }
  }

  return {
    // Only the single-room HTTP server calls this; not a public GraphQL mutation.
    async enterSharedRoom(roomId: string, actor: Actor, displayName: string) {
      const key = memberKey(inputId(roomId), actor.userId)
      const name = z.string().trim().min(1).max(40).parse(displayName)
      const existing = await store.get(key)
      if (existing && getData<RoomMember>(existing).displayName === name) return
      const member: RoomMember = { roomId, userId: actor.userId, role: 'member',
        displayName: name, joinedAt: existing ? getData<RoomMember>(existing).joinedAt : now() }
      await store.transact([check(roomKey(roomId, 'META')), put(key, member, existing ? expectation(existing) : 'absent', (existing?.version ?? 0) + 1)])
      return event(roomId, 'member', actor.userId, member, existing ? 'updated' : 'created')
    },
    async beginAssistantCommand(roomId: string, actor: Actor, requestId: string) {
      await requireMember(inputId(roomId), actor)
      idSchema.parse(requestId)
      const key = roomKey(roomId, `REQUEST#AI_COMMAND#${requestId}`)
      const existing = await store.get(key)
      if (existing) {
        const saved = getData<{ userId: string; status: 'running' | 'completed'; result?: unknown }>(existing)
        if (saved.userId !== actor.userId) throw new ConflictError()
        return { started: false, result: saved.status === 'completed' ? saved.result : undefined }
      }
      try {
        await store.transact([check(memberKey(roomId, actor.userId)),
          put(key, { userId: actor.userId, status: 'running' }, 'absent', 1)])
        return { started: true, result: undefined }
      } catch (error) {
        if (!(error instanceof ConflictError)) throw error
        const winner = await store.get(key)
        if (!winner) throw error
        const saved = getData<{ userId: string; status: 'running' | 'completed'; result?: unknown }>(winner)
        if (saved.userId !== actor.userId) throw error
        return { started: false, result: saved.status === 'completed' ? saved.result : undefined }
      }
    },
    async completeAssistantCommand(roomId: string, actor: Actor, requestId: string, result: unknown) {
      await requireMember(inputId(roomId), actor)
      const key = roomKey(roomId, `REQUEST#AI_COMMAND#${idSchema.parse(requestId)}`)
      const commandRecord = await record(key)
      const saved = getData<{ userId: string; status: 'running' | 'completed'; result?: unknown }>(commandRecord)
      if (saved.userId !== actor.userId) throw new ConflictError()
      if (saved.status === 'completed') return saved.result
      await store.transact([check(memberKey(roomId, actor.userId)),
        put(key, { userId: actor.userId, status: 'completed', result }, expectation(commandRecord), (commandRecord.version ?? 0) + 1)])
      return result
    },
    // Server-only entry point: deliberately not exposed as a browser mutation.
    async appendAssistantMessage(roomId: string, content: string, actor: Actor, requestId: string, places: PlaceRecommendation[] = []): Promise<RoomEvent> {
      await requireMember(inputId(roomId), actor)
      idSchema.parse(requestId)
      const message: Message = { id: requestId, roomId, userId: actor.userId,
        content: z.string().min(1).max(16000).parse(content), type: 'ai', createdAt: now(), places }
      const marker = roomKey(roomId, `REQUEST#AI#${requestId}`)
      const saved = await createOnce(marker, message, actor, [check(memberKey(roomId, actor.userId)), put(marker, message),
        put(roomKey(roomId, `MESSAGE#${message.createdAt}#${message.id}`), message)])
      return event(roomId, 'message', saved.id, saved)
    },
    async execute(operation: string, args: Record<string, unknown>, actor: Actor): Promise<unknown> {
      if (!actor.userId) throw new ServiceError('UNAUTHENTICATED', '로그인이 필요합니다.')
      const rawInput = typeof args.input === 'string' ? JSON.parse(args.input) : args.input
      switch (operation) {
        case 'createRoom': {
          const input = createRoomInput.parse(rawInput)
          const roomId = input.requestId
          const room: Room = {
            id: roomId, name: input.name, destination: input.destination,
            startDate: input.startDate, endDate: input.endDate, participantCount: input.participantCount,
            createdBy: actor.userId, ...stamp(),
          }
          const member: RoomMember = {
            roomId, userId: actor.userId, role: 'owner', displayName: input.displayName, joinedAt: now(),
          }
          const days = datesBetween(input.startDate, input.endDate).map((date, index): TravelDay => ({
            id: randomUUID(), roomId, date, dayNumber: index + 1,
          }))
          const saved = await createOnce(roomKey(roomId, 'META'), room, actor, [
            put(roomKey(roomId, 'META'), room, 'absent', 1), put(memberKey(roomId, actor.userId), member),
            put({ pk: `USER#${actor.userId}`, sk: `ROOM#${roomId}` }, { roomId }),
            ...days.map(day => put(roomKey(roomId, `DAY#${day.id}`), day, 'absent', 1)),
          ])
          return event(roomId, 'room', roomId, normalizeRoom(saved))
        }
        case 'updateRoom': {
          const input = updateRoomInput.parse(rawInput)
          await requireMember(input.roomId, actor)
          const previous = normalizeRoom(await entity<Room>(roomKey(input.roomId, 'META')))
          const [dayRecords, blockRecords] = await Promise.all([
            store.query(`ROOM#${input.roomId}`, 'DAY#'),
            store.query(`ROOM#${input.roomId}`, 'BLOCK#'),
          ])
          const existingDays = dayRecords.map(getData<TravelDay>)
          const blocks = blockRecords.map(getData<TimeBlock>)
          const requestedDates = datesBetween(input.startDate, input.endDate)
          const requestedSet = new Set(requestedDates)
          const removedDays = existingDays.filter(day => !requestedSet.has(day.date))
          const scheduledRemovedDay = removedDays.find(day => blocks.some(block => block.dayId === day.id))
          if (scheduledRemovedDay) {
            throw new ServiceError('DATE_RANGE_HAS_SCHEDULE', `${scheduledRemovedDay.date}에 일정이 있어 여행 기간에서 제외할 수 없습니다.`)
          }
          const byDate = new Map(dayRecords.map(value => [getData<TravelDay>(value).date, value]))
          const byId = new Map(dayRecords.map(value => [getData<TravelDay>(value).id, value]))
          const nextDays = requestedDates.map((date, index): TravelDay => {
            const existingRecord = byDate.get(date)
            const existing = existingRecord ? getData<TravelDay>(existingRecord) : undefined
            return existing ? { ...existing, dayNumber: index + 1 }
              : { id: randomUUID(), roomId: input.roomId, date, dayNumber: index + 1 }
          })
          const dayWrites: Write[] = nextDays.flatMap(day => {
            const existingRecord = byDate.get(day.date)
            const existing = existingRecord ? getData<TravelDay>(existingRecord) : undefined
            if (existing?.dayNumber === day.dayNumber) return []
            return [put(roomKey(input.roomId, `DAY#${day.id}`), day,
              existingRecord ? expectation(existingRecord) : 'absent', (existingRecord?.version ?? 0) + 1)]
          })
          const room: Room = {
            ...previous, name: input.name, destination: input.destination ?? previous.destination, startDate: input.startDate, endDate: input.endDate,
            participantCount: input.participantCount, version: input.expectedVersion + 1, updatedAt: now(),
          }
          await store.transact([
            check(memberKey(input.roomId, actor.userId)),
            put(roomKey(input.roomId, 'META'), room, input.expectedVersion, room.version),
            ...dayWrites,
            ...removedDays.map(day => {
              const dayRecord = byId.get(day.id)
              return remove(roomKey(input.roomId, `DAY#${day.id}`), dayRecord ? expectation(dayRecord) : 'exists')
            }),
          ])
          return event(input.roomId, 'room', room.id, room, 'updated')
        }
        case 'createInvite': {
          const roomId = inputId(args.roomId)
          await requireMember(roomId, actor)
          const token = randomBytes(32).toString('base64url')
          const expires = Math.floor(clock().getTime() / 1000) + 7 * 86400
          await store.transact([check(memberKey(roomId, actor.userId)), {
            kind: 'put', expected: 'absent', item: {
              ...inviteKey(token), ttl: expires, data: { roomId, expires },
            },
          }])
          return { roomId, inviteToken: token, expiresAt: new Date(expires * 1000).toISOString() } satisfies RoomInvite
        }
        case 'joinRoom': {
          const input = joinRoomInput.parse(rawInput)
          const invitation = await store.get(inviteKey(input.inviteToken))
          const info = invitation?.data as { roomId: string; expires: number } | undefined
          if (!info || info.expires <= Math.floor(clock().getTime() / 1000)) {
            throw new ServiceError('INVALID_INVITE', '초대 링크가 잘못되었거나 만료되었습니다.')
          }
          const existing = await store.get(memberKey(info.roomId, actor.userId))
          if (existing) return event(info.roomId, 'member', actor.userId, existing.data)
          const member: RoomMember = {
            roomId: info.roomId, userId: actor.userId, displayName: input.displayName, role: 'member', joinedAt: now(),
          }
          const saved = await createOnce(memberKey(info.roomId, actor.userId), member, actor, [
            check(roomKey(info.roomId, 'META')), check(inviteKey(input.inviteToken)),
            put(memberKey(info.roomId, actor.userId), member),
            put({ pk: `USER#${actor.userId}`, sk: `ROOM#${info.roomId}` }, { roomId: info.roomId }),
          ])
          return event(info.roomId, 'member', actor.userId, saved)
        }
        case 'listMyRooms': {
          const memberships = await store.query(`USER#${actor.userId}`, 'ROOM#')
          const rooms = await Promise.all(memberships.map(async membership => {
            const { roomId } = getData<{ roomId: string }>(membership)
            await requireMember(roomId, actor)
            return normalizeRoom(await entity<Room>(roomKey(roomId, 'META')))
          }))
          return rooms.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        }
        case 'getRoomState': {
          const roomId = inputId(args.roomId)
          await requireMember(roomId, actor)
          const [room, members, days, blocks, pins, routes, messages] = await Promise.all([
            entity<Room>(roomKey(roomId, 'META')),
            store.query(`ROOM#${roomId}`, 'MEMBER#'), store.query(`ROOM#${roomId}`, 'DAY#'),
            store.query(`ROOM#${roomId}`, 'BLOCK#'), store.query(`ROOM#${roomId}`, 'PIN#'),
            store.query(`ROOM#${roomId}`, 'ROUTE#'), store.query(`ROOM#${roomId}`, 'MESSAGE#', 101, true),
          ])
          const activeBlocks = blocks.map(getData<TimeBlock>).filter(block => !block.deleting)
          const activeIds = new Set(activeBlocks.map(block => block.id))
          const pinValues = pins.map(getData<Pin>).filter(pin => activeIds.has(pin.timeBlockId))
          const blockValues = activeBlocks.map(block => ({
            ...block, pinOrder: normalizePinOrder(block, pinValues),
          }))
          return {
            room: normalizeRoom(room), members: members.map(getData<RoomMember>),
            days: days.map(getData<TravelDay>).sort((a, b) => a.dayNumber - b.dayNumber),
            timeBlocks: blockValues.sort((a, b) => a.startTime.localeCompare(b.startTime) || a.id.localeCompare(b.id)),
            pins: pinValues, routes: routes.map(value => decodeTravelRoute(value.data)).filter(route => activeIds.has(route.timeBlockId)),
            messages: messages.slice(0, 100).map(getData<Message>).reverse(),
            messagesHasMore: messages.length > 100,
          } satisfies RoomState
        }
        case 'createTimeBlock': {
          const input = createTimeBlockInput.parse(rawInput)
          await requireMember(input.roomId, actor)
          const dayKey = roomKey(input.roomId, `DAY#${input.dayId}`)
          const dayRecord = await record(dayKey)
          const day = getData<TravelDay>(dayRecord)
          const { requestId, ...fields } = input
          const block: TimeBlock = { ...fields, id: requestId, createdBy: actor.userId, pinOrder: [], ...stamp() }
          const key = roomKey(input.roomId, `BLOCK#${block.id}`)
          const saved = await createOnce(key, block, actor, [
            check(memberKey(input.roomId, actor.userId)),
            put(dayKey, day, expectation(dayRecord), (dayRecord.version ?? 0) + 1),
            put(key, block, 'absent', 1),
          ])
          return event(input.roomId, 'timeBlock', saved.id, saved)
        }
        case 'updateTimeBlock': {
          const input = updateTimeBlockInput.parse(rawInput)
          await requireMember(input.roomId, actor)
          const key = roomKey(input.roomId, `BLOCK#${input.timeBlockId}`)
          const previousRecord = await record(key)
          const previous = activeBlock(previousRecord)
          if (previous.version !== input.expectedVersion) throw new ConflictError()
          const block: TimeBlock = { ...previous, title: input.title, startTime: input.startTime, endTime: input.endTime,
            description: input.description, version: input.expectedVersion + 1, updatedAt: now() }
          await store.transact([check(memberKey(input.roomId, actor.userId)),
            put(key, block, expectation(previousRecord), block.version)])
          return event(input.roomId, 'timeBlock', block.id, block, 'updated')
        }
        case 'deleteTimeBlock': {
          const input = deleteTimeBlockInput.parse(rawInput)
          await requireMember(input.roomId, actor)
          const key = roomKey(input.roomId, `BLOCK#${input.timeBlockId}`)
          const requestKey = roomKey(input.roomId, `REQUEST#DELETE_BLOCK#${input.requestId}`)
          const replay = await store.get(requestKey)
          if (replay) {
            const saved = getData<{ userId: string; result: RoomEvent }>(replay)
            if (saved.userId !== actor.userId) throw new ConflictError()
            return saved.result
          }
          const previousRecord = await record(key)
          const block = getData<TimeBlock>(previousRecord)
          if (!block.deleting) {
            if (block.version !== input.expectedVersion) throw new ConflictError()
            await store.transact([check(memberKey(input.roomId, actor.userId)),
              put(key, { ...block, deleting: true, version: block.version + 1 }, expectation(previousRecord), block.version + 1)])
          }
          // The tombstone fences new pins/routes. Chunking also supports more than 100 children.
          const [pins, routes] = await Promise.all([
            store.query(`ROOM#${input.roomId}`, 'PIN#'), store.query(`ROOM#${input.roomId}`, 'ROUTE#'),
          ])
          const children = pins.filter(row => getData<Pin>(row).timeBlockId === block.id)
          const pinIds = new Set(children.map(row => getData<Pin>(row).id))
          children.push(...routes.filter(row => {
            const route = decodeTravelRoute(row.data)
            return route.timeBlockId === block.id || pinIds.has(route.originPinId) || pinIds.has(route.destinationPinId)
          }))
          for (let index = 0; index < children.length; index += 90) {
            const remaining = (await Promise.all(children.slice(index, index + 90).map(row => store.get(row)))).filter((row): row is RecordItem => Boolean(row))
            if (remaining.length) await store.transact(remaining.map(row => remove(row)))
          }
          const result = event(input.roomId, 'timeBlock', block.id, block, 'deleted')
          await store.transact([check(memberKey(input.roomId, actor.userId)), remove(key),
            put(requestKey, { userId: actor.userId, result })])
          return result
        }
        case 'createPin': {
          const input = createPinInput.parse(rawInput)
          if (input.placeProvider === 'kakao' && input.placeId?.startsWith('mock-')) {
            throw new ServiceError('INVALID_PLACE_SOURCE', '검증되지 않은 예시 장소는 실제 여행방에 저장할 수 없습니다.')
          }
          await requireMember(input.roomId, actor)
          const blockKey = roomKey(input.roomId, `BLOCK#${input.timeBlockId}`)
          const blockRecord = await record(blockKey)
          const previousBlock = activeBlock(blockRecord)
          const currentPins = (await store.query(`ROOM#${input.roomId}`, 'PIN#')).map(getData<Pin>)
          const { requestId, ...fields } = input
          const pin: Pin = { ...fields, id: requestId, createdBy: actor.userId, ...stamp() }
          const nextBlock: TimeBlock = {
            ...previousBlock, pinOrder: [...normalizePinOrder(previousBlock, currentPins), pin.id],
            version: previousBlock.version + 1, updatedAt: now(),
          }
          const key = roomKey(input.roomId, `PIN#${pin.id}`)
          const saved = await createOnce(key, pin, actor, [
            check(memberKey(input.roomId, actor.userId)),
            put(blockKey, nextBlock, expectation(blockRecord), nextBlock.version),
            put(key, pin, 'absent', 1),
          ])
          return event(input.roomId, 'pin', saved.id, saved)
        }
        case 'updatePin': {
          const input = updatePinInput.parse(rawInput)
          await requireMember(input.roomId, actor)
          const key = roomKey(input.roomId, `PIN#${input.pinId}`)
          const previous = await entity<Pin>(key)
          const blockKey = roomKey(input.roomId, `BLOCK#${previous.timeBlockId}`)
          const blockRecord = await record(blockKey)
          const block = activeBlock(blockRecord)
          const pin: Pin = { ...previous, title: input.title, description: input.description,
            ...(input.visitOrder === undefined ? {} : { visitOrder: input.visitOrder }),
            category: input.category, status: input.status, version: input.expectedVersion + 1, updatedAt: now() }
          await store.transact([check(memberKey(input.roomId, actor.userId)),
            put(blockKey, { ...block, version: block.version + 1 }, expectation(blockRecord), block.version + 1),
            put(key, pin, input.expectedVersion, pin.version)])
          return event(input.roomId, 'pin', pin.id, pin, 'updated')
        }
        case 'deletePin': {
          const input = deletePinInput.parse(rawInput)
          await requireMember(input.roomId, actor)
          const requestKey = roomKey(input.roomId, `REQUEST#DELETE_PIN#${input.requestId}`)
          const replay = await store.get(requestKey)
          if (replay) {
            const saved = getData<{ userId: string; result: RoomEvent }>(replay)
            if (saved.userId !== actor.userId) throw new ConflictError()
            return saved.result
          }
          const pinKey = roomKey(input.roomId, `PIN#${input.pinId}`)
          const pinRecord = await record(pinKey)
          const pin = getData<Pin>(pinRecord)
          if (pin.version !== input.expectedVersion) throw new ConflictError()
          const blockKey = roomKey(input.roomId, `BLOCK#${pin.timeBlockId}`)
          const blockRecord = await record(blockKey)
          const previousBlock = activeBlock(blockRecord)
          const [currentPins, routeRecords] = await Promise.all([
            store.query(`ROOM#${input.roomId}`, 'PIN#'), store.query(`ROOM#${input.roomId}`, 'ROUTE#'),
          ])
          const relatedRoutes = routeRecords.filter(value => {
            const route = decodeTravelRoute(value.data)
            return route.originPinId === pin.id || route.destinationPinId === pin.id
          })
          const nextBlock: TimeBlock = {
            ...previousBlock,
            pinOrder: normalizePinOrder(previousBlock, currentPins.map(getData<Pin>)).filter(id => id !== pin.id),
            version: previousBlock.version + 1,
            updatedAt: now(),
          }
          const result = event(input.roomId, 'pin', pin.id, pin, 'deleted')
          await store.transact([
            check(memberKey(input.roomId, actor.userId)),
            put(blockKey, nextBlock, expectation(blockRecord), nextBlock.version),
            remove(pinKey, expectation(pinRecord)),
            ...relatedRoutes.map(route => remove({ pk: route.pk, sk: route.sk }, expectation(route))),
            put(requestKey, { userId: actor.userId, result }),
          ])
          return result
        }
        case 'reorderPins': {
          const input = reorderPinsInput.parse(rawInput)
          await requireMember(input.roomId, actor)
          const requestKey = roomKey(input.roomId, `REQUEST#REORDER_PINS#${input.requestId}`)
          const replay = await store.get(requestKey)
          if (replay) {
            const saved = getData<{ userId: string; result: RoomEvent }>(replay)
            if (saved.userId !== actor.userId) throw new ConflictError()
            return saved.result
          }
          const blockKey = roomKey(input.roomId, `BLOCK#${input.timeBlockId}`)
          const blockRecord = await record(blockKey)
          const previousBlock = activeBlock(blockRecord)
          if (previousBlock.version !== input.expectedVersion) throw new ConflictError()
          const currentPins = (await store.query(`ROOM#${input.roomId}`, 'PIN#')).map(getData<Pin>)
          const currentIds = normalizePinOrder(previousBlock, currentPins)
          const submitted = new Set(input.orderedPinIds)
          if (submitted.size !== input.orderedPinIds.length || input.orderedPinIds.length !== currentIds.length
            || currentIds.some(id => !submitted.has(id))) {
            throw new ServiceError('INVALID_PIN_ORDER', '현재 타임블록의 모든 핀을 중복 없이 정확히 한 번씩 보내야 합니다.')
          }
          const block: TimeBlock = {
            ...previousBlock, pinOrder: [...input.orderedPinIds], version: input.expectedVersion + 1, updatedAt: now(),
          }
          const result = event(input.roomId, 'timeBlock', block.id, block, 'updated')
          await store.transact([check(memberKey(input.roomId, actor.userId)),
            put(blockKey, block, expectation(blockRecord), block.version),
            put(requestKey, { userId: actor.userId, result })])
          return result
        }
        case 'createRoute': {
          const input = createRouteInput.parse(rawInput)
          await requireMember(input.roomId, actor)
          const requestKey = roomKey(input.roomId, `REQUEST#CREATE_ROUTE#${input.requestId}`)
          const replay = await store.get(requestKey)
          if (replay) {
            const saved = decodeRouteReplay(replay.data)
            if (saved.userId !== actor.userId) throw new ConflictError()
            return saved.result
          }
          const blockKey = roomKey(input.roomId, `BLOCK#${input.timeBlockId}`)
          const [blockRecord, originRecord, destinationRecord, pinRecords, routeRecords] = await Promise.all([
            record(blockKey), record(roomKey(input.roomId, `PIN#${input.originPinId}`)),
            record(roomKey(input.roomId, `PIN#${input.destinationPinId}`)),
            store.query(`ROOM#${input.roomId}`, 'PIN#'), store.query(`ROOM#${input.roomId}`, 'ROUTE#'),
          ])
          const previousBlock = activeBlock(blockRecord)
          const origin = getData<Pin>(originRecord)
          const destination = getData<Pin>(destinationRecord)
          if (origin.timeBlockId !== input.timeBlockId || destination.timeBlockId !== input.timeBlockId) {
            throw new ServiceError('INVALID_ROUTE_PINS', '출발 핀과 도착 핀은 지정한 같은 타임블록에 있어야 합니다.')
          }
          const currentRoutes = routeRecords.map(value => decodeTravelRoute(value.data))
          const routeCountFor = (pinId: string) => currentRoutes.filter(route =>
            route.originPinId === pinId || route.destinationPinId === pinId).length
          // deletePin has four fixed writes, leaving 96 route deletes in DynamoDB's 100-action transaction.
          if (routeCountFor(origin.id) >= 96 || routeCountFor(destination.id) >= 96) {
            throw new ServiceError('ROUTE_LIMIT', '핀 하나에는 최대 96개의 경로를 연결할 수 있습니다.')
          }
          const { requestId, ...fields } = input
          const route: TravelRoute = { ...fields, id: requestId, createdBy: actor.userId, ...stamp() }
          const nextBlock: TimeBlock = {
            ...previousBlock,
            pinOrder: placeDestinationAfterOrigin(
              normalizePinOrder(previousBlock, pinRecords.map(getData<Pin>)), origin.id, destination.id,
            ),
            version: previousBlock.version + 1,
            updatedAt: now(),
          }
          const result = event(input.roomId, 'route', route.id, route)
          try {
            await store.transact([
              check(memberKey(input.roomId, actor.userId)),
              put(blockKey, nextBlock, expectation(blockRecord), nextBlock.version),
              put(roomKey(input.roomId, `ROUTE#${route.id}`), encodeTravelRoute(route), 'absent', route.version),
              put(requestKey, encodeRouteReplay(actor.userId, result, route)),
            ])
            return result
          } catch (error) {
            if (!(error instanceof ConflictError)) throw error
            const winner = await store.get(requestKey)
            if (winner) {
              const saved = decodeRouteReplay(winner.data)
              if (saved.userId === actor.userId) return saved.result
            }
            throw error
          }
        }
        case 'updateRoute': {
          const input = updateRouteInput.parse(rawInput)
          await requireMember(input.roomId, actor)
          const requestKey = roomKey(input.roomId, `REQUEST#UPDATE_ROUTE#${input.requestId}`)
          const replay = await store.get(requestKey)
          if (replay) {
            const saved = decodeRouteReplay(replay.data)
            if (saved.userId !== actor.userId) throw new ConflictError()
            return saved.result
          }
          const routeKey = roomKey(input.roomId, `ROUTE#${input.routeId}`)
          const routeRecord = await record(routeKey)
          const previous = decodeTravelRoute(routeRecord.data)
          if (previous.version !== input.expectedVersion) throw new ConflictError()
          const route: TravelRoute = {
            ...previous, name: input.name, distanceMeters: input.distanceMeters,
            durationSeconds: input.durationSeconds, path: input.path,
            version: input.expectedVersion + 1, updatedAt: now(),
          }
          const result = event(input.roomId, 'route', route.id, route, 'updated')
          try {
            await store.transact([
              check(memberKey(input.roomId, actor.userId)),
              put(routeKey, encodeTravelRoute(route), expectation(routeRecord), route.version),
              put(requestKey, encodeRouteReplay(actor.userId, result, route)),
            ])
            return result
          } catch (error) {
            if (!(error instanceof ConflictError)) throw error
            const winner = await store.get(requestKey)
            if (winner) {
              const saved = decodeRouteReplay(winner.data)
              if (saved.userId === actor.userId) return saved.result
            }
            throw error
          }
        }
        case 'deleteRoute': {
          const input = deleteRouteInput.parse(rawInput)
          await requireMember(input.roomId, actor)
          const requestKey = roomKey(input.roomId, `REQUEST#DELETE_ROUTE#${input.requestId}`)
          const replay = await store.get(requestKey)
          if (replay) {
            const saved = decodeRouteReplay(replay.data)
            if (saved.userId !== actor.userId) throw new ConflictError()
            return saved.result
          }
          const routeKey = roomKey(input.roomId, `ROUTE#${input.routeId}`)
          const routeRecord = await record(routeKey)
          const route = decodeTravelRoute(routeRecord.data)
          if (route.version !== input.expectedVersion) throw new ConflictError()
          const result = event(input.roomId, 'route', route.id, route, 'deleted')
          try {
            await store.transact([
              check(memberKey(input.roomId, actor.userId)),
              remove(routeKey, expectation(routeRecord)),
              put(requestKey, encodeRouteReplay(actor.userId, result, route)),
            ])
            return result
          } catch (error) {
            if (!(error instanceof ConflictError)) throw error
            const winner = await store.get(requestKey)
            if (winner) {
              const saved = decodeRouteReplay(winner.data)
              if (saved.userId === actor.userId) return saved.result
            }
            throw error
          }
        }
        case 'sendMessage': {
          const input = sendMessageInput.parse(rawInput)
          await requireMember(input.roomId, actor)
          const marker = roomKey(input.roomId, `REQUEST#MESSAGE#${input.requestId}`)
          const message: Message = {
            id: input.requestId, roomId: input.roomId, userId: actor.userId,
            content: input.content, type: 'user', createdAt: now(),
          }
          const saved = await createOnce(marker, message, actor, [
            check(memberKey(input.roomId, actor.userId)), put(marker, message),
            put(roomKey(input.roomId, `MESSAGE#${message.createdAt}#${message.id}`), message),
          ])
          return event(input.roomId, 'message', saved.id, saved)
        }
        default: throw new ServiceError('UNKNOWN_OPERATION', '지원하지 않는 작업입니다.')
      }
    },
  }
}

export function publicError(error: unknown): Error {
  if (error instanceof ServiceError || error instanceof ConflictError) return error
  if (error instanceof z.ZodError) return new ServiceError('VALIDATION', error.issues.map(value => `${value.path.join('.')}: ${value.message}`).join('; '))
  if (error instanceof SyntaxError) return new ServiceError('VALIDATION', '입력 JSON을 확인해 주세요.')
  return new ServiceError('INTERNAL', '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.')
}
