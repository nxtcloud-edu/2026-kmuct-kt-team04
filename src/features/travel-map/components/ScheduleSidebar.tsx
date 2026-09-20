import { useState } from 'react'
import type { CSSProperties } from 'react'
import type { Pin, TimeBlock, TravelDay } from '../../../../shared/contracts'
import { TimeBlockForm, type TimeBlockFormValues } from './TimeBlockForm'

// 날짜 탭 + 타임블록 목록/선택 + 타임블록 생성/수정.
// 선택 상태(날짜/타임블록)는 상위(useMapSelection)에서 관리하는 화면 로컬 상태입니다.
interface ScheduleSidebarProps {
  days: TravelDay[]
  selectedDayId: string | null
  onSelectDay: (dayId: string) => void

  timeBlocks: TimeBlock[]
  selectedTimeBlockId: string | null
  onSelectTimeBlock: (timeBlockId: string | null) => void

  pins: Pin[]

  onCreateTimeBlock: (dayId: string, values: TimeBlockFormValues) => Promise<void>
  onUpdateTimeBlock: (block: TimeBlock, values: TimeBlockFormValues) => Promise<void>
}

export function ScheduleSidebar(props: ScheduleSidebarProps) {
  const {
    days, selectedDayId, onSelectDay,
    timeBlocks, selectedTimeBlockId, onSelectTimeBlock, pins,
    onCreateTimeBlock, onUpdateTimeBlock,
  } = props

  const [formMode, setFormMode] = useState<'none' | 'create' | { editId: string }>('none')

  function pinCount(timeBlockId: string): number {
    return pins.filter(p => p.timeBlockId === timeBlockId).length
  }

  const editingBlock =
    typeof formMode === 'object' ? timeBlocks.find(b => b.id === formMode.editId) ?? null : null

  return (
    <aside style={sidebarStyle}>
      <div>
        <h2 style={{ fontSize: '1rem', margin: '0 0 0.5rem' }}>일정</h2>
        {/* 날짜 탭 */}
        <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
          {days.map(day => (
            <button
              key={day.id}
              onClick={() => { onSelectDay(day.id); setFormMode('none') }}
              style={day.id === selectedDayId ? tabActive : tab}
            >
              Day {day.dayNumber}
              <span style={{ display: 'block', fontSize: '0.7rem', opacity: 0.8 }}>{day.date}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 타임블록 목록 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.8rem', color: '#64748b' }}>타임블록</span>
          {selectedTimeBlockId && (
            <button onClick={() => onSelectTimeBlock(null)} style={linkBtn}>전체 보기</button>
          )}
        </div>

        {timeBlocks.length === 0 && (
          <p style={{ fontSize: '0.85rem', color: '#94a3b8', margin: 0 }}>이 날짜에 타임블록이 없습니다.</p>
        )}

        {timeBlocks.map(block => (
          <div
            key={block.id}
            style={block.id === selectedTimeBlockId ? blockCardActive : blockCard}
          >
            <button onClick={() => onSelectTimeBlock(block.id)} style={blockMainBtn}>
              <span style={{ fontWeight: 600 }}>{block.title}</span>
              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                {block.startTime}–{block.endTime} · 핀 {pinCount(block.id)}개
              </span>
            </button>
            <button onClick={() => setFormMode({ editId: block.id })} style={linkBtn}>수정</button>
          </div>
        ))}

        {/* 생성/수정 폼 */}
        {formMode === 'create' && selectedDayId && (
          <TimeBlockForm
            onSubmit={async values => { await onCreateTimeBlock(selectedDayId, values); setFormMode('none') }}
            onCancel={() => setFormMode('none')}
          />
        )}
        {editingBlock && (
          <TimeBlockForm
            editing={editingBlock}
            onSubmit={async values => { await onUpdateTimeBlock(editingBlock, values); setFormMode('none') }}
            onCancel={() => setFormMode('none')}
          />
        )}

        {formMode === 'none' && selectedDayId && (
          <button onClick={() => setFormMode('create')} style={addBtn}>+ 타임블록 추가</button>
        )}
      </div>
    </aside>
  )
}

const sidebarStyle: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: '1rem',
  width: 280, padding: '1rem', borderRight: '1px solid #e2e8f0', background: '#f8fafc', overflowY: 'auto',
}
const tab: CSSProperties = {
  padding: '0.4rem 0.6rem', border: '1px solid #cbd5e1', background: '#fff', borderRadius: 6, cursor: 'pointer', fontSize: '0.8rem',
}
const tabActive: CSSProperties = { ...tab, background: '#2563eb', color: '#fff', borderColor: '#2563eb' }
const blockCard: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '0.5rem',
  padding: '0.5rem', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff',
}
const blockCardActive: CSSProperties = { ...blockCard, borderColor: '#2563eb', background: '#eff6ff' }
const blockMainBtn: CSSProperties = {
  flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.15rem',
  background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0,
}
const linkBtn: CSSProperties = {
  background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', fontSize: '0.8rem', padding: '0.2rem',
}
const addBtn: CSSProperties = {
  padding: '0.5rem', border: '1px dashed #94a3b8', borderRadius: 8, background: '#fff', color: '#475569', cursor: 'pointer', fontSize: '0.85rem',
}
