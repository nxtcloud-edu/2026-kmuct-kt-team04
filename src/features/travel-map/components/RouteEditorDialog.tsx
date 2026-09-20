import { useState } from 'react'
import type { FormEvent } from 'react'
import type { Pin, TravelRoute } from '../../../../shared/contracts'
import { requestRoutes } from '../services/routeService'
import { formatRouteDuration, type RouteResult } from '../types/route'

interface RouteEditorDialogProps {
  route: TravelRoute
  pins: Pin[]
  onUpdate: (routeId: string, name: string, recalculated?: RouteResult) => Promise<void>
  onDelete: (routeId: string) => Promise<void>
  onClose: () => void
}

export function RouteEditorDialog({ route, pins, onUpdate, onDelete, onClose }: RouteEditorDialogProps) {
  const [name, setName] = useState(route.name)
  const [pending, setPending] = useState<'save' | 'recalculate' | 'delete' | null>(null)
  const [error, setError] = useState('')
  const origin = pins.find(pin => pin.id === route.originPinId)
  const destination = pins.find(pin => pin.id === route.destinationPinId)

  async function run(action: NonNullable<typeof pending>, task: () => Promise<void>) {
    setPending(action)
    setError('')
    try { await task(); onClose() }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
    finally { setPending(null) }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const trimmedName = name.trim()
    if (!trimmedName) return
    void run('save', () => onUpdate(route.id, trimmedName))
  }

  function handleRecalculate() {
    const trimmedName = name.trim()
    if (!trimmedName || !origin || !destination) {
      setError('출발 또는 도착 핀을 찾을 수 없습니다.')
      return
    }
    void run('recalculate', async () => {
      const results = await requestRoutes(origin, destination, 'car')
      const first = results[0]
      if (!first) throw new Error('재계산된 차량 경로가 없습니다.')
      await onUpdate(route.id, trimmedName, first)
    })
  }

  function handleDelete() {
    if (!window.confirm(`‘${route.name}’ 경로를 삭제할까요?`)) return
    void run('delete', () => onDelete(route.id))
  }

  return <div className="pin-dialog-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !pending) onClose() }}>
    <form className="pin-dialog route-editor-dialog" onSubmit={handleSubmit}>
      <header><div><span>SAVED ROUTE</span><strong>저장 경로 편집</strong></div><button type="button" disabled={Boolean(pending)} onClick={onClose}>×</button></header>
      <div className="route-editor-dialog__endpoints"><b>{origin?.title ?? '출발 핀 없음'}</b><span>→</span><b>{destination?.title ?? '도착 핀 없음'}</b></div>
      <small>🚗 {formatRouteDuration(route.durationSeconds)} · {(route.distanceMeters / 1000).toFixed(1)} km</small>
      <label>경로 이름<input value={name} maxLength={100} required onChange={event => setName(event.target.value)} /></label>
      {error && <p>{error}</p>}
      <div className="route-editor-dialog__secondary-actions">
        <button type="button" disabled={Boolean(pending)} onClick={handleRecalculate}>{pending === 'recalculate' ? '재계산 중…' : '차량 경로 재계산'}</button>
        <button type="button" className="route-editor-dialog__delete" disabled={Boolean(pending)} onClick={handleDelete}>{pending === 'delete' ? '삭제 중…' : '삭제'}</button>
      </div>
      <footer><button type="button" disabled={Boolean(pending)} onClick={onClose}>취소</button><button type="submit" disabled={Boolean(pending) || !name.trim()}>{pending === 'save' ? '저장 중…' : '이름 저장'}</button></footer>
    </form>
  </div>
}
