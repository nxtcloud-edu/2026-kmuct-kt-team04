import { useEffect, useState } from 'react'
import { ChatPanel } from './features/chat/ChatPanel'
import TravelMapPanel from './features/travel-map/TravelMapPanel'
import { exampleRoomState } from '../shared/example-room-state'
import { getLocalStatus, roomApi, watchRoom, type RoomState } from './lib/backend'
import { isLocalBackend } from './lib/local-api'

type LocalStatus = Awaited<ReturnType<typeof getLocalStatus>>
interface DemoSession { status: LocalStatus; state: RoomState }
interface TripSettingsValues { name: string; startDate: string; endDate: string; participantCount: number; expectedVersion: number }

function App() {
  const [session, setSession] = useState<DemoSession | null>(null)
  const [demoState, setDemoState] = useState<RoomState>(exampleRoomState)
  const [loading, setLoading] = useState(isLocalBackend)
  const [connectionError, setConnectionError] = useState('')

  useEffect(() => {
    if (!isLocalBackend) return
    let cancelled = false
    let watcher: ReturnType<typeof watchRoom> | undefined
    void (async () => {
      try {
        const status = await getLocalStatus()
        const state = await roomApi.getRoomState(status.roomId)
        if (cancelled) return
        setSession({ status, state })
        watcher = watchRoom(
          status.roomId,
          next => setSession(current => current ? { ...current, state: next } : { status, state: next }),
          error => setConnectionError(String(error)),
        )
      } catch (error) {
        if (!cancelled) setConnectionError(String(error))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true; watcher?.unsubscribe() }
  }, [])

  if (loading) {
    return <main className="canvas-loading"><p>Pintravle을 준비하고 있어요…</p></main>
  }

  const state = session?.state ?? demoState
  async function updateTripSettings(values: TripSettingsValues) {
    if (session) {
      await roomApi.updateRoom({
        roomId: state.room.id,
        ...values,
      })
      const next = await roomApi.getRoomState(state.room.id)
      setSession(current => current ? { ...current, state: next } : current)
      return
    }
    setDemoState(updateDemoSettings(state, values))
  }

  return (
    <CoreCanvas
      state={state}
      currentUserId={session?.status.currentUserId ?? state.members[0]?.userId}
      live={Boolean(session)}
      connectionError={connectionError}
      onUpdateSettings={updateTripSettings}
    />
  )
}

interface CoreCanvasProps {
  state: RoomState
  currentUserId?: string
  live: boolean
  connectionError: string
  onUpdateSettings: (values: TripSettingsValues) => Promise<void>
}

function CoreCanvas({ state, currentUserId, live, connectionError, onUpdateSettings }: CoreCanvasProps) {
  const [chatOpen, setChatOpen] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [selectedTimeBlockId, setSelectedTimeBlockId] = useState<string | null>(null)
  const selectedBlock = state.timeBlocks.find(block => block.id === selectedTimeBlockId)

  return (
    <main className="canvas-app">
      <TravelMapPanel roomId={state.room.id} onSelectedTimeBlockChange={setSelectedTimeBlockId} />

      <header className="canvas-topbar">
        <div>
          <span className="canvas-brand">Pintravle</span>
          <button type="button" className="canvas-room-name" onClick={() => setSettingsOpen(true)} title="여행 이름 수정">
            {state.room.name || '이름 없는 여행'}
          </button>
        </div>
      </header>

      {connectionError && <p className="canvas-connection-error" role="alert">{connectionError}</p>}

      <aside className={`canvas-chat-drawer ${chatOpen ? '' : 'canvas-chat-drawer--closed'}`} aria-hidden={!chatOpen}>
        <button type="button" className="canvas-chat-collapse" onClick={() => setChatOpen(false)} aria-label="채팅 접기">‹</button>
        <ChatPanel
          roomId={state.room.id}
          currentUserId={currentUserId}
          exampleState={live ? undefined : state}
          selectedTimeBlockId={selectedTimeBlockId ?? undefined}
        />
      </aside>

      {!chatOpen && (
        <button type="button" className="canvas-chat-toggle" onClick={() => setChatOpen(true)} aria-label="채팅 펼치기">
          <span>AI</span> 채팅 ›
        </button>
      )}

      <footer className="canvas-dock" aria-label="여행 정보">
        <button type="button" className="canvas-dock__item" onClick={() => setSettingsOpen(true)}>
          <span>여행 날짜</span><strong>{state.room.startDate} ~ {state.room.endDate}</strong>
        </button>
        <button type="button" className="canvas-dock__item" onClick={() => setSettingsOpen(true)}>
          <span>계획 인원</span><strong>{state.room.participantCount ?? 1}명</strong>
        </button>
        <div className={`canvas-dock__item ${selectedTimeBlockId ? 'canvas-dock__selected' : ''}`}>
          <span>AI 작업 대상</span>
          <strong>{selectedBlock?.title ?? (selectedTimeBlockId ? '선택한 타임블록' : '일정을 선택하세요')}</strong>
        </div>
        <button type="button" className="canvas-dock__settings" onClick={() => setSettingsOpen(true)}>여행 설정</button>
      </footer>

      {settingsOpen && (
        <TripSettingsDialog
          state={state}
          onSave={onUpdateSettings}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </main>
  )
}

interface TripSettingsDialogProps {
  state: RoomState
  onSave: (values: TripSettingsValues) => Promise<void>
  onClose: () => void
}

function TripSettingsDialog({ state, onSave, onClose }: TripSettingsDialogProps) {
  const [name, setName] = useState(state.room.name || '이름 없는 여행')
  const [startDate, setStartDate] = useState(state.room.startDate)
  const [endDate, setEndDate] = useState(state.room.endDate)
  const [participantCount, setParticipantCount] = useState(state.room.participantCount ?? 1)
  const [baseVersion] = useState(state.room.version)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const dayDifference = (Date.parse(endDate) - Date.parse(startDate)) / 86400000
  const valid = Boolean(name.trim() && startDate && endDate) && dayDifference >= 0 && dayDifference < 30
    && Number.isInteger(participantCount) && participantCount >= 1 && participantCount <= 100

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!valid) return
    setSaving(true)
    setError('')
    try {
      await onSave({ name: name.trim(), startDate, endDate, participantCount, expectedVersion: baseVersion })
      onClose()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="trip-settings-backdrop" role="presentation" onMouseDown={event => {
      if (event.target === event.currentTarget && !saving) onClose()
    }}>
      <section className="trip-settings" role="dialog" aria-modal="true" aria-labelledby="trip-settings-title">
        <header>
          <div><span>PINTRAVLE</span><h2 id="trip-settings-title">여행 설정</h2></div>
          <button type="button" onClick={onClose} disabled={saving} aria-label="닫기">×</button>
        </header>
        <form onSubmit={handleSubmit}>
          <label>여행 이름
            <input type="text" maxLength={100} value={name} onChange={event => setName(event.target.value)} required />
          </label>
          <div className="trip-settings__dates">
            <label>시작일<input type="date" value={startDate} onChange={event => setStartDate(event.target.value)} required /></label>
            <label>종료일<input type="date" value={endDate} min={startDate} onChange={event => setEndDate(event.target.value)} required /></label>
          </div>
          <label>계획 인원
            <div className="trip-settings__counter">
              <button type="button" onClick={() => setParticipantCount(value => Math.max(1, value - 1))}>−</button>
              <input type="number" min="1" max="100" value={participantCount}
                onChange={event => setParticipantCount(Number(event.target.value))} required />
              <button type="button" onClick={() => setParticipantCount(value => Math.min(100, value + 1))}>+</button>
            </div>
          </label>
          <p className="trip-settings__hint">최대 30일까지 설정할 수 있습니다. 일정이 있는 날짜는 기간에서 바로 제외할 수 없습니다.</p>
          {error && <p className="trip-settings__error" role="alert">{error}</p>}
          <div className="trip-settings__actions">
            <button type="button" onClick={onClose} disabled={saving}>취소</button>
            <button type="submit" disabled={!valid || saving}>{saving ? '저장 중…' : '저장'}</button>
          </div>
        </form>
      </section>
    </div>
  )
}

function updateDemoSettings(state: RoomState, values: TripSettingsValues): RoomState {
  if (state.room.version !== values.expectedVersion) {
    throw new Error('CONFLICT: 여행 설정이 변경됐습니다. 설정 창을 다시 열어 주세요.')
  }
  const requestedDates = datesBetween(values.startDate, values.endDate)
  const requestedSet = new Set(requestedDates)
  const removedDays = state.days.filter(day => !requestedSet.has(day.date))
  const scheduled = removedDays.find(day => state.timeBlocks.some(block => block.dayId === day.id))
  if (scheduled) throw new Error(`DATE_RANGE_HAS_SCHEDULE: ${scheduled.date}에 일정이 있어 여행 기간에서 제외할 수 없습니다.`)
  const byDate = new Map(state.days.map(day => [day.date, day]))
  const days = requestedDates.map((date, index) => {
    const existing = byDate.get(date)
    return existing ? { ...existing, dayNumber: index + 1 }
      : { id: crypto.randomUUID(), roomId: state.room.id, date, dayNumber: index + 1 }
  })
  const settings = {
    name: values.name, startDate: values.startDate, endDate: values.endDate, participantCount: values.participantCount,
  }
  return {
    ...state,
    room: {
      ...state.room, ...settings, version: state.room.version + 1, updatedAt: new Date().toISOString(),
    },
    days,
  }
}

function datesBetween(startDate: string, endDate: string): string[] {
  const dates: string[] = []
  for (let value = Date.parse(startDate); value <= Date.parse(endDate); value += 86400000) {
    dates.push(new Date(value).toISOString().slice(0, 10))
  }
  return dates
}

export default App
