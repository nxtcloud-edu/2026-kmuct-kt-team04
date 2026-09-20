import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { createRoomService } from '../amplify/functions/room-service/service'
import { ConflictError, type Store, type RecordItem, type Key, type Write } from '../amplify/functions/room-service/store'
import type { RoomEvent, RoomInvite, RoomState, Pin, TimeBlock } from '../shared/contracts'

// Tests execute the production service, replacing only the DynamoDB transport.
class MemoryStore implements Store {
  items = new Map<string, RecordItem>()
  key(key: Key) { return `${key.pk}|${key.sk}` }
  async get(key: Key) { return structuredClone(this.items.get(this.key(key))) }
  async query(pk: string, prefix: string, limit?: number, descending = false) {
    const rows = [...this.items.values()].filter(v => v.pk === pk && v.sk.startsWith(prefix))
      .sort((a, b) => a.sk.localeCompare(b.sk) * (descending ? -1 : 1))
    return structuredClone(limit ? rows.slice(0, limit) : rows)
  }
  async transact(writes: Write[]) {
    for (const write of writes) {
      const previous = this.items.get(this.key(write.kind === 'put' ? write.item : write.key))
      if (write.kind === 'check' ? !previous : write.expected === 'absent' ? !!previous :
        write.expected === 'exists' ? !previous : write.expected === 'unversioned' ? !previous || previous.version !== undefined : previous?.version !== write.expected) {
        throw new ConflictError()
      }
    }
    assert.ok(writes.length <= 100, 'DynamoDB transaction action limit')
    for (const write of writes) {
      if (write.kind === 'put') this.items.set(this.key(write.item), structuredClone(write.item))
      if (write.kind === 'delete') this.items.delete(this.key(write.key))
    }
  }
}
const alice = { userId: 'alice' }, bob = { userId: 'bob' }, outsider = { userId: 'outsider' }

async function fixture() {
  const store = new MemoryStore()
  let date = new Date('2026-09-20T03:00:00Z')
  const service = createRoomService(store, () => date)
  const call = (operation: string, input: unknown, actor = alice) => service.execute(operation, { input }, actor)
  const roomInput = { name: '부산 여행', destination: '부산', startDate: '2026-10-01', endDate: '2026-10-03', displayName: 'A', requestId: randomUUID() }
  const created = await call('createRoom', roomInput) as RoomEvent
  const roomId = created.roomId
  const state = () => service.execute('getRoomState', { roomId }, alice) as Promise<RoomState>
  const invite = await service.execute('createInvite', { roomId }, alice) as RoomInvite
  const block = await call('createTimeBlock', {
    roomId, dayId: (await state()).days[0].id, title: '점심', startTime: '12:00', endTime: '13:00', requestId: randomUUID(),
  }) as RoomEvent
  const pinInput = {
    roomId, timeBlockId: block.entityId, title: '숙소 후보', latitude: 35.16, longitude: 129.16,
    placeProvider: 'kakao', placeId: '12345', requestId: randomUUID(),
  }
  return { service, call, roomId, state, invite, block, pinInput, roomInput, setDate: (value: string) => { date = new Date(value) } }
}

test('room creation creates all travel days and an owner; retries do not duplicate', async () => {
  const f = await fixture()
  await f.call('createRoom', f.roomInput)
  const state = await f.state()
  assert.deepEqual(state.days.map(v => v.date), ['2026-10-01', '2026-10-02', '2026-10-03'])
  assert.equal(state.members.length, 1)
  assert.equal(state.members[0].role, 'owner')
  assert.equal((await f.service.execute('listMyRooms', {}, alice) as unknown[]).length, 1)
})
test('non-members cannot read or modify a room', async () => {
  const f = await fixture()
  await assert.rejects(f.service.execute('getRoomState', { roomId: f.roomId }, outsider), /FORBIDDEN/)
  await assert.rejects(f.call('createPin', f.pinInput, outsider), /FORBIDDEN/)
  await assert.rejects(f.service.execute('createInvite', { roomId: f.roomId }, outsider), /FORBIDDEN/)
})
test('invited second user sees shared data and can update another member pin', async () => {
  const f = await fixture()
  await f.call('joinRoom', { inviteToken: f.invite.inviteToken, displayName: 'B' }, bob)
  const pin = (await f.call('createPin', f.pinInput) as RoomEvent).data as Pin
  await f.call('updatePin', { roomId: f.roomId, pinId: pin.id, title: pin.title,
    description: 'B가 추천', category: '숙소', status: 'confirmed', expectedVersion: pin.version }, bob)
  const state = await f.service.execute('getRoomState', { roomId: f.roomId }, bob) as RoomState
  assert.equal(state.pins[0].description, 'B가 추천')
  assert.equal(state.pins[0].createdBy, 'alice')
  assert.equal(state.members.length, 2)
})
test('expired or fabricated invitations fail and repeated joins are safe', async () => {
  const f = await fixture()
  await assert.rejects(f.call('joinRoom', { inviteToken: 'a'.repeat(43), displayName: 'B' }, bob), /INVALID_INVITE/)
  await f.call('joinRoom', { inviteToken: f.invite.inviteToken, displayName: 'B' }, bob)
  await f.call('joinRoom', { inviteToken: f.invite.inviteToken, displayName: 'B' }, bob)
  assert.equal((await f.state()).members.length, 2)
  f.setDate('2026-09-28T03:00:00Z')
  await assert.rejects(f.call('joinRoom', { inviteToken: f.invite.inviteToken, displayName: 'C' }, outsider), /INVALID_INVITE/)
})
test('pin creation needs an existing time block in the same room', async () => {
  const f = await fixture()
  await assert.rejects(f.call('createPin', { ...f.pinInput, timeBlockId: undefined }))
  await assert.rejects(f.call('createPin', { ...f.pinInput, timeBlockId: randomUUID() }), /NOT_FOUND/)
  const other = await f.call('createRoom', { ...f.roomInput, requestId: randomUUID() }) as RoomEvent
  await assert.rejects(f.call('createPin', { ...f.pinInput, roomId: other.roomId }), /NOT_FOUND/)
  assert.equal((await f.state()).pins.length, 0)
})
test('invalid coordinates, missing place IDs and forged authors are rejected', async () => {
  const f = await fixture()
  for (const changes of [{ latitude: 91 }, { longitude: -181 }, { placeId: undefined }, { createdBy: 'admin' }]) {
    await assert.rejects(f.call('createPin', { ...f.pinInput, ...changes }))
  }
})
test('stale concurrent edits cannot overwrite accepted edits', async () => {
  const f = await fixture()
  const pin = (await f.call('createPin', f.pinInput) as RoomEvent).data as Pin
  const edit = { roomId: f.roomId, pinId: pin.id, title: pin.title, description: '수정 1', category: '', status: 'candidate', expectedVersion: 1 }
  const results = await Promise.allSettled([f.call('updatePin', edit), f.call('updatePin', { ...edit, description: '수정 2' })])
  assert.equal(results.filter(v => v.status === 'fulfilled').length, 1)
  assert.equal(results.filter(v => v.status === 'rejected').length, 1)
  assert.equal((await f.state()).pins[0].version, 2)
})
test('repeated creation requests do not duplicate pins or messages', async () => {
  const f = await fixture()
  await Promise.all([f.call('createPin', f.pinInput), f.call('createPin', f.pinInput)])
  const message = { roomId: f.roomId, content: '안녕하세요', requestId: randomUUID() }
  await f.call('sendMessage', message)
  f.setDate('2026-09-20T04:00:00Z')
  await f.call('sendMessage', message)
  assert.equal((await f.state()).pins.length, 1)
  assert.equal((await f.state()).messages.length, 1)
})
test('message type and user identity cannot be forged by client', async () => {
  const f = await fixture()
  await assert.rejects(f.call('sendMessage', { roomId: f.roomId, content: 'AI 사칭', type: 'ai', requestId: randomUUID() }))
  await assert.rejects(f.call('sendMessage', { roomId: f.roomId, content: '사용자 사칭', userId: 'bob', requestId: randomUUID() }))
})
test('time updates preserve day ownership and reject invalid ranges', async () => {
  const f = await fixture()
  const block = f.block.data as TimeBlock
  const edit = { roomId: f.roomId, timeBlockId: block.id, title: '새 점심', startTime: '13:00', endTime: '14:00', description: '', expectedVersion: 1 }
  await assert.rejects(f.call('updateTimeBlock', { ...edit, endTime: '12:00' }))
  await assert.rejects(f.call('updateTimeBlock', { ...edit, dayId: randomUUID() }))
  await f.call('updateTimeBlock', edit)
  assert.equal((await f.state()).timeBlocks[0].dayId, block.dayId)
})
test('room dates are valid, ordered and limited to 30 days', async () => {
  const f = await fixture()
  for (const change of [{ startDate: '2026-02-30' }, { startDate: '2026-11-01' }, { endDate: '2026-12-01' }]) {
    await assert.rejects(f.call('createRoom', { ...f.roomInput, ...change, requestId: randomUUID() }))
  }
})
test('unauthenticated callers are denied', async () => {
  const f = await fixture()
  await assert.rejects(f.service.execute('listMyRooms', {}, { userId: '' }), /UNAUTHENTICATED/)
})
