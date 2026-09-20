import { useState } from 'react'

interface ManualPinDialogProps {
  point: { latitude: number; longitude: number }
  timeBlockTitle: string
  onCreate: (title: string, description: string) => Promise<void>
  onClose: () => void
}

export function ManualPinDialog({ point, timeBlockTitle, onCreate, onClose }: ManualPinDialogProps) {
  const [title, setTitle] = useState('새 장소')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!title.trim()) return
    setSaving(true); setError('')
    try { await onCreate(title.trim(), description.trim()); onClose() }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
    finally { setSaving(false) }
  }
  return (
    <div className="pin-dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !saving) onClose() }}>
      <form className="pin-dialog" onSubmit={submit} role="dialog" aria-modal="true" aria-label="직접 핀 추가">
        <header><div><span>지도에서 직접 추가</span><strong>{timeBlockTitle}</strong></div><button type="button" onClick={onClose}>×</button></header>
        <label>핀 이름<input autoFocus maxLength={100} value={title} onChange={event => setTitle(event.target.value)} /></label>
        <label>메모<textarea maxLength={2000} rows={3} value={description} onChange={event => setDescription(event.target.value)} /></label>
        <small>{point.latitude.toFixed(5)}, {point.longitude.toFixed(5)}</small>
        {error && <p role="alert">{error}</p>}
        <footer><button type="button" onClick={onClose}>취소</button><button type="submit" disabled={saving || !title.trim()}>{saving ? '추가 중…' : '핀 추가'}</button></footer>
      </form>
    </div>
  )
}
