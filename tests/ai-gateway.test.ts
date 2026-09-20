import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative, isAbsolute } from 'node:path'
import { randomUUID } from 'node:crypto'
import { resolvePinTarget, askGateway, searchKakao } from '../server/ai-gateway'
import { createFileStore } from '../server/file-store'
import { createRoomService } from '../amplify/functions/room-service/service'
import { exampleRoomState } from '../shared/example-room-state'
import type { RoomState } from '../shared/contracts'

test('pin writes need explicit intent and an unambiguous target; explicit text overrides selection', () => {
  const state = structuredClone(exampleRoomState)
  const first = state.timeBlocks[0].id
  state.timeBlocks.push({ ...state.timeBlocks[0], id: randomUUID(), dayId: state.days[1].id })
  assert.equal(resolvePinTarget('카페 추천해줘', state, first).wantsPins, false)
  assert.equal(resolvePinTarget('카페 핀 찍어줘', state).targetId, undefined)
  assert.equal(resolvePinTarget('해운대 산책에 핀 찍어줘', state).targetId, undefined)
  assert.equal(resolvePinTarget('1일차 해운대 산책에 핀 찍어줘', state, state.timeBlocks[1].id).targetId, first)
  assert.equal(resolvePinTarget('3일차에 핀 찍어줘', state, first).targetId, undefined)
})

test('missing credentials are explicit errors, never fabricated AI replies or places', async () => {
  const settings = { apiKey: '', baseUrl: 'https://52.79.201.46/v1', model: 'bedrock-gpt-5.6-sol', kakaoKey: '' }
  await assert.rejects(askGateway('안녕', exampleRoomState, settings), /AI_KEY_MISSING/)
  await assert.rejects(searchKakao('부산 카페', settings), /KAKAO_KEY_MISSING/)
})

test('local test storage persists actual service records and server-only AI messages', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'travel-ai-test-'))
  try {
    const file = join(directory, 'rooms.json')
    const service = createRoomService(await createFileStore(file))
    const actor = { userId: 'local-test' }
    const roomId = randomUUID()
    await service.execute('createRoom', { input: { name: '테스트', destination: '부산',
      startDate: '2026-10-01', endDate: '2026-10-01', displayName: 'A', requestId: roomId } }, actor)
    const requestId = randomUUID()
    await service.appendAssistantMessage(roomId, '검증용 AI 응답', actor, requestId)
    await service.appendAssistantMessage(roomId, '검증용 AI 응답', actor, requestId)
    const restored = createRoomService(await createFileStore(file))
    const state = await restored.execute('getRoomState', { roomId }, actor) as RoomState
    assert.equal(state.messages.length, 1)
    assert.equal(state.messages[0].type, 'ai')
    await assert.rejects(restored.appendAssistantMessage(roomId, '위조', { userId: 'outsider' }, randomUUID()), /FORBIDDEN/)
  } finally {
    const insideTemp = relative(tmpdir(), directory)
    assert.ok(insideTemp.startsWith('travel-ai-test-') && !insideTemp.includes('..') && !isAbsolute(insideTemp))
    await rm(directory, { recursive: true })
  }
})
