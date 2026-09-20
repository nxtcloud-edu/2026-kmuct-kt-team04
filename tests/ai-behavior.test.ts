import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { askGateway, resolvePinDeletion, resolvePinTarget } from '../server/ai-gateway'
import { exampleRoomState } from '../shared/example-room-state'
import { pinOrderIndex } from '../src/features/travel-map/lib/pinOrder'

const config = { apiKey: 'test-only', kakaoKey: 'test-only', baseUrl: 'https://ai.example.test/v1', model: 'test' }
test('delete-all understands 해줄래 and never uses another selected block or ambiguous title', async () => {
  const state = structuredClone(exampleRoomState)
  const block = state.timeBlocks[0]
  state.pins = [1, 2].map(n => ({ ...state.pins[0], id: randomUUID(), title: `핀 ${n}`, timeBlockId: block.id }))
  const plan = await askGateway(`${block.title} 타임블록에 있는 모든 핀을 삭제해줄래`, state, config, state.timeBlocks[1]?.id)
  assert.equal(plan.pinDeletions.length, 2); assert.equal(plan.pinSuggestions.length, 0)
  assert.equal(resolvePinDeletion('모든 핀을 삭제하는 방법 알려줘', state).wantsDeletion, false)
  assert.equal(resolvePinDeletion(`${block.title} 핀 삭제하지 말고 요약해줘`, state).wantsDeletion, false)
  state.timeBlocks.push({ ...block, id: randomUUID(), dayId: state.days[1].id })
  assert.equal(resolvePinDeletion(`${block.title} 모든 핀 삭제해줘`, state).candidates.length, 0)
  assert.equal(resolvePinTarget(`첫날 ${block.title}에 핀 3개 추가해줘`, state).targetId, block.id)
  state.pins.forEach(p => { p.visitOrder = 1 })
  const orders = pinOrderIndex(state.timeBlocks, state.pins)
  assert.deepEqual(state.pins.map(p => orders[p.id]), [1, 1])
})

test('recommendations search without writing, fill requested count using fallback, and carry recent context', async t => {
  const seen: Array<{ url: string; body?: Record<string, unknown> }> = []
  let aiCalls = 0
  t.mock.method(globalThis, 'fetch', async (url: string | URL, init?: RequestInit) => {
    const address = String(url)
    seen.push({ url: address, body: init?.body ? JSON.parse(String(init.body)) : undefined })
    if (address.includes('ai.example')) {
      aiCalls++
      const content = aiCalls === 1 ? { action: 'search', count: 1, queries: [{ query: '서울역 카페 특이한조건', fallbackQuery: '서울역 카페' }] }
        : { reply: '서울역 주변 실제 카페 3곳입니다.', reasons: [1, 2, 3].map(i => ({ placeId: String(i), reason: '서울역 주변 카페 업종에 해당하는 후보입니다.' })) }
      return Response.json({ choices: [{ message: { content: JSON.stringify(content) } }] })
    }
    const isFallback = new URL(address).searchParams.get('query') === '서울역 카페'
    return Response.json({ documents: (isFallback ? [1, 2, 3] : []).map(i => ({ id: String(i), place_name: `실제후보${i}`, x: '126.97', y: '37.55', road_address_name: '서울 중구', address_name: '', category_name: '카페', phone: '02-000-0000' })) })
  })
  const plan = await askGateway('서울역 근처 카페 3개만 추천해줄래?', exampleRoomState, config)
  assert.equal(plan.places.length, 3); assert.equal(plan.pinSuggestions.length, 0)
  assert.ok(plan.places.every(p => p.reason && p.url.startsWith('https://place.map.kakao.com/')))
  const messages = seen[0].body!.messages as Array<{ content: string }>
  const sent = JSON.parse(messages[1].content)
  assert.equal(sent.context.pins.length, exampleRoomState.pins.length)
  assert.equal(sent.context.recentMessages.length, exampleRoomState.messages.length)
  assert.equal(seen.filter(s => s.url.includes('dapi.kakao')).length, 2)
})

test('summary and casual conversation never search or create pins; updates cannot escape allowed pin IDs', async t => {
  const urls: string[] = []
  let update = false
  t.mock.method(globalThis, 'fetch', async (url: string | URL) => {
    urls.push(String(url))
    const content = update ? { action: 'update', updates: [{ pinId: randomUUID(), description: 'unauthorized' }] }
      : { action: 'chat', reply: '합의된 일정과 남은 결정을 정리했어요.' }
    return Response.json({ choices: [{ message: { content: JSON.stringify(content) } }] })
  })
  const plan = await askGateway('지금까지 논의한 일정 요약해줘', exampleRoomState, config)
  assert.equal(plan.places.length, 0); assert.equal(plan.pinSuggestions.length, 0)
  assert.equal(urls.length, 1)
  update = true
  const result = await askGateway(`${exampleRoomState.pins[0].title} 핀의 메모를 조용한 자리로 수정해줘`, exampleRoomState, config)
  assert.equal(result.pinUpdates.length, 0)
})
