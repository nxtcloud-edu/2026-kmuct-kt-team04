import { useEffect, useState } from 'react'
import { ChatPanel } from './features/chat/ChatPanel'
import { exampleRoomState } from '../shared/example-room-state'
import { getLocalStatus, watchRoom, type RoomState } from './lib/backend'
import { isLocalBackend } from './lib/local-api'

function App() {
  const [status, setStatus] = useState<Awaited<ReturnType<typeof getLocalStatus>> | null>(null)
  const [state, setState] = useState<RoomState | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!isLocalBackend) return
    let cancelled = false
    let watcher: ReturnType<typeof watchRoom> | undefined
    void getLocalStatus().then(value => {
      if (cancelled) return
      setStatus(value)
      watcher = watchRoom(value.roomId, setState, err => setError(String(err)))
    }).catch(err => { if (!cancelled) setError(String(err)) })
    return () => { cancelled = true; watcher?.unsubscribe() }
  }, [])
  if (isLocalBackend && !status) return <main><h1>공동 여행 계획</h1><p>{error || '연결 중…'}</p></main>
  const room = state?.room ?? exampleRoomState.room
  return (
    <main>
      <h1>공동 여행 계획</h1>
      <p>{room.name} · {room.destination}</p>
      {status && <p>로컬 연결 테스트 · AI와 장소 검색은 실제 API를 사용하며, 채팅과 핀은 이 컴퓨터에 저장됩니다.</p>}
      {error && <p role="alert">{error}</p>}
      <ChatPanel roomId={status?.roomId ?? exampleRoomState.room.id}
        currentUserId={status?.currentUserId ?? exampleRoomState.members[0]?.userId}
        exampleState={isLocalBackend ? undefined : exampleRoomState} />
      {isLocalBackend && <section aria-label="저장된 여행 장소">
        <h2>저장된 핀 ({state?.pins.length ?? 0})</h2>
        <p>테스트 타임블록: 1일차 해운대 산책 (10:00~12:00)</p>
        <ul>{state?.pins.map(pin => <li key={pin.id}><strong>{pin.title}</strong> — {pin.description}</li>)}</ul>
      </section>}
    </main>
  )
}
export default App
