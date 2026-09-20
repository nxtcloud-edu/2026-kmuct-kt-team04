import type { Pin } from '../../lib/backend'
import { localRequest } from '../../lib/local-api'
import { askChatGpt } from './chatgpt'
import type { AiRoomContext } from './types'

export interface PlannedPin { title: string; timeBlockId: string }
export interface AiRunResult {
  reply: string; createdPins: Pin[]; plannedPins: PlannedPin[]; notes: string[]; persisted?: boolean
}
export interface RunAiOptions { createPins?: boolean }

/** Secret-bearing AI/search calls and pin writes run together on the server. */
export async function runAiRequest(roomId: string, userMessage: string, context: AiRoomContext,
  options: RunAiOptions = {}): Promise<AiRunResult> {
  if (options.createPins === false) {
    const plan = await askChatGpt(userMessage, context)
    return { reply: [plan.reply, plan.clarifyingQuestion].filter(Boolean).join('\n\n'),
      createdPins: [], plannedPins: plan.pinSuggestions, notes: [], persisted: false }
  }
  return localRequest('/api/ai/run', { roomId, userMessage,
    selectedTimeBlockId: context.selectedTimeBlockId, requestId: crypto.randomUUID() })
}
