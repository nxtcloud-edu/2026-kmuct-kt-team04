import { useEffect, useState } from 'react'
import { bootstrapBackend } from './lib/bootstrap'
import type { Room } from './lib/backend'
import { useAuth } from './features/auth/useAuth'
import { AuthScreen } from './features/auth/AuthScreen'
import { RoomsScreen } from './features/rooms/RoomsScreen'
import { ChatPanel } from './features/chat/ChatPanel'
import { exampleRoomState } from '../shared/example-room-state'

type BootState = 'loading' | 'ready' | 'not-deployed'

function App() {
  const [boot, setBoot] = useState<BootState>('loading')

  useEffect(() => {
    let active = true
    bootstrapBackend()
      .then(ok => {
        if (active) setBoot(ok ? 'ready' : 'not-deployed')
      })
      .catch(() => {
        if (active) setBoot('not-deployed')
      })
    return () => {
      active = false
    }
  }, [])

  if (boot === 'loading') {
    return (
      <main>
        <p>준비 중…</p>
      </main>
    )
  }

  // 배포 전: 백엔드가 없으므로 예시 데이터로 채팅·AI 화면을 미리 본다.
  if (boot === 'not-deployed') {
    return <PreviewApp />
  }

  return <LiveApp />
}

/** AWS 연결된 실제 앱. 로그인 → 방 목록 → 방 입장. */
function LiveApp() {
  const { loading, user, refresh, signOutUser } = useAuth()
  const [room, setRoom] = useState<Room | null>(null)

  if (loading) {
    return (
      <main>
        <p>세션 확인 중…</p>
      </main>
    )
  }

  if (!user) {
    return (
      <main>
        <AuthScreen onAuthenticated={refresh} />
      </main>
    )
  }

  return (
    <main>
      <header className="app-bar">
        <h1>공동 여행 계획</h1>
        <div className="app-bar__actions">
          <span className="app-bar__user">{user.username}</span>
          <button type="button" onClick={() => void signOutUser()}>로그아웃</button>
        </div>
      </header>

      {room ? (
        <>
          <button type="button" className="app-back" onClick={() => setRoom(null)}>← 방 목록으로</button>
          <p className="app-room-title">{room.name} · {room.destination}</p>
          <ChatPanel roomId={room.id} currentUserId={user.userId} />
        </>
      ) : (
        <RoomsScreen onEnterRoom={setRoom} />
      )}
    </main>
  )
}

/** 배포 전 미리보기: 예시 데이터로 채팅·AI 화면만 확인한다. */
function PreviewApp() {
  return (
    <main>
      <header className="app-bar">
        <h1>공동 여행 계획</h1>
        <span className="app-bar__badge">미리보기 (AWS 미연결)</span>
      </header>
      <p className="app-room-title">{exampleRoomState.room.name} · {exampleRoomState.room.destination}</p>
      <ChatPanel
        roomId={exampleRoomState.room.id}
        currentUserId={exampleRoomState.members[0]?.userId}
        exampleState={exampleRoomState}
      />
    </main>
  )
}

export default App
