import { useState } from 'react'
import type { CSSProperties } from 'react'
import type { Pin } from '../../../../shared/contracts'

// 핀 클릭 시 뜨는 메모 팝업 (노션 페이지 링크처럼 핀이 상세 메모로 연결되는 형태).
// - Pin.description을 메모 본문으로 사용합니다. (계약에 없는 새 필드를 추가하지 않음)
// - 제목/카테고리/메모/상태를 보고 편집할 수 있습니다.
// - 저장은 updatePin으로 연결됩니다. updatePin은 title/description/category/status/expectedVersion을
//   모두 요구하므로, 편집하지 않은 값도 현재 값을 함께 전송합니다. version을 expectedVersion으로 보냅니다.
export interface PinMemoValues {
  title: string
  description: string
  category: string
  status: 'candidate' | 'confirmed'
}

interface PinMemoPopupProps {
  pin: Pin
  onSave: (pin: Pin, values: PinMemoValues) => Promise<void>
  onClose: () => void
}

export function PinMemoPopup({ pin, onSave, onClose }: PinMemoPopupProps) {
  const [title, setTitle] = useState(pin.title)
  const [description, setDescription] = useState(pin.description)
  const [category, setCategory] = useState(pin.category)
  const [status, setStatus] = useState<'candidate' | 'confirmed'>(pin.status)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    setError(null)
    if (!title.trim()) {
      setError('제목을 입력하세요.')
      return
    }
    setSaving(true)
    try {
      await onSave(pin, {
        title: title.trim(),
        description: description.trim(),
        category: category.trim(),
        status,
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={backdrop} onClick={onClose}>
      <div style={popup} onClick={e => e.stopPropagation()} role="dialog" aria-label="핀 메모">
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <input
            value={title}
            maxLength={100}
            onChange={e => setTitle(e.target.value)}
            style={titleInput}
            aria-label="제목"
          />
          <button onClick={onClose} style={closeBtn} aria-label="닫기">×</button>
        </header>

        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.6rem', flexWrap: 'wrap' }}>
          <label style={fieldLabel}>
            카테고리
            <input
              value={category}
              maxLength={50}
              onChange={e => setCategory(e.target.value)}
              placeholder="예: 관광명소"
              style={smallInput}
            />
          </label>
          <label style={fieldLabel}>
            상태
            <select
              value={status}
              onChange={e => setStatus(e.target.value as 'candidate' | 'confirmed')}
              style={smallInput}
            >
              {/* status 변경은 사용자가 명시적으로 선택할 때만 반영됩니다. */}
              <option value="candidate">후보</option>
              <option value="confirmed">확정</option>
            </select>
          </label>
        </div>

        <label style={{ ...fieldLabel, width: '100%' }}>
          메모
          <textarea
            value={description}
            maxLength={2000}
            onChange={e => setDescription(e.target.value)}
            rows={8}
            placeholder="이 장소에 대한 메모를 남겨보세요."
            style={memoArea}
          />
        </label>

        <div style={{ fontSize: '0.72rem', color: '#94a3b8', margin: '0.4rem 0' }}>
          {place(pin)} · 좌표 {pin.latitude.toFixed(5)}, {pin.longitude.toFixed(5)} · v{pin.version}
        </div>

        {error && <p style={{ color: '#b91c1c', fontSize: '0.8rem', margin: '0 0 0.5rem' }}>{error}</p>}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {/* TODO(A/백엔드): 계약에 deletePin이 없어 삭제 버튼은 비활성입니다. 서버 구현 후 활성화하세요. */}
          <button disabled title="deletePin 미구현 (백엔드 대기)" style={deleteBtnDisabled}>
            삭제 (백엔드 대기)
          </button>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={onClose} disabled={saving} style={secondaryBtn}>취소</button>
            <button onClick={handleSave} disabled={saving} style={primaryBtn}>
              {saving ? '저장 중…' : '저장'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function place(pin: Pin): string {
  if (pin.placeProvider === 'kakao') return `카카오 장소${pin.placeId ? ` (${pin.placeId})` : ''}`
  return '직접 지정 위치'
}

const backdrop: CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.4)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
}
const popup: CSSProperties = {
  width: 'min(520px, 92vw)', maxHeight: '86vh', overflowY: 'auto',
  background: '#fff', borderRadius: 12, padding: '1.25rem', boxShadow: '0 10px 40px rgba(15,23,42,0.2)',
}
const titleInput: CSSProperties = {
  flex: 1, fontSize: '1.1rem', fontWeight: 700, border: 'none', borderBottom: '1px solid transparent', outline: 'none',
}
const closeBtn: CSSProperties = {
  background: 'none', border: 'none', fontSize: '1.5rem', lineHeight: 1, cursor: 'pointer', color: '#64748b',
}
const fieldLabel: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.78rem', color: '#475569',
}
const smallInput: CSSProperties = {
  padding: '0.35rem 0.5rem', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '0.85rem', minWidth: 140,
}
const memoArea: CSSProperties = {
  padding: '0.6rem', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: '0.9rem', resize: 'vertical', lineHeight: 1.6,
}
const primaryBtn: CSSProperties = {
  padding: '0.45rem 0.9rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer',
}
const secondaryBtn: CSSProperties = {
  padding: '0.45rem 0.9rem', background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1', borderRadius: 6, cursor: 'pointer',
}
const deleteBtnDisabled: CSSProperties = {
  padding: '0.45rem 0.9rem', background: '#f8fafc', color: '#cbd5e1', border: '1px dashed #e2e8f0', borderRadius: 6, cursor: 'not-allowed', fontSize: '0.8rem',
}
