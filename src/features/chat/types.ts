import type { Pin, RoomState, TimeBlock } from '../../lib/backend'

/** 카카오 로컬 검색 결과 한 건. AI 추천 핀 생성에 필요한 최소 필드만 담는다. */
export interface PlaceSearchResult {
  placeId: string
  name: string
  address: string
  category: string
  latitude: number
  longitude: number
  url?: string
}

/** ChatGPT가 반환하는 구조화된 계획. 우리가 프롬프트로 강제하는 JSON 스키마와 일치한다. */
export interface AiPlan {
  /** 사용자에게 보여줄 자연어 답변. */
  reply: string
  /**
   * AI가 제안하는 핀 후보들. 각 항목은 검색에 쓸 질의어와 대상 타임블록을 가진다.
   * 백엔드 계약상 좌표/placeId는 카카오 검색에서 확보하므로 여기서는 검색어만 받는다.
   */
  pinSuggestions: AiPinSuggestion[]
  /**
   * 대상이 불명확하거나 중복 이름 등으로 추가 확인이 필요할 때 채운다.
   * 값이 있으면 핀을 만들지 않고 사용자에게 되묻는다.
   */
  clarifyingQuestion?: string
}

export interface AiPinSuggestion {
  /** 카카오 검색에 사용할 질의어(예: "부산 광안리 해수욕장"). */
  query: string
  /** 핀 제목으로 쓸 이름. 보통 장소명. */
  title: string
  /** 이 핀을 붙일 타임블록 ID. AI가 명시된 후보 중에서 고른다. */
  timeBlockId: string
  /** 선택 이유 등 메모. */
  description?: string
  category?: string
}

/** 채팅 화면에서 다루는 메시지. 서버 저장 메시지와 로컬 전용 AI 메시지를 함께 표현한다. */
export interface ChatMessage {
  id: string
  userId: string
  content: string
  type: 'user' | 'ai' | 'system'
  createdAt: string
  /** 서버에 저장되지 않은 로컬 전용 메시지 여부(AI 응답 등). */
  local?: boolean
}

/** AI 오케스트레이션에 넘길 방 컨텍스트. */
export interface AiRoomContext {
  roomId: string
  selectedTimeBlockId?: string
  destination: string
  startDate: string
  endDate: string
  timeBlocks: TimeBlock[]
  existingPins: Pin[]
}

export function toAiRoomContext(state: RoomState): AiRoomContext {
  return {
    roomId: state.room.id,
    destination: state.room.destination,
    startDate: state.room.startDate,
    endDate: state.room.endDate,
    timeBlocks: state.timeBlocks,
    existingPins: state.pins,
  }
}
