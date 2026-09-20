// Explicit opt-in integration check. Uses real API credits, only disposable local room records.
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { randomUUID } from 'node:crypto'
import { loadEnv } from 'vite'
import { createRoomService } from '../amplify/functions/room-service/service'
import { createFileStore } from '../server/file-store'
import { runAssistant } from '../server/ai-runner'
import type { RoomState, RoomEvent } from '../shared/contracts'

const env = loadEnv('development', process.cwd(), '')
const config = { apiKey: env.API_KEY, kakaoKey: env.KAKAO_REST_API_KEY,
  baseUrl: env.AI_BASE_URL, model: env.AI_MODEL }
if (!config.apiKey || !config.kakaoKey) throw new Error('Both server API keys are required.')
const directory = await mkdtemp(join(tmpdir(), 'travel-live-ai-'))
try {
  const service = createRoomService(await createFileStore(join(directory, 'rooms.json')))
  const actor = { userId: 'verification-user' }, roomId = randomUUID()
  const call = (operation: string, input: object) => service.execute(operation, { input: { roomId, ...input } }, actor)
  await service.execute('createRoom', { input: { name: '격리된 검증용 여행', destination: '부산',
    startDate: '2026-10-01', endDate: '2026-10-02', displayName: '검증 사용자', requestId: roomId } }, actor)
  const state = () => service.execute('getRoomState', { roomId }, actor) as Promise<RoomState>
  const block = await call('createTimeBlock', { dayId: (await state()).days[0].id, title: '해운대 점심',
    startTime: '12:00', endTime: '13:00', requestId: randomUUID() }) as RoomEvent
  async function ask(question: string) {
    await call('sendMessage', { content: question, requestId: randomUUID() })
    await runAssistant(service, actor, { roomId, userMessage: question, requestId: randomUUID() }, config, () => {})
    const next = await state()
    const last = next.messages.filter(m => m.type === 'ai').at(-1)!
    console.log(JSON.stringify({ question, reply: last.content, places: last.places?.map(p => ({ name: p.name, address: p.address, reason: p.reason })), pinCount: next.pins.length }))
    return { next, last }
  }
  const recommendation = await ask('부산역 근처 카페 3개만 추천해줄래?')
  assert.equal(recommendation.last.places?.length, 3); assert.equal(recommendation.next.pins.length, 0)
  const creation = await ask('첫날 해운대 점심 블록에 식당을 3개정도 찾아서 핀으로 추가해줘.')
  assert.equal(creation.next.pins.length, 3)
  assert.ok(creation.next.pins.every(p => p.timeBlockId === block.entityId))
  const pin = creation.next.pins[0]
  const edit = await ask(`${pin.title} 핀의 메모를 '팀원과 메뉴 확인 필요'로 수정해줘.`)
  assert.match(edit.next.pins.find(p => p.id === pin.id)!.description, /팀원과 메뉴 확인 필요/)
  const summary = await ask('지금까지 채팅에서 정한 내용과 아직 결정하지 않은 내용을 요약해줘. 장소를 새로 추천하지는 마.')
  assert.equal(summary.next.pins.length, 3); assert.equal(summary.last.places?.length, 0)
  const elsewhere = await ask('이번엔 서울역 근처 카페 2곳만 추천해줘. 핀은 추가하지 마.')
  assert.equal(elsewhere.last.places?.length, 2)
  assert.ok(elsewhere.last.places?.every(p => p.address.includes('서울')))
  const deletion = await ask('해운대 점심 타임블록에 있는 모든 핀을 삭제해줄래')
  assert.equal(deletion.next.pins.length, 0); assert.equal(deletion.next.timeBlocks.length, 1)
  console.log('LIVE_AI_VERIFICATION_PASSED')
} finally {
  assert.ok(relative(tmpdir(), directory).startsWith('travel-live-ai-'))
  await rm(directory, { recursive: true })
}
