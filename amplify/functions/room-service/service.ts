import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { z } from 'zod'
import {
  createRoomInput, joinRoomInput, createTimeBlockInput, updateTimeBlockInput,
  createPinInput, updatePinInput, sendMessageInput, idSchema,
  type Room, type RoomMember, type TravelDay, type TimeBlock, type Pin, type Message,
  type RoomEvent, type RoomState, type RoomInvite,
} from '../../../shared/contracts'
import { ConflictError, type Key, type RecordItem, type Store, type Write } from './store'

export class ServiceError extends Error {
  constructor(public readonly code: string, message: string) { super(`${code}: ${message}`) }
}
type Actor = { userId: string }
const roomKey = (roomId: string, sk: string): Key => ({ pk: `ROOM#${roomId}`, sk })
const memberKey = (roomId: string, userId: string) => roomKey(roomId, `MEMBER#${userId}`)
const inviteKey = (token: string): Key => ({ pk: `INVITE#${createHash('sha256').update(token).digest('hex')}`, sk: 'META' })
const put = (key: Key, data: unknown, expected: 'absent' | number = 'absent', version?: number): Write => ({
  kind: 'put', item: { ...key, data, ...(version ? { version } : {}) }, expected,
})
const check = (key: Key): Write => ({ kind: 'check', key })
const getData = <T>(record: RecordItem) => record.data as T
const inputId = (value: unknown) => idSchema.parse(value)

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
    async execute(operation: string, args: Record<string, unknown>, actor: Actor): Promise<unknown> {
      if (!actor.userId) throw new ServiceError('UNAUTHENTICATED', '로그인이 필요합니다.')
      const rawInput = typeof args.input === 'string' ? JSON.parse(args.input) : args.input
      switch (operation) {
        case 'createRoom': {
          const input = createRoomInput.parse(rawInput)
          const roomId = input.requestId
          const room: Room = {
            id: roomId, name: input.name, destination: input.destination,
            startDate: input.startDate, endDate: input.endDate, createdBy: actor.userId, ...stamp(),
          }
          const member: RoomMember = {
            roomId, userId: actor.userId, role: 'owner', displayName: input.displayName, joinedAt: now(),
          }
          const days: TravelDay[] = []
          for (let value = Date.parse(input.startDate); value <= Date.parse(input.endDate); value += 86400000) {
            days.push({ id: randomUUID(), roomId, date: new Date(value).toISOString().slice(0, 10), dayNumber: days.length + 1 })
          }
          const saved = await createOnce(roomKey(roomId, 'META'), room, actor, [
            put(roomKey(roomId, 'META'), room, 'absent', 1), put(memberKey(roomId, actor.userId), member),
            put({ pk: `USER#${actor.userId}`, sk: `ROOM#${roomId}` }, { roomId }),
            ...days.map(day => put(roomKey(roomId, `DAY#${day.id}`), day)),
          ])
          return event(roomId, 'room', roomId, saved)
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
            return entity<Room>(roomKey(roomId, 'META'))
          }))
          return rooms.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        }
        case 'getRoomState': {
          const roomId = inputId(args.roomId)
          await requireMember(roomId, actor)
          const [room, members, days, blocks, pins, messages] = await Promise.all([
            entity<Room>(roomKey(roomId, 'META')),
            store.query(`ROOM#${roomId}`, 'MEMBER#'), store.query(`ROOM#${roomId}`, 'DAY#'),
            store.query(`ROOM#${roomId}`, 'BLOCK#'), store.query(`ROOM#${roomId}`, 'PIN#'),
            store.query(`ROOM#${roomId}`, 'MESSAGE#', 101, true),
          ])
          return {
            room, members: members.map(getData<RoomMember>),
            days: days.map(getData<TravelDay>).sort((a, b) => a.dayNumber - b.dayNumber),
            timeBlocks: blocks.map(getData<TimeBlock>).sort((a, b) => a.startTime.localeCompare(b.startTime) || a.id.localeCompare(b.id)),
            pins: pins.map(getData<Pin>), messages: messages.slice(0, 100).map(getData<Message>).reverse(),
            messagesHasMore: messages.length > 100,
          } satisfies RoomState
        }
        case 'createTimeBlock': {
          const input = createTimeBlockInput.parse(rawInput)
          await requireMember(input.roomId, actor)
          await entity<TravelDay>(roomKey(input.roomId, `DAY#${input.dayId}`))
          const { requestId, ...fields } = input
          const block: TimeBlock = { ...fields, id: requestId, createdBy: actor.userId, ...stamp() }
          const key = roomKey(input.roomId, `BLOCK#${block.id}`)
          const saved = await createOnce(key, block, actor, [
            check(memberKey(input.roomId, actor.userId)), check(roomKey(input.roomId, `DAY#${input.dayId}`)),
            put(key, block, 'absent', 1),
          ])
          return event(input.roomId, 'timeBlock', saved.id, saved)
        }
        case 'updateTimeBlock': {
          const input = updateTimeBlockInput.parse(rawInput)
          await requireMember(input.roomId, actor)
          const key = roomKey(input.roomId, `BLOCK#${input.timeBlockId}`)
          const previous = await entity<TimeBlock>(key)
          const block: TimeBlock = { ...previous, title: input.title, startTime: input.startTime, endTime: input.endTime,
            description: input.description, version: input.expectedVersion + 1, updatedAt: now() }
          await store.transact([check(memberKey(input.roomId, actor.userId)), put(key, block, input.expectedVersion, block.version)])
          return event(input.roomId, 'timeBlock', block.id, block, 'updated')
        }
        case 'createPin': {
          const input = createPinInput.parse(rawInput)
          await requireMember(input.roomId, actor)
          await entity<TimeBlock>(roomKey(input.roomId, `BLOCK#${input.timeBlockId}`))
          const { requestId, ...fields } = input
          const pin: Pin = { ...fields, id: requestId, createdBy: actor.userId, ...stamp() }
          const key = roomKey(input.roomId, `PIN#${pin.id}`)
          const saved = await createOnce(key, pin, actor, [
            check(memberKey(input.roomId, actor.userId)), check(roomKey(input.roomId, `BLOCK#${input.timeBlockId}`)),
            put(key, pin, 'absent', 1),
          ])
          return event(input.roomId, 'pin', saved.id, saved)
        }
        case 'updatePin': {
          const input = updatePinInput.parse(rawInput)
          await requireMember(input.roomId, actor)
          const key = roomKey(input.roomId, `PIN#${input.pinId}`)
          const previous = await entity<Pin>(key)
          const pin: Pin = { ...previous, title: input.title, description: input.description,
            category: input.category, status: input.status, version: input.expectedVersion + 1, updatedAt: now() }
          await store.transact([check(memberKey(input.roomId, actor.userId)), put(key, pin, input.expectedVersion, pin.version)])
          return event(input.roomId, 'pin', pin.id, pin, 'updated')
        }
        case 'sendMessage': {
          const input = sendMessageInput.parse(rawInput)
          await requireMember(input.roomId, actor)
          // Request marker makes retries idempotent even when their timestamps differ.
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
  if (error instanceof z.ZodError) return new ServiceError('VALIDATION', error.issues.map(v => `${v.path.join('.')}: ${v.message}`).join('; '))
  if (error instanceof SyntaxError) return new ServiceError('VALIDATION', '입력 JSON을 확인해 주세요.')
  return new ServiceError('INTERNAL', '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.')
}
