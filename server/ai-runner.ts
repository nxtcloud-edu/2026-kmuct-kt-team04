import { createHash } from 'node:crypto'
import { createRoomService, publicError } from '../amplify/functions/room-service/service'
import type { Pin, RoomEvent, RoomState } from '../shared/contracts'
import { askGateway, UpstreamError, type AiConfig } from './ai-gateway'

export interface AiInput { roomId: string; userMessage: string; selectedTimeBlockId?: string; requestId: string }
// Stable per-step IDs make a retry unable to recreate already completed mutations.
function stepId(request: string, step: string) {
  const hex = createHash('sha256').update(`${request}:${step}`).digest('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}
export async function runAssistant(service: ReturnType<typeof createRoomService>, actor: { userId: string },
  input: AiInput, config: AiConfig, publish: (event: RoomEvent) => void) {
  const claim = await service.beginAssistantCommand(input.roomId, actor, input.requestId)
  if (!claim.started) {
    if (claim.result) return claim.result
    throw new UpstreamError('AI_REQUEST_IN_PROGRESS: 같은 요청을 처리 중입니다.')
  }
  const createdPins: Pin[] = [], deletedPins: Pin[] = [], updatedPins: Pin[] = []
  const notes: string[] = []
  let plan: Awaited<ReturnType<typeof askGateway>> = { reply: '', places: [], pinSuggestions: [], pinDeletions: [], pinUpdates: [] }
  const execute = async (operation: string, payload: unknown) => {
    const event = await service.execute(operation, { input: payload }, actor) as RoomEvent
    publish(event); return event.data as Pin
  }
  try {
    const state = await service.execute('getRoomState', { roomId: input.roomId }, actor) as RoomState
    plan = await askGateway(input.userMessage, state, config, input.selectedTimeBlockId)
    for (const deletion of plan.pinDeletions) {
      const pin = state.pins.find(p => p.id === deletion.pinId)!
      try {
        deletedPins.push(await execute('deletePin', { roomId: input.roomId, ...deletion,
          requestId: stepId(input.requestId, `delete:${pin.id}`) }))
      } catch (error) { notes.push(`“${pin.title}” 삭제 실패: ${publicError(error).message}`) }
    }
    for (const update of plan.pinUpdates) {
      const pin = state.pins.find(p => p.id === update.pinId)!
      try {
        updatedPins.push(await execute('updatePin', { roomId: input.roomId, pinId: pin.id,
          title: update.title ?? pin.title, description: update.description ?? pin.description,
          category: update.category ?? pin.category, status: pin.status,
          visitOrder: update.visitOrder ?? pin.visitOrder, expectedVersion: update.expectedVersion }))
      } catch (error) { notes.push(`“${pin.title}” 수정 실패: ${publicError(error).message}`) }
    }
    for (const suggestion of plan.pinSuggestions) {
      const place = suggestion.place
      try {
        // Recheck current room state in case another request saved this candidate during the model call.
        const latest = await service.execute('getRoomState', { roomId: input.roomId }, actor) as RoomState
        if (latest.pins.some(pin => pin.placeId === place.placeId && pin.timeBlockId === suggestion.timeBlockId)) {
          notes.push(`${place.name}: 이미 해당 타임블록에 있어 중복 저장하지 않았습니다.`); continue
        }
        createdPins.push(await execute('createPin', { roomId: input.roomId, timeBlockId: suggestion.timeBlockId,
          title: place.name, latitude: place.latitude, longitude: place.longitude,
          placeProvider: 'kakao', placeId: place.placeId, category: place.category.slice(0, 50),
          description: [place.reason, place.address, place.phone, place.url].filter(Boolean).join('\n').slice(0, 2000),
          status: 'candidate', requestId: stepId(input.requestId, `create:${place.placeId}:${suggestion.timeBlockId}`) }))
      } catch (error) { notes.push(`“${place.name}” 저장 실패: ${publicError(error).message}`) }
    }
  } catch (error) {
    plan.reply = `요청을 완료하지 못했어요. ${error instanceof UpstreamError ? error.message : publicError(error).message}`
  }
  if (createdPins.length) notes.push(`핀 ${createdPins.length}개 저장 완료: ${createdPins.map(p => p.title).join(', ')}`)
  if (deletedPins.length) notes.push(`핀 ${deletedPins.length}개와 연결 경로 삭제 완료: ${deletedPins.map(p => p.title).join(', ')}`)
  if (updatedPins.length) notes.push(`핀 ${updatedPins.length}개 수정 완료: ${updatedPins.map(p => p.title).join(', ')}`)
  // Mutation status is owned by the server, not by prose generated before the writes.
  if (plan.pinSuggestions.length) plan.reply = `요청하신 조건으로 찾은 ${plan.places.length}곳을 비교해 보세요. 실제 위치·업종과 추천 이유는 아래 카드에 정리했어요.`
  if (plan.pinDeletions.length) plan.reply = '핀 삭제 요청을 처리했습니다. 아래에서 실제 처리 결과를 확인해 주세요.'
  if (plan.pinUpdates.length) plan.reply = '핀 수정 요청을 처리했습니다. 아래에서 실제 처리 결과를 확인해 주세요.'
  const reply = [plan.reply, ...notes].filter(Boolean).join('\n\n').slice(0, 16000)
  publish(await service.appendAssistantMessage(input.roomId, reply, actor, input.requestId, plan.places))
  const result = { reply, notes, createdPins, deletedPins, updatedPins, plannedPins: plan.pinSuggestions, persisted: true, storage: 'shared-file' }
  await service.completeAssistantCommand(input.roomId, actor, input.requestId, result)
  return result
}
