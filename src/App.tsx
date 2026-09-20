import { ChatPanel } from './features/chat/ChatPanel'
import { exampleRoomState } from '../shared/example-room-state'

function App() {
  // 배포 전에는 exampleRoomState로 채팅 화면을 확인한다.
  // AWS 연결 후에는 exampleState를 제거하고 currentUserId를 넘기면 watchRoom으로 실시간 동작한다.
  return (
    <main>
      <h1>공동 여행 계획</h1>
      <p>{exampleRoomState.room.name} · {exampleRoomState.room.destination}</p>
      <ChatPanel
        roomId={exampleRoomState.room.id}
        currentUserId={exampleRoomState.members[0]?.userId}
        exampleState={exampleRoomState}
      />
    </main>
  )
}

export default App
