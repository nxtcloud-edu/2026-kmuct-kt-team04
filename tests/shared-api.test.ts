import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createLocalBackend, sharedRoomId } from '../server/local-backend'
import type { RoomState, RoomEvent, Pin, TimeBlock } from '../shared/contracts'

test('two independent anonymous sessions share chat, edits, tied orders and cascading block deletion', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'travel-shared-test-'))
  const middleware = await createLocalBackend(directory, () => ({ apiKey: '', kakaoKey: '', baseUrl: 'https://example.com', model: 'test' }), { dataDirectory: directory })
  const server = createServer((req, res) => { void middleware(req, res, () => { res.writeHead(404); res.end() }) })
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done))
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  async function guest() {
    const response = await fetch(`${origin}/api/local-status`)
    const status = await response.json() as { currentUserId: string }
    const cookie = response.headers.get('set-cookie')!.split(';')[0]
    return { status, cookie, async call(path: string, body: unknown) {
      const response = await fetch(`${origin}/api/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify(body) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error)
      return data
    } }
  }
  try {
    const a = await guest(), b = await guest()
    assert.notEqual(a.status.currentUserId, b.status.currentUserId)
    await a.call('profile', { displayName: '시연 A' }); await b.call('profile', { displayName: '시연 B' })
    const state = (): Promise<RoomState> => b.call('room/getRoomState', { roomId: sharedRoomId })
    const mutation = (who: typeof a, name: string, input: object) => who.call(`room/${name}`, { input: { roomId: sharedRoomId, ...input } }) as Promise<RoomEvent>
    await mutation(a, 'sendMessage', { content: 'A가 보낸 공유 메시지', requestId: randomUUID() })
    assert.equal((await state()).messages[0].userId, a.status.currentUserId)
    const block = (await mutation(a, 'createTimeBlock', { dayId: (await state()).days[0].id, title: '삭제 테스트', startTime: '10:00', endTime: '12:00', requestId: randomUUID() })).data as TimeBlock
    const other = (await mutation(a, 'createTimeBlock', { dayId: block.dayId, title: '유지할 일정', startTime: '13:00', endTime: '14:00', requestId: randomUUID() })).data as TimeBlock
    const makePin = async (id: string, title: string) => (await mutation(a, 'createPin', { timeBlockId: id, title, latitude: 37.5, longitude: 127, placeProvider: 'manual', requestId: randomUUID() })).data as Pin
    const p1 = await makePin(block.id, '첫 후보'), p2 = await makePin(block.id, '두번째 후보')
    const retained = await makePin(other.id, '유지할 핀')
    for (const pin of [p1, p2]) await mutation(b, 'updatePin', { pinId: pin.id, title: pin.title, description: 'B가 수정함', category: '', status: 'candidate', visitOrder: 1, expectedVersion: pin.version })
    assert.deepEqual((await state()).pins.filter(p => p.timeBlockId === block.id).map(p => p.visitOrder), [1, 1])
    await mutation(a, 'createRoute', { timeBlockId: block.id, name: '테스트 경로', mode: 'car', originPinId: p1.id, destinationPinId: p2.id,
      distanceMeters: 100, durationSeconds: 60, path: [{ latitude: 37.5, longitude: 127 }], requestId: randomUUID() })
    let latest = (await state()).timeBlocks.find(v => v.id === block.id)!
    await assert.rejects(mutation(b, 'deleteTimeBlock', { timeBlockId: block.id, expectedVersion: 1, requestId: randomUUID() }), /CONFLICT/)
    // More than 100 descendants exercises chunked cascading deletion.
    for (let i = 0; i < 101; i++) await makePin(block.id, `추가 후보 ${i}`)
    latest = (await state()).timeBlocks.find(v => v.id === block.id)!
    const deletion = { timeBlockId: block.id, expectedVersion: latest.version, requestId: randomUUID() }
    await mutation(b, 'deleteTimeBlock', deletion); await mutation(b, 'deleteTimeBlock', deletion)
    const final = await state()
    assert.equal(final.timeBlocks.length, 1); assert.equal(final.pins.length, 1); assert.equal(final.pins[0].id, retained.id)
    assert.equal(final.routes.length, 0); assert.equal(final.messages.length, 1)
    await assert.rejects(mutation(a, 'createPin', { timeBlockId: block.id, title: '삭제 후 쓰기', latitude: 0, longitude: 0, placeProvider: 'manual', requestId: randomUUID() }), /NOT_FOUND/)
    await assert.rejects(b.call('room/getRoomState', { roomId: randomUUID() }), /ROOM_DENIED/)
    const invalid = await fetch(`${origin}/api/room/getRoomState`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: 'travel_guest=forged.fake' }, body: JSON.stringify({ roomId: sharedRoomId }) })
    assert.equal(invalid.status, 401)
    const cross = await fetch(`${origin}/api/profile`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: a.cookie, Origin: 'https://unrelated.example' }, body: JSON.stringify({ displayName: 'forged' }) })
    assert.equal(cross.status, 400)
  } finally {
    server.closeAllConnections(); await new Promise<void>(done => server.close(() => done()))
    assert.ok(relative(tmpdir(), directory).startsWith('travel-shared-test-'))
    await rm(directory, { recursive: true })
  }
})
