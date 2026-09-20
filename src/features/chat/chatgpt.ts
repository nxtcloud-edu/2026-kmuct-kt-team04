import { localRequest } from '../../lib/local-api'
import type { AiPlan, AiRoomContext } from './types'

/** Browser never receives API credentials. The server selects the competition model. */
export function askChatGpt(userMessage: string, context: AiRoomContext): Promise<AiPlan> {
  return localRequest('/api/ai/plan', { roomId: context.roomId, userMessage,
    selectedTimeBlockId: context.selectedTimeBlockId, requestId: crypto.randomUUID() })
}
