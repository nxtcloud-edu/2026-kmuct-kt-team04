import { useState } from 'react'
import type { CSSProperties, FormEvent } from 'react'
import type { TimeBlock } from '../../../../shared/contracts'

// 타임블록 생성/수정 폼.
// - 생성: dayId 대상으로 createTimeBlock 호출 (requestId는 상위에서 생성)
// - 수정: expectedVersion으로 낙관적 동시성 확인
export interface TimeBlockFormValues {
  title: string
  startTime: string
  endTime: string
  description: string
}

interface TimeBlockFormProps {
  /** 수정 대상. 없으면 생성 모드. */
  editing?: TimeBlock | null
  onSubmit: (values: TimeBlockFormValues) => Promise<void>
  onCancel: () => void
}

export function TimeBlockForm({ editing, onSubmit, onCancel }: TimeBlockFormProps) {
  const [title, setTitle] = useState(editing?.title ?? '')
  const [startTime, setStartTime] = useState(editing?.startTime ?? '10:00')
  const [endTime, setEndTime] = useState(editing?.endTime ?? '12:00')
  const [description, setDescription] = useState(editing?.description ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  const isEdit = Boolean(editing)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setLocalError(null)
    if (!title.trim()) {
      setLocalError('제목을 입력하세요.')
      return
    }
    if (startTime >= endTime) {
      setLocalError('종료 시간은 시작 시간 이후여야 합니다.')
      return
    }
    setSubmitting(true)
    try {
      await onSubmit({ title: title.trim(), startTime, endTime, description: description.trim() })
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} style={formStyle}>
      <strong style={{ fontSize: '0.9rem' }}>{isEdit ? '타임블록 수정' : '타임블록 추가'}</strong>
      <label style={labelStyle}>
        제목
        <input
          value={title}
          maxLength={100}
          onChange={e => setTitle(e.target.value)}
          placeholder="예: 점심"
          style={inputStyle}
        />
      </label>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <label style={{ ...labelStyle, flex: 1 }}>
          시작
          <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} style={inputStyle} />
        </label>
        <label style={{ ...labelStyle, flex: 1 }}>
          종료
          <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} style={inputStyle} />
        </label>
      </div>
      <label style={labelStyle}>
        메모
        <textarea
          value={description}
          maxLength={2000}
          onChange={e => setDescription(e.target.value)}
          rows={2}
          style={{ ...inputStyle, resize: 'vertical' }}
        />
      </label>
      {localError && <p style={{ color: '#b91c1c', margin: 0, fontSize: '0.8rem' }}>{localError}</p>}
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button type="submit" disabled={submitting} style={primaryBtn}>
          {submitting ? '저장 중…' : isEdit ? '수정' : '추가'}
        </button>
        <button type="button" onClick={onCancel} disabled={submitting} style={secondaryBtn}>
          취소
        </button>
      </div>
    </form>
  )
}

const formStyle: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: '0.5rem',
  padding: '0.75rem', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8,
}
const labelStyle: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.8rem', color: '#475569',
}
const inputStyle: CSSProperties = {
  padding: '0.4rem 0.5rem', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '0.85rem',
}
const primaryBtn: CSSProperties = {
  padding: '0.4rem 0.75rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer',
}
const secondaryBtn: CSSProperties = {
  padding: '0.4rem 0.75rem', background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1', borderRadius: 6, cursor: 'pointer',
}
