import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { roomApi, watchRoom } from '../../lib/backend'
import type { RoomState } from '../../lib/backend'
import { runAiRequest } from './aiOrchestrator'
import { toAiRoomContext } from './types'
import type { ChatMessage } from './types'

const AI_TRIGGER = /^\s*(@ai|\/ai)\s+/i

interface UseRoomChatOptions {
  roomId: string
  /** 배포 전 화면 개발용 예시 상태. 넘기면 watchRoom 대신 이 값을 쓴다. */
  initialState?: RoomState
  /** watchRoom을 붙일지 여부. 예시 모드에서는 false. */
  live?: boolean
  /** 예시 모드에서 내가 보낸 로컬 메시지의 작성자 ID로 쓴다. */
  currentUserId?: string
  selectedTimeBlockId?: string
}

interface UseRoomChat {
  state: RoomState | null
  messages: ChatMessage[]
  error: string | null
  sending: boolean
  aiBusy: boolean
  /** 일반 사용자 메시지를 서버에 저장한다. */
  sendUserMessage: (content: string) => Promise<void>
  /** AI에게 요청한다. 사용자 메시지를 저장한 뒤 ChatGPT를 호출한다. */
  askAi: (content: string) => Promise<void>
}

/** 메시지 앞의 @ai / /ai 트리거를 벗겨 실제 요청 내용만 남긴다. */
export function stripAiTrigger(content: string): string {
  return content.replace(AI_TRIGGER, '').trim()
}

export function isAiCommand(content: string): boolean {
  return AI_TRIGGER.test(content)
}

export function useRoomChat({
  roomId,
  initialState,
  live = true,
  currentUserId,
  selectedTimeBlockId,
}: UseRoomChatOptions): UseRoomChat {
  const [state, setState] = useState<RoomState | null>(initialState ?? null)
  const [localMessages, setLocalMessages] = useState<ChatMessage[]>([])
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [aiBusy, setAiBusy] = useState(false)
  const watcherRef = useRef<ReturnType<typeof watchRoom> | null>(null)

  useEffect(() => {
    if (!live) return
    const watcher = watchRoom(
      roomId,
      next => {
        setState(next)
        setError(null)
      },
      err => setError(errorText(err)),
    )
    watcherRef.current = watcher
    return () => {
      watcher.unsubscribe()
      watcherRef.current = null
    }
  }, [roomId, live])

  const refresh = useCallback(async () => {
    if (watcherRef.current) {
      await watcherRef.current.refresh()
    } else if (live) {
      setState(await roomApi.getRoomState(roomId))
    }
  }, [roomId, live])

  const addLocal = useCallback((message: ChatMessage) => {
    setLocalMessages(prev => [...prev, message])
  }, [])

  const sendUserMessage = useCallback(
    async (content: string) => {
      const trimmed = content.trim()
      if (!trimmed) return
      const capped = trimmed.slice(0, 4000)
      // 예시 모드: 서버가 없으므로 로컬 메시지로만 표시한다.
      if (!live) {
        addLocal(userMessage(capped, currentUserId))
        return
      }
      setSending(true)
      setError(null)
      try {
        await roomApi.sendMessage({ roomId, content: capped, requestId: crypto.randomUUID() })
        await refresh()
      } catch (err) {
        setError(errorText(err))
        throw err
      } finally {
        setSending(false)
      }
    },
    [roomId, refresh, live, addLocal, currentUserId],
  )

  const askAi = useCallback(
    async (content: string) => {
      const question = content.trim()
      if (!question) return
      // 요청 자체는 일반 사용자 메시지로 저장(계약: 서버는 user만 저장).
      try {
        await sendUserMessage(question)
      } catch {
        return
      }
      if (!state) {
        setError('AI 요청을 처리할 방 상태가 아직 준비되지 않았습니다.')
        return
      }
      setAiBusy(true)
      try {
        // 예시 모드: 서버 핀 생성 없이 ChatGPT 답변만 미리보기로 보여준다.
        const result = await runAiRequest(roomId, question,
          { ...toAiRoomContext(state), selectedTimeBlockId }, { createPins: live })
        if (!result.persisted) {
          addLocal(aiMessage(result.reply))
          for (const note of result.notes) addLocal(systemMessage(note))
        }
        if (!live && result.plannedPins.length > 0) {
          const summary = result.plannedPins
            .map(p => `· "${p.title}" → ${blockTitle(state, p.timeBlockId)}`)
            .join('\n')
          addLocal(systemMessage(`배포 전 미리보기입니다. AWS 연결 후 아래 핀이 실제로 추가됩니다:\n${summary}`))
        }
        if (result.persisted || result.createdPins.length > 0) await refresh()
      } catch (err) {
        addLocal(systemMessage(`AI 처리 중 오류가 발생했습니다: ${errorText(err)}`))
      } finally {
        setAiBusy(false)
      }
    },
    [roomId, state, sendUserMessage, addLocal, refresh, live, selectedTimeBlockId],
  )

  const messages = useMemo<ChatMessage[]>(() => {
    const server: ChatMessage[] = (state?.messages ?? []).map(m => ({
      id: m.id,
      userId: m.userId,
      content: m.content,
      places: m.places,
      type: m.type,
      createdAt: m.createdAt,
    }))
    return [...server, ...localMessages].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }, [state?.messages, localMessages])

  return { state, messages, error, sending, aiBusy, sendUserMessage, askAi }
}

function blockTitle(state: RoomState, timeBlockId: string): string {
  return state.timeBlocks.find(tb => tb.id === timeBlockId)?.title ?? '지정 타임블록'
}

let localSeq = 0
function userMessage(content: string, userId?: string): ChatMessage {
  return {
    id: `local-user-${Date.now()}-${localSeq++}`,
    userId: userId ?? 'me',
    content,
    type: 'user',
    createdAt: new Date().toISOString(),
    local: true,
  }
}
function aiMessage(content: string): ChatMessage {
  return {
    id: `local-ai-${Date.now()}-${localSeq++}`,
    userId: 'assistant',
    content,
    type: 'ai',
    createdAt: new Date().toISOString(),
    local: true,
  }
}
function systemMessage(content: string): ChatMessage {
  return {
    id: `local-sys-${Date.now()}-${localSeq++}`,
    userId: 'system',
    content,
    type: 'system',
    createdAt: new Date().toISOString(),
    local: true,
  }
}
function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
