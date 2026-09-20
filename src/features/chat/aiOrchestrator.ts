import { roomApi } from '../../lib/backend'
import type { Pin, TimeBlock } from '../../lib/backend'
import { askChatGpt } from './chatgpt'
import { searchFirstPlace } from './kakaoSearch'
import type { AiPinSuggestion, AiRoomContext, PlaceSearchResult } from './types'

/** AI 요청 처리 결과. 화면은 이 값으로 시스템/AI 메시지를 만든다. */
export interface AiRunResult {
  /** 사용자에게 보여줄 AI 답변 텍스트. */
  reply: string
  /** 실제로 생성된 핀들. */
  createdPins: Pin[]
  /** 유효성 검사를 통과해 생성 대상이 된(또는 될) 핀 계획. 미리보기 표시에 쓴다. */
  plannedPins: PlannedPin[]
  /** 처리 과정 요약(성공/건너뜀/질문). 시스템 메시지로 노출한다. */
  notes: string[]
}

export interface PlannedPin {
  title: string
  timeBlockId: string
}

export interface RunAiOptions {
  /** true면 카카오 검색 후 실제 createPin을 호출한다. 예시 모드에서는 false. */
  createPins?: boolean
}

/**
 * 사용자 메시지를 받아 ChatGPT로 계획을 얻고, 필요한 경우 카카오 검색으로
 * 실제 좌표/placeId를 확보한 뒤 지정된 타임블록에 핀을 생성한다.
 *
 * 계약 준수:
 * - AI가 만든 timeBlockId가 실제 방 타임블록에 없으면 생성하지 않고 건너뛴다.
 * - clarifyingQuestion이 있으면 핀을 만들지 않고 되묻는다.
 * - 카카오 결과가 없으면 placeId를 확보하지 못하므로 생성하지 않는다.
 * - status는 항상 기본값(candidate). AI가 confirmed로 임의 변경하지 않는다.
 */
export async function runAiRequest(
  roomId: string,
  userMessage: string,
  context: AiRoomContext,
  options: RunAiOptions = {},
): Promise<AiRunResult> {
  const createPins = options.createPins ?? true
  const plan = await askChatGpt(userMessage, context)
  const notes: string[] = []

  // 되물어야 하는 경우: 핀을 만들지 않는다.
  if (plan.clarifyingQuestion) {
    return {
      reply: plan.reply ? `${plan.reply}\n\n${plan.clarifyingQuestion}` : plan.clarifyingQuestion,
      createdPins: [],
      plannedPins: [],
      notes: ['대상이 명확하지 않아 핀을 만들지 않고 확인을 요청했습니다.'],
    }
  }

  const validBlocks = new Map(context.timeBlocks.map(tb => [tb.id, tb]))
  const createdPins: Pin[] = []
  const plannedPins: PlannedPin[] = []

  for (const suggestion of plan.pinSuggestions) {
    const block = validBlocks.get(suggestion.timeBlockId)
    if (!block) {
      notes.push(`"${suggestion.title}"의 대상 타임블록을 찾지 못해 건너뛰었습니다.`)
      continue
    }
    // 같은 타임블록에 같은 이름의 핀이 이미 있으면 중복 생성하지 않는다.
    const duplicate = context.existingPins.some(
      p => p.timeBlockId === block.id && p.title.trim() === suggestion.title.trim(),
    )
    if (duplicate) {
      notes.push(`"${suggestion.title}"은(는) 이미 "${block.title}"에 있어 건너뛰었습니다.`)
      continue
    }

    plannedPins.push({ title: suggestion.title.trim(), timeBlockId: block.id })

    // 예시(미리보기) 모드에서는 서버 호출 없이 계획만 남긴다.
    if (!createPins) continue

    const outcome = await createPinOnServer(roomId, suggestion, block)
    if (outcome.pin) createdPins.push(outcome.pin)
    if (outcome.note) notes.push(outcome.note)
  }

  return { reply: plan.reply, createdPins, plannedPins, notes }
}

interface PinOutcome {
  pin?: Pin
  note?: string
}

/** 카카오에서 실제 좌표/placeId를 확보하고 서버에 핀을 만든다. 검색 실패/무결과면 생성하지 않는다. */
async function createPinOnServer(
  roomId: string,
  suggestion: AiPinSuggestion,
  block: TimeBlock,
): Promise<PinOutcome> {
  let place: PlaceSearchResult | null
  try {
    place = await searchFirstPlace(suggestion.query)
  } catch (error) {
    return { note: `"${suggestion.title}" 장소 검색에 실패했습니다: ${errorText(error)}` }
  }
  if (!place) {
    return { note: `"${suggestion.query}" 검색 결과가 없어 "${suggestion.title}" 핀을 만들지 않았습니다.` }
  }

  try {
    const event = await roomApi.createPin({
      roomId,
      timeBlockId: block.id,
      title: suggestion.title.slice(0, 100),
      latitude: place.latitude,
      longitude: place.longitude,
      placeProvider: 'kakao',
      placeId: place.placeId,
      description: (suggestion.description ?? place.address ?? '').slice(0, 2000),
      category: (suggestion.category ?? place.category ?? '').slice(0, 50),
      // status는 지정하지 않는다 → 서버 기본값 candidate. AI가 확정하지 않는다.
      requestId: crypto.randomUUID(),
    })
    return {
      pin: event.data as Pin,
      note: `"${block.title}"에 "${suggestion.title}" 핀을 추가했습니다.`,
    }
  } catch (error) {
    return { note: `"${suggestion.title}" 핀 생성에 실패했습니다: ${errorText(error)}` }
  }
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
