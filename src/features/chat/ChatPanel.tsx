import { useEffect, useMemo, useRef, useState } from 'react'
import type { RoomState } from '../../lib/backend'
import { isAiCommand, stripAiTrigger, useRoomChat } from './useRoomChat'
import type { ChatMessage } from './types'

interface ChatPanelProps {
  roomId: string
  /** 현재 로그인 사용자 ID(내 메시지 정렬용). 없으면 정렬만 생략. */
  currentUserId?: string
  /** 배포 전 예시 모드용 상태. 넘기면 서버 구독 없이 이 데이터로 렌더한다. */
  exampleState?: RoomState
  selectedTimeBlockId?: string
}

const TIME_ZONE = 'Asia/Seoul'
const timeFormatter = new Intl.DateTimeFormat('ko-KR', {
  timeZone: TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
})

export function ChatPanel({ roomId, currentUserId, exampleState, selectedTimeBlockId }: ChatPanelProps) {
  const { state, messages, error, sending, aiBusy, sendUserMessage, askAi } = useRoomChat({
    roomId,
    initialState: exampleState,
    live: !exampleState,
    currentUserId,
    selectedTimeBlockId,
  })
  const [draft, setDraft] = useState('')
  const listRef = useRef<HTMLUListElement>(null)

  const displayNames = useMemo(() => {
    const map = new Map<string, string>()
    for (const member of state?.members ?? []) map.set(member.userId, member.displayName)
    return map
  }, [state?.members])

  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages.length])

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const content = draft.trim()
    if (!content || sending || aiBusy) return
    setDraft('')
    if (isAiCommand(content)) {
      await askAi(stripAiTrigger(content))
    } else {
      await sendUserMessage(content)
    }
  }

  async function handleAiButton() {
    const content = stripAiTrigger(draft).trim()
    if (!content || sending || aiBusy) return
    setDraft('')
    await askAi(content)
  }

  return (
    <section className="chat-panel" aria-label="공동 채팅">
      <header className="chat-panel__header">
        <h2>채팅</h2>
        <p className="chat-panel__hint">
          앞에 <code>@ai</code>를 붙이거나 <b>AI에게</b> 버튼으로 여행 도우미를 부를 수 있어요.
        </p>
      </header>

      <ul className="chat-panel__messages" ref={listRef} aria-live="polite">
        {messages.map(message => (
          <MessageBubble
            key={message.id}
            message={message}
            mine={Boolean(currentUserId) && message.userId === currentUserId}
            displayName={displayNames.get(message.userId)}
          />
        ))}
        {aiBusy && (
          <li className="chat-msg chat-msg--ai">
            <span className="chat-msg__author">AI</span>
            <span className="chat-msg__body">추천을 준비하고 있어요…</span>
          </li>
        )}
      </ul>

      {error && <p className="chat-panel__error" role="alert">{error}</p>}

      <form className="chat-panel__form" onSubmit={handleSubmit}>
        <label className="sr-only" htmlFor="chat-input">메시지 입력</label>
        <textarea
          id="chat-input"
          className="chat-panel__input"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void handleSubmit(e)
            }
          }}
          placeholder="메시지를 입력하세요. 예: @ai 점심 타임블록에 부산 맛집 추천해줘"
          rows={2}
          maxLength={4000}
          disabled={sending || aiBusy}
        />
        <div className="chat-panel__actions">
          <button type="button" onClick={handleAiButton} disabled={sending || aiBusy || !draft.trim()}>
            AI에게
          </button>
          <button type="submit" disabled={sending || aiBusy || !draft.trim()}>
            보내기
          </button>
        </div>
      </form>
    </section>
  )
}

interface MessageBubbleProps {
  message: ChatMessage
  mine: boolean
  displayName?: string
}

function MessageBubble({ message, mine, displayName }: MessageBubbleProps) {
  const author =
    message.type === 'ai' ? 'AI' : message.type === 'system' ? '안내' : displayName ?? '참여자'
  const className = [
    'chat-msg',
    `chat-msg--${message.type}`,
    mine ? 'chat-msg--mine' : '',
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <li className={className}>
      <span className="chat-msg__author">{author}</span>
      <span className="chat-msg__body">{message.content}</span>
      <time className="chat-msg__time" dateTime={message.createdAt}>
        {formatTime(message.createdAt)}
      </time>
    </li>
  )
}

function formatTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return timeFormatter.format(date)
}
