import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { ChatPanel } from './features/chat/ChatPanel'
import TravelMapPanel from './features/travel-map/TravelMapPanel'
import { exampleRoomState } from '../shared/example-room-state'
import { getLocalStatus, watchRoom, type RoomState } from './lib/backend'
import { isLocalBackend } from './lib/local-api'

function App() {
  const [status, setStatus] = useState<Awaited<ReturnType<typeof getLocalStatus>> | null>(null)
  const [state, setState] = useState<RoomState | null>(null)
  const [error, setError] = useState('')
  // 지도에서 선택한 타임블록을 채팅(AI 작업 대상)과 공유합니다.
  const [selectedTimeBlockId, setSelectedTimeBlockId] = useState<string | null>(null)
  // 채팅은 오른쪽 하단 플로팅 버블. 클릭하면 채팅창이 열립니다. (이미지 레이아웃 기준)
  const [chatOpen, setChatOpen] = useState(false)

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

  if (isLocalBackend && !status) {
    return <main style={{ padding: '2rem' }}><h1>공동 여행 계획</h1><p>{error || '연결 중…'}</p></main>
  }

  const roomId = status?.roomId ?? exampleRoomState.room.id
  const currentUserId = status?.currentUserId ?? exampleRoomState.members[0]?.userId

  return (
    // 지도가 메인 배경(전체 화면). 일정은 지도 왼쪽 오버레이(TravelMapPanel 내부), 채팅은 오른쪽 하단 플로팅.
    <div style={appShell}>
      <TravelMapPanel roomId={status?.roomId} onSelectedTimeBlockChange={setSelectedTimeBlockId} />

      {/* 오른쪽 하단 채팅 플로팅 (C의 ChatPanel). 내부 구현은 건드리지 않고 위치/토글만 감쌉니다. */}
      {chatOpen ? (
        <aside style={chatWindow}>
          <div style={chatHeader}>
            <span>
              채팅 · AI
              {isLocalBackend && state && (
                <span style={{ marginLeft: '0.5rem', fontWeight: 400, fontSize: '0.8rem', color: '#64748b' }}>
                  저장된 핀 {state.pins.length}개
                </span>
              )}
            </span>
            <button onClick={() => setChatOpen(false)} style={chatCloseBtn} aria-label="채팅 닫기">×</button>
          </div>
          <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
            <ChatPanel
              roomId={roomId}
              currentUserId={currentUserId}
              exampleState={isLocalBackend ? undefined : exampleRoomState}
              selectedTimeBlockId={selectedTimeBlockId ?? undefined}
            />
          </div>
        </aside>
      ) : (
        <button onClick={() => setChatOpen(true)} style={chatBubble} aria-label="채팅 열기">
          💬
        </button>
      )}

      {error && <div style={errorToast} role="alert">{error}</div>}
    </div>
  )
}

const appShell: CSSProperties = {
  position: 'fixed', inset: 0, overflow: 'hidden',
}
const chatWindow: CSSProperties = {
  position: 'absolute', right: '1rem', bottom: '1rem', zIndex: 20,
  width: 360, maxWidth: '85vw', height: 'min(70vh, 560px)',
  display: 'flex', flexDirection: 'column',
  background: 'rgba(255,255,255,0.98)', borderRadius: 16,
  boxShadow: '0 12px 40px rgba(15,23,42,0.22)', overflow: 'hidden',
}
const chatHeader: CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: '0.6rem 0.9rem', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', fontWeight: 700,
}
const chatCloseBtn: CSSProperties = {
  border: 'none', background: 'none', fontSize: '1.4rem', lineHeight: 1, cursor: 'pointer', color: '#64748b',
}
const chatBubble: CSSProperties = {
  position: 'absolute', right: '1rem', bottom: '1rem', zIndex: 20,
  width: 56, height: 56, borderRadius: '50%', border: 'none', cursor: 'pointer',
  background: '#2563eb', color: '#fff', fontSize: '1.5rem',
  boxShadow: '0 8px 24px rgba(37,99,235,0.4)',
}
const errorToast: CSSProperties = {
  position: 'absolute', bottom: '1rem', left: '50%', transform: 'translateX(-50%)', zIndex: 30,
  padding: '0.5rem 1rem', background: '#fee2e2', color: '#991b1b', borderRadius: 8, border: '1px solid #fecaca', fontSize: '0.85rem',
}

export default App
