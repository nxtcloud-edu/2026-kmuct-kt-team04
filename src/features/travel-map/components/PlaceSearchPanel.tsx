import { useMemo, useState } from 'react'
import type { CSSProperties, FormEvent } from 'react'
import type { TimeBlock } from '../../../../shared/contracts'
import { createPlaceSearchService, type PlaceSearchResult } from '../services/placeSearch'

interface PlaceSearchPanelProps {
  targetTimeBlock: TimeBlock | null
  onAddPin: (timeBlockId: string, place: PlaceSearchResult) => Promise<void>
}

const placeKey = (place: PlaceSearchResult) => `${place.placeProvider}:${place.placeId ?? place.title}`

export function PlaceSearchPanel({ targetTimeBlock, onAddPin }: PlaceSearchPanelProps) {
  const service = useMemo(() => createPlaceSearchService(), [])
  const [keyword, setKeyword] = useState('')
  const [results, setResults] = useState<PlaceSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [addingId, setAddingId] = useState<string | null>(null)
  const unavailable = service.mode === 'unavailable'

  async function handleSearch(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setSearching(true)
    try { setResults(await service.searchByKeyword(keyword)) }
    catch (err) { setError(err instanceof Error ? err.message : String(err)) }
    finally { setSearching(false) }
  }

  async function handleAdd(place: PlaceSearchResult) {
    if (!targetTimeBlock || unavailable) return
    const key = placeKey(place)
    setAddingId(key)
    setError(null)
    try { await onAddPin(targetTimeBlock.id, place) }
    catch (err) { setError(err instanceof Error ? err.message : String(err)) }
    finally { setAddingId(null) }
  }

  const modeLabel = service.mode === 'live' ? 'Kakao 연결' : service.mode === 'demo' ? '예시 검색' : '서버 연결 필요'
  return (
    <section style={panelStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h2 style={{ fontSize: '1rem', margin: 0 }}>장소 검색</h2>
        <span style={{ fontSize: '0.72rem', color: service.mode === 'live' ? '#047857' : '#94a3b8' }}>{modeLabel}</span>
      </div>

      <form onSubmit={handleSearch} style={{ display: 'flex', gap: '0.4rem' }}>
        <input value={keyword} onChange={event => setKeyword(event.target.value)} placeholder="장소 또는 카테고리" disabled={unavailable}
          style={{ flex: 1, minWidth: 0, padding: '0.45rem 0.55rem', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: '0.85rem' }} />
        <button type="submit" disabled={unavailable || searching || !keyword.trim()} style={searchBtn}>
          {searching ? '검색 중…' : '검색'}
        </button>
      </form>

      {unavailable && <p style={hintStyle}>AWS용 Kakao 검색 서버가 연결될 때까지 장소 추가를 사용할 수 없습니다.</p>}
      {!unavailable && !targetTimeBlock && <p style={hintStyle}>핀을 추가하려면 위에서 타임블록을 먼저 선택하세요.</p>}
      {targetTimeBlock && <p style={{ ...hintStyle, color: '#2563eb' }}>선택 일정: {targetTimeBlock.title}</p>}
      {error && <p style={{ fontSize: '0.8rem', color: '#b91c1c', margin: 0 }}>{error}</p>}

      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: 180, overflowY: 'auto' }}>
        {results.map(place => {
          const key = placeKey(place)
          return (
            <li key={key} style={resultCard}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>{place.title}</div>
                <div style={{ fontSize: '0.72rem', color: '#64748b' }}>{place.category ?? '장소'} · {place.address ?? `${place.latitude}, ${place.longitude}`}</div>
              </div>
              <button type="button" onClick={() => void handleAdd(place)} disabled={!targetTimeBlock || unavailable || addingId === key} style={addPinBtn}>
                {addingId === key ? '추가 중…' : '추가'}
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

const panelStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: '0.6rem', padding: '0.85rem', borderTop: '1px solid #e2e8f0', background: '#fff' }
const hintStyle: CSSProperties = { fontSize: '0.78rem', color: '#b45309', margin: 0 }
const searchBtn: CSSProperties = { padding: '0.4rem 0.7rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }
const resultCard: CSSProperties = { display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem', border: '1px solid #e2e8f0', borderRadius: 8 }
const addPinBtn: CSSProperties = { padding: '0.35rem 0.55rem', background: '#0f766e', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: '0.78rem' }
