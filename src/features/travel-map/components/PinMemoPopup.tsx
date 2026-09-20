import { useState } from 'react'
import type { CSSProperties } from 'react'
import type { Pin } from '../../../../shared/contracts'

export interface PinMemoValues {
  title: string
  description: string
  category: string
  status: 'candidate' | 'confirmed'
}

interface PinMemoPopupProps {
  pin: Pin
  order?: number
  onSave: (pin: Pin, values: PinMemoValues) => Promise<void>
  onDelete: (pin: Pin) => Promise<void>
  onClose: () => void
}

export function PinMemoPopup({ pin, order, onSave, onDelete, onClose }: PinMemoPopupProps) {
  const [title, setTitle] = useState(pin.title)
  const [description, setDescription] = useState(pin.description)
  const [category, setCategory] = useState(pin.category)
  const [status, setStatus] = useState<'candidate' | 'confirmed'>(pin.status)
  const [busy, setBusy] = useState<'save' | 'delete' | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    setError(null)
    if (!title.trim()) return setError('제목을 입력하세요.')
    setBusy('save')
    try {
      await onSave(pin, { title: title.trim(), description: description.trim(), category: category.trim(), status })
      onClose()
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
    finally { setBusy(null) }
  }

  async function handleDelete() {
    if (!window.confirm(`“${pin.title}” 핀을 삭제할까요?`)) return
    setBusy('delete'); setError(null)
    try { await onDelete(pin); onClose() }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
    finally { setBusy(null) }
  }

  return (
    <div style={backdrop} onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose() }}>
      <div style={popup} role="dialog" aria-modal="true" aria-label="핀 메모">
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', flex: 1, gap: '0.55rem' }}>
            {order && <span style={orderBadge}>{order}</span>}
            <input value={title} maxLength={100} onChange={event => setTitle(event.target.value)} style={titleInput} aria-label="제목" />
          </div>
          <button type="button" onClick={onClose} style={closeBtn} aria-label="닫기">×</button>
        </header>
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.6rem', flexWrap: 'wrap' }}>
          <label style={fieldLabel}>카테고리<input value={category} maxLength={50} onChange={event => setCategory(event.target.value)} placeholder="예: 관광명소" style={smallInput} /></label>
          <label style={fieldLabel}>상태<select value={status} onChange={event => setStatus(event.target.value as 'candidate' | 'confirmed')} style={smallInput}>
            <option value="candidate">후보 · 파란색</option><option value="confirmed">확정 · 빨간색</option>
          </select></label>
        </div>
        <label style={{ ...fieldLabel, width: '100%' }}>메모<textarea value={description} maxLength={2000} onChange={event => setDescription(event.target.value)} rows={8} placeholder="이 장소에 대한 메모" style={memoArea} /></label>
        <div style={{ fontSize: '0.72rem', color: '#94a3b8', margin: '0.4rem 0' }}>
          {pin.placeProvider === 'kakao' ? 'Kakao 검색 장소' : '직접 지정 위치'} · {pin.latitude.toFixed(5)}, {pin.longitude.toFixed(5)} · v{pin.version}
        </div>
        {error && <p style={{ color: '#b91c1c', fontSize: '0.8rem', margin: '0 0 0.5rem' }}>{error}</p>}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button type="button" onClick={() => void handleDelete()} disabled={Boolean(busy)} style={deleteBtn}>{busy === 'delete' ? '삭제 중…' : '핀 삭제'}</button>
          <div style={{ display: 'flex', gap: '0.5rem' }}><button type="button" onClick={onClose} disabled={Boolean(busy)} style={secondaryBtn}>취소</button>
            <button type="button" onClick={() => void handleSave()} disabled={Boolean(busy)} style={primaryBtn}>{busy === 'save' ? '저장 중…' : '저장'}</button></div>
        </div>
      </div>
    </div>
  )
}

const backdrop: CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }
const popup: CSSProperties = { width: 'min(520px, 92vw)', maxHeight: '86vh', overflowY: 'auto', background: '#fff', borderRadius: 14, padding: '1.25rem', boxShadow: '0 10px 40px rgba(15,23,42,0.2)' }
const orderBadge: CSSProperties = { display: 'grid', placeItems: 'center', width: 28, height: 28, flex: 'none', borderRadius: 9, background: '#eff6ff', color: '#2563eb', fontWeight: 900 }
const titleInput: CSSProperties = { flex: 1, minWidth: 0, fontSize: '1.1rem', fontWeight: 700, border: 'none', borderBottom: '1px solid transparent', outline: 'none' }
const closeBtn: CSSProperties = { background: 'none', border: 'none', fontSize: '1.5rem', lineHeight: 1, cursor: 'pointer', color: '#64748b' }
const fieldLabel: CSSProperties = { display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.78rem', color: '#475569' }
const smallInput: CSSProperties = { padding: '0.35rem 0.5rem', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '0.85rem', minWidth: 140 }
const memoArea: CSSProperties = { padding: '0.6rem', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: '0.9rem', resize: 'vertical', lineHeight: 1.6 }
const primaryBtn: CSSProperties = { padding: '0.45rem 0.9rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }
const secondaryBtn: CSSProperties = { padding: '0.45rem 0.9rem', background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1', borderRadius: 6, cursor: 'pointer' }
const deleteBtn: CSSProperties = { padding: '0.45rem 0.9rem', background: '#fff1f2', color: '#be123c', border: '1px solid #fecdd3', borderRadius: 6, cursor: 'pointer', fontSize: '0.8rem' }
