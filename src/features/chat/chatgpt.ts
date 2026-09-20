import type { AiPlan, AiRoomContext } from './types'

/**
 * ChatGPT(OpenAI Chat Completions) 호출.
 * 백엔드는 Bedrock/AI를 구현하지 않으므로 C가 프런트에서 직접 호출한다.
 * 구조화된 JSON을 강제해 pinSuggestions/clarifyingQuestion을 안정적으로 파싱한다.
 */
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions'
const MODEL = 'gpt-4o-mini'

function apiKey(): string {
  const key = import.meta.env.VITE_OPENAI_API_KEY
  if (!key) {
    throw new Error(
      'OPENAI_KEY_MISSING: VITE_OPENAI_API_KEY 환경변수가 없습니다. .env.local에 OpenAI 키를 설정하세요.',
    )
  }
  return key
}

const SYSTEM_PROMPT = `당신은 공동 여행 계획 앱의 어시스턴트입니다.
사용자의 여행지와 타임블록(시간대별 일정) 목록을 참고해 장소를 추천합니다.

규칙:
- 반드시 아래 JSON 스키마로만 답합니다. 다른 텍스트를 덧붙이지 않습니다.
- "reply"에는 한국어로 사용자에게 보여줄 답변을 담습니다.
- 사용자가 특정 타임블록에 장소를 추가해 달라고 명시했을 때만 "pinSuggestions"에 항목을 넣습니다.
  일반적인 추천만 요청하면 pinSuggestions는 빈 배열로 두고 "reply"로만 설명합니다.
- 각 pinSuggestion의 "timeBlockId"는 제공된 타임블록 목록의 실제 id 중에서만 고릅니다. 새 id를 만들지 않습니다.
- 대상 타임블록이 불명확하거나, 같은 이름의 타임블록이 여러 개라 어디에 넣을지 모호하면
  pinSuggestions를 비우고 "clarifyingQuestion"에 되물을 질문을 담습니다.
- 확정(confirmed)/후보(candidate) 상태나 방문 순서를 임의로 바꾸지 않습니다.
- "query"는 카카오 지도 검색에 쓸 구체적인 장소 질의어입니다(예: "부산 광안리 해수욕장").

JSON 스키마:
{
  "reply": string,
  "pinSuggestions": [
    { "query": string, "title": string, "timeBlockId": string, "description"?: string, "category"?: string }
  ],
  "clarifyingQuestion"?: string
}`

interface OpenAiChoice {
  message: { content: string }
}
interface OpenAiResponse {
  choices: OpenAiChoice[]
}

function buildContextMessage(context: AiRoomContext): string {
  const blocks = context.timeBlocks.map(tb => ({
    id: tb.id,
    title: tb.title,
    startTime: tb.startTime,
    endTime: tb.endTime,
    dayId: tb.dayId,
  }))
  return JSON.stringify({
    destination: context.destination,
    period: { startDate: context.startDate, endDate: context.endDate },
    timeBlocks: blocks,
    existingPinTitles: context.existingPins.map(p => p.title),
  })
}

export async function askChatGpt(userMessage: string, context: AiRoomContext): Promise<AiPlan> {
  const payload = {
    model: MODEL,
    temperature: 0.4,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'system', content: `현재 방 컨텍스트: ${buildContextMessage(context)}` },
      { role: 'user', content: userMessage },
    ],
  }

  let response: Response
  try {
    response = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey()}`,
      },
      body: JSON.stringify(payload),
    })
  } catch (cause) {
    throw new Error('OPENAI_NETWORK: ChatGPT 요청에 실패했습니다.', { cause })
  }
  if (!response.ok) {
    throw new Error(`OPENAI_HTTP_${response.status}: ChatGPT 응답이 실패했습니다.`)
  }

  const body = (await response.json()) as OpenAiResponse
  const content = body.choices[0]?.message?.content
  if (!content) throw new Error('OPENAI_EMPTY: ChatGPT 응답이 비어 있습니다.')
  return parsePlan(content)
}

function parsePlan(raw: string): AiPlan {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (cause) {
    throw new Error('OPENAI_PARSE: ChatGPT 응답을 해석하지 못했습니다.', { cause })
  }
  const obj = parsed as Partial<AiPlan>
  const reply = typeof obj.reply === 'string' ? obj.reply : ''
  const suggestions = Array.isArray(obj.pinSuggestions) ? obj.pinSuggestions : []
  return {
    reply: reply || '요청을 처리했습니다.',
    pinSuggestions: suggestions
      .filter(s => s && typeof s.query === 'string' && typeof s.timeBlockId === 'string')
      .map(s => ({
        query: s.query,
        title: (s.title || s.query).trim(),
        timeBlockId: s.timeBlockId,
        description: typeof s.description === 'string' ? s.description : undefined,
        category: typeof s.category === 'string' ? s.category : undefined,
      })),
    clarifyingQuestion:
      typeof obj.clarifyingQuestion === 'string' && obj.clarifyingQuestion.trim()
        ? obj.clarifyingQuestion.trim()
        : undefined,
  }
}
