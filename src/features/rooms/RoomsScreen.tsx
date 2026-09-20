import { useCallback, useEffect, useMemo, useState } from 'react'
import { roomApi } from '../../lib/backend'
import type { Room } from '../../lib/backend'

interface RoomsScreenProps {
  /** 방을 선택(입장)하면 호출한다. */
  onEnterRoom: (room: Room) => void
}

export function RoomsScreen({ onEnterRoom }: RoomsScreenProps) {
  const [rooms, setRooms] = useState<Room[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadRooms = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setRooms(await roomApi.listMyRooms())
    } catch (err) {
      setError(errorText(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadRooms()
  }, [loadRooms])

  return (
    <div className="rooms">
      <section className="rooms__panel">
        <div className="rooms__panel-head">
          <h2>참여 중인 여행방</h2>
          <button type="button" className="rooms__refresh" onClick={() => void loadRooms()} disabled={loading}>
            새로고침
          </button>
        </div>
        {loading ? (
          <p className="rooms__muted">불러오는 중…</p>
        ) : rooms.length === 0 ? (
          <p className="rooms__muted">아직 참여 중인 방이 없습니다. 새 방을 만들거나 초대 링크로 참여하세요.</p>
        ) : (
          <ul className="rooms__list">
            {rooms.map(room => (
              <li key={room.id}>
                <button type="button" className="rooms__item" onClick={() => onEnterRoom(room)}>
                  <span className="rooms__item-name">{room.name}</span>
                  <span className="rooms__item-meta">
                    {room.destination} · {room.startDate} ~ {room.endDate}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {error && <p className="rooms__error" role="alert">{error}</p>}
      </section>

      <CreateRoomForm onCreated={loadRooms} onEnterRoom={onEnterRoom} />
      <JoinRoomForm onJoined={loadRooms} onEnterRoom={onEnterRoom} />
    </div>
  )
}

interface CreateRoomFormProps {
  onCreated: () => Promise<void>
  onEnterRoom: (room: Room) => void
}

function CreateRoomForm({ onCreated, onEnterRoom }: CreateRoomFormProps) {
  const [name, setName] = useState('')
  const [destination, setDestination] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const valid = useMemo(
    () => name.trim() && destination.trim() && startDate && endDate && displayName.trim() && endDate >= startDate,
    [name, destination, startDate, endDate, displayName],
  )

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!valid) return
    setBusy(true)
    setError(null)
    try {
      const event2 = await roomApi.createRoom({
        name: name.trim(),
        destination: destination.trim(),
        startDate,
        endDate,
        displayName: displayName.trim(),
        requestId: crypto.randomUUID(),
      })
      await onCreated()
      onEnterRoom(event2.data as Room)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rooms__panel">
      <h2>새 여행방 만들기</h2>
      <form className="rooms__form" onSubmit={handleSubmit}>
        <label htmlFor="room-name">방 이름</label>
        <input id="room-name" value={name} maxLength={100} onChange={e => setName(e.target.value)} required />

        <label htmlFor="room-destination">여행지</label>
        <input
          id="room-destination"
          value={destination}
          maxLength={100}
          onChange={e => setDestination(e.target.value)}
          required
        />

        <div className="rooms__row">
          <div>
            <label htmlFor="room-start">시작일</label>
            <input id="room-start" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} required />
          </div>
          <div>
            <label htmlFor="room-end">종료일</label>
            <input id="room-end" type="date" value={endDate} min={startDate} onChange={e => setEndDate(e.target.value)} required />
          </div>
        </div>

        <label htmlFor="room-display">방에서 쓸 내 이름</label>
        <input
          id="room-display"
          value={displayName}
          maxLength={40}
          onChange={e => setDisplayName(e.target.value)}
          required
        />

        <button type="submit" disabled={busy || !valid}>만들기</button>
      </form>
      {error && <p className="rooms__error" role="alert">{error}</p>}
    </section>
  )
}

interface JoinRoomFormProps {
  onJoined: () => Promise<void>
  onEnterRoom: (room: Room) => void
}

function JoinRoomForm({ onJoined, onEnterRoom }: JoinRoomFormProps) {
  const [inviteToken, setInviteToken] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const token = parseInviteToken(inviteToken)
    if (!token || !displayName.trim()) return
    setBusy(true)
    setError(null)
    try {
      await roomApi.joinRoom({ inviteToken: token, displayName: displayName.trim() })
      await onJoined()
      // joinRoom 결과는 RoomMember라 방 정보가 없으므로, 목록을 새로고침한 뒤 해당 방을 찾아 입장한다.
      const rooms = await roomApi.listMyRooms()
      const joined = rooms.find(r => r.id === token) ?? rooms[0]
      if (joined) onEnterRoom(joined)
      setInviteToken('')
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rooms__panel">
      <h2>초대 링크로 참여</h2>
      <form className="rooms__form" onSubmit={handleSubmit}>
        <label htmlFor="join-token">초대 링크 또는 토큰</label>
        <input
          id="join-token"
          value={inviteToken}
          onChange={e => setInviteToken(e.target.value)}
          placeholder="초대 링크를 붙여넣거나 토큰을 입력하세요"
          required
        />
        <label htmlFor="join-display">방에서 쓸 내 이름</label>
        <input
          id="join-display"
          value={displayName}
          maxLength={40}
          onChange={e => setDisplayName(e.target.value)}
          required
        />
        <button type="submit" disabled={busy || !parseInviteToken(inviteToken) || !displayName.trim()}>
          참여하기
        </button>
      </form>
      {error && <p className="rooms__error" role="alert">{error}</p>}
    </section>
  )
}

/** 링크(?invite=... 또는 마지막 경로 조각)나 토큰 원문에서 43자 토큰만 뽑는다. */
function parseInviteToken(raw: string): string | null {
  const value = raw.trim()
  if (!value) return null
  const tokenPattern = /[A-Za-z0-9_-]{43}/
  // URL이면 invite 쿼리나 경로에서 토큰을 찾는다.
  try {
    const url = new URL(value)
    const q = url.searchParams.get('invite') ?? url.searchParams.get('token')
    if (q && tokenPattern.test(q)) return q.match(tokenPattern)?.[0] ?? null
  } catch {
    // URL이 아니면 아래 정규식으로 처리.
  }
  const match = value.match(tokenPattern)
  return match ? match[0] : null
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
