import type { Pin, RoomState, TimeBlock } from '../../lib/backend'

export interface PlaceSearchResult {
  placeId: string
  name: string
  address: string
  category: string
  latitude: number
  longitude: number
  url?: string
}

export interface AiPlan {
  reply: string
  pinSuggestions: AiPinSuggestion[]
  pinDeletions: AiPinDeletion[]
  clarifyingQuestion?: string
}

export interface AiPinSuggestion {
  query: string
  title: string
  timeBlockId: string
  description?: string
  category?: string
}

export interface AiPinDeletion { pinId: string }

export interface ChatMessage {
  id: string
  userId: string
  content: string
  type: 'user' | 'ai' | 'system'
  createdAt: string
  local?: boolean
}

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
