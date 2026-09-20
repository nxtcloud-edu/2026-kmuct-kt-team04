import { Fragment, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import type { Pin, TimeBlock, TravelDay, TravelRoute } from '../../../../shared/contracts'
import { orderedPinsForBlock, pinOrderIndex } from '../lib/pinOrder'
import { formatRouteDuration } from '../types/route'
import { TimeBlockForm, type TimeBlockFormValues } from './TimeBlockForm'

interface ScheduleSidebarProps {
  days: TravelDay[]
  selectedDayId: string | null
  onSelectDay: (dayId: string) => void
  timeBlocks: TimeBlock[]
  selectedTimeBlockId: string | null
  onSelectTimeBlock: (timeBlockId: string | null) => void
  pins: Pin[]
  routes: TravelRoute[]
  onFocusPin: (pinId: string) => void
  onSelectRoute: (route: TravelRoute) => void
  onReorderPins: (block: TimeBlock, orderedPinIds: string[]) => Promise<void>
  onCreateTimeBlock: (dayId: string, values: TimeBlockFormValues) => Promise<void>
  onUpdateTimeBlock: (block: TimeBlock, values: TimeBlockFormValues) => Promise<void>
  onDeleteTimeBlock: (block: TimeBlock) => Promise<void>
  onSetVisitOrder: (pin: Pin, value: number) => Promise<void>
}

export function ScheduleSidebar(props: ScheduleSidebarProps) {
  const { days, selectedDayId, onSelectDay, timeBlocks, selectedTimeBlockId, onSelectTimeBlock, pins,
    routes, onFocusPin, onSelectRoute, onCreateTimeBlock, onUpdateTimeBlock, onDeleteTimeBlock, onSetVisitOrder } = props
  const [formMode, setFormMode] = useState<'none' | 'create' | { editId: string }>('none')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const orderById = pinOrderIndex(timeBlocks, pins)
  const pinsByBlock = useMemo(() => new Map(timeBlocks.map(block => [block.id, orderedPinsForBlock(block, pins)])), [pins, timeBlocks])
  const routesByOrigin = useMemo(() => {
    const grouped = new Map<string, TravelRoute[]>()
    for (const route of routes) grouped.set(route.originPinId, [...(grouped.get(route.originPinId) ?? []), route])
    return grouped
  }, [routes])
  const editingBlock = typeof formMode === 'object' ? timeBlocks.find(block => block.id === formMode.editId) ?? null : null

  async function removeBlock(block: TimeBlock) {
    const pinCount = pins.filter(pin => pin.timeBlockId === block.id).length
    const routeCount = routes.filter(route => route.timeBlockId === block.id).length
    if (!window.confirm(`“${block.title}” 타임블록과 내부 핀 ${pinCount}개, 경로 ${routeCount}개를 모두 삭제할까요?`)) return
    setBusy(true); setError('')
    try { await onDeleteTimeBlock(block); setFormMode('none') }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
    finally { setBusy(false) }
  }

  return (
    <aside style={sidebarStyle}>
      {error && <p role="alert" style={{ color: '#b91c1c' }}>{error}</p>}
      <div><h2 style={{ fontSize: '1rem', margin: '0 0 0.5rem' }}>일정</h2>
        <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
          {days.map(day => <button key={day.id} onClick={() => { onSelectDay(day.id); setFormMode('none') }} style={day.id === selectedDayId ? tabActive : tab}>
            Day {day.dayNumber}<span style={{ display: 'block', fontSize: '0.7rem', opacity: 0.8 }}>{day.date}</span></button>)}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span style={{ fontSize: '0.8rem', color: '#64748b' }}>타임블록</span>
          {selectedTimeBlockId && <button onClick={() => onSelectTimeBlock(null)} style={linkBtn}>전체 보기</button>}</div>
        {timeBlocks.length === 0 && <p style={{ fontSize: '0.85rem', color: '#94a3b8', margin: 0 }}>이 날짜에 타임블록이 없습니다.</p>}
        {timeBlocks.map(block => {
          const selected = block.id === selectedTimeBlockId
          const ordered = pinsByBlock.get(block.id) ?? []
          return <section key={block.id} style={selected ? blockCardActive : blockCard}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <button onClick={() => onSelectTimeBlock(selected ? null : block.id)} style={blockMainBtn}>
                <span style={{ fontWeight: 700 }}>{block.title}</span><span style={{ fontSize: '0.75rem', color: '#64748b' }}>{block.startTime}–{block.endTime} · 핀 {ordered.length}개</span>
              </button><button onClick={() => setFormMode({ editId: block.id })} style={linkBtn}>수정</button>
              <button type="button" disabled={busy} onClick={() => void removeBlock(block)} style={{ ...linkBtn, color: '#be123c' }}>삭제</button>
            </div>
            {selected && <div style={pinList}>
              {ordered.length === 0 && <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.76rem' }}>아직 핀이 없습니다. 지도 우클릭 또는 장소 검색으로 추가하세요.</p>}
              {ordered.map(pin => <Fragment key={pin.id}>
                <div style={pinRow}>
                  <button type="button" onClick={() => onFocusPin(pin.id)} style={pinOpenBtn} title={`${pin.title} 위치로 이동`}>
                    <span style={{ ...pinDot, background: pin.status === 'confirmed' ? '#ef4444' : '#3b82f6' }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pin.title}</span>
                  </button>
                  <div style={orderControls}><input key={`${pin.id}:${pin.version}:${orderById[pin.id]}`}
                    aria-label={`${pin.title} 여행 순서`} title="같은 순서 번호를 여러 핀에 지정할 수 있습니다."
                    type="number" min={1} max={9999} defaultValue={orderById[pin.id]} style={{ width: 52 }}
                    onBlur={async event => {
                      const value = Number(event.currentTarget.value)
                      if (value === orderById[pin.id]) return
                      if (!Number.isInteger(value) || value < 1 || value > 9999) { setError('여행 순서는 1~9999로 입력하세요.'); return }
                      try { await onSetVisitOrder(pin, value); setError('') }
                      catch (reason) { setError(String(reason)) }
                    }} /></div>
                </div>
                {(routesByOrigin.get(pin.id) ?? []).filter(route => route.timeBlockId === block.id).map(route =>
                  <button type="button" key={route.id} style={routeRow} onClick={() => onSelectRoute(route)} title={`${route.name} 편집`}>
                    <span aria-hidden="true">🚗</span><span style={routeName}>{route.name}</span><small>{formatRouteDuration(route.durationSeconds)}</small>
                  </button>)}
              </Fragment>)}
            </div>}
          </section>
        })}
        {formMode === 'create' && selectedDayId && <TimeBlockForm onSubmit={async values => { await onCreateTimeBlock(selectedDayId, values); setFormMode('none') }} onCancel={() => setFormMode('none')} />}
        {editingBlock && <TimeBlockForm editing={editingBlock} onSubmit={async values => { await onUpdateTimeBlock(editingBlock, values); setFormMode('none') }} onCancel={() => setFormMode('none')} />}
        {formMode === 'none' && selectedDayId && <button onClick={() => setFormMode('create')} style={addBtn}>+ 타임블록 추가</button>}
      </div>
    </aside>
  )
}

const sidebarStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: '1rem', width: 'auto', padding: '1rem', background: '#f8fafc', overflowY: 'auto' }
const tab: CSSProperties = { padding: '0.4rem 0.6rem', border: '1px solid #cbd5e1', background: '#fff', borderRadius: 6, cursor: 'pointer', fontSize: '0.8rem' }
const tabActive: CSSProperties = { ...tab, background: '#2563eb', color: '#fff', borderColor: '#2563eb' }
const blockCard: CSSProperties = { padding: '0.55rem', border: '1px solid #e2e8f0', borderRadius: 10, background: '#fff' }
const blockCardActive: CSSProperties = { ...blockCard, borderColor: '#2563eb', background: '#eff6ff' }
const blockMainBtn: CSSProperties = { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.15rem', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0 }
const linkBtn: CSSProperties = { background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', fontSize: '0.8rem', padding: '0.2rem' }
const addBtn: CSSProperties = { padding: '0.5rem', border: '1px dashed #94a3b8', borderRadius: 8, background: '#fff', color: '#475569', cursor: 'pointer', fontSize: '0.85rem' }
const pinList: CSSProperties = { display: 'flex', flexDirection: 'column', gap: '0.35rem', marginTop: '0.55rem', paddingTop: '0.55rem', borderTop: '1px solid #bfdbfe' }
const pinRow: CSSProperties = { position: 'relative', display: 'flex', alignItems: 'center', gap: '0.35rem', minHeight: 32, padding: '0.28rem 0.35rem', borderRadius: 8, background: '#fff' }
const pinOpenBtn: CSSProperties = { flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: '0.4rem', border: 0, background: 'transparent', textAlign: 'left', cursor: 'pointer', fontSize: '0.78rem' }
const pinDot: CSSProperties = { width: 8, height: 8, flex: 'none', borderRadius: '50%' }
const orderControls: CSSProperties = { display: 'flex', alignItems: 'center', gap: 2 }
const routeRow: CSSProperties = { display: 'flex', alignItems: 'center', gap: '0.4rem', marginLeft: '0.65rem', padding: '0.42rem 0.5rem', border: '1px solid #bfdbfe', borderRadius: 8, background: '#eff6ff', color: '#1e3a8a', cursor: 'pointer', textAlign: 'left' }
const routeName: CSSProperties = { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.76rem', fontWeight: 700 }
