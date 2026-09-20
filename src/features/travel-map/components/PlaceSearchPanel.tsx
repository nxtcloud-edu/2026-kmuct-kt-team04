import { useMemo, useState } from 'react'
import type { CSSProperties, FormEvent } from 'react'
import type { TimeBlock } from '../../../../shared/contracts'
import { createPlaceSearchService, type PlaceSearchResult } from '../services/placeSearch'

// 키워드 검색 → 결과 표시 → 장소 선택 → 선택한 타임블록에 핀 추가.
// 실제 검색은 C의 서비스로 교체됩니다(services/placeSearch.ts의 TODO 참고).
interface PlaceSearchPanelProps {
  /** 핀을 추가할 대상 타임블록. 선택되지 않으면 추가 불가. */
  targetTimeBlock: TimeBlock | null
  onAddPin: (timeBlockId: string, place: PlaceSearchResult) => Promise<void>
}

export function PlaceSearchPanel({ targetTimeBlock, onAddPin }: PlaceSearchPanelProps) {
  const service = useMemo(() => createPlaceSearchService(), [])
  const [keyword, setKeyword] = useState('')
  const [results, setResults] = useState<PlaceSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [addingId, setAddingId] = useState<string | null>(null)

  async function handleSearch(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSearching(true)
    try {
      setResults(await service.searchByKeyword(keyword))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSearching(false)
    }
  }

  async function handleAdd(place: PlaceSearchResult) {
    if (!targetTimeBlock) return
    setAddingId(place.placeId)
    setError(null)
    try {
      await onAddPin(targetTimeBlock.id, place)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setAddingId(null)
    }
  }

  return (
    <section style={panelStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h2 style={{ fontSize: '1rem', margin: 0 }}>장소 검색</h2>
        <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Mock (C 연결 예정)</span>
      </div>

      <form onSubmit={handleSearch} style={{ display: 'flex', gap: '0.4rem' }}>
        <input
          value={keyword}
          onChange={e => setKeyword(e.target.value)}
          placeholder="키워드로 장소 검색"
          style={{ flex: 1, padding: '0.4rem 0.5rem', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '0.85rem' }}
        />
        <button type="submit" disabled={searching} style={searchBtn}>
          {searching ? '검색 중…' : '검색'}
        </button>
      </form>

      {!targetTimeBlock && (
        <p style={{ fontSize: '0.8rem', color: '#b45309', margin: 0 }}>
          핀을 추가하려면 먼저 왼쪽에서 타임블록을 선택하세요.
        </p>
      )}
      {error && <p style={{ fontSize: '0.8rem', color: '#b91c1c', margin: 0 }}>{error}</p>}

      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        {results.map(place => (
          <li key={place.placeId} style={resultCard}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{place.title}</div>
              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                {place.category ?? '장소'} · {place.address ?? `${place.latitude}, ${place.longitude}`}
              </div>
            </div>
            <button
              onClick={() => handleAdd(place)}
              disabled={!targetTimeBlock || addingId === place.placeId}
              style={addPinBtn}
            >
              {addingId === place.placeId ? '추가 중…' : '일정에 추가'}
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

const panelStyle: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: '0.6rem',
  padding: '1rem', borderTop: '1px solid #e2e8f0', background: '#fff',
}
const searchBtn: CSSProperties = {
  padding: '0.4rem 0.75rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer',
}
const resultCard: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '0.5rem',
  padding: '0.5rem', border: '1px solid #e2e8f0', borderRadius: 8,
}
const addPinBtn: CSSProperties = {
  padding: '0.35rem 0.6rem', background: '#0f766e', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: '0.8rem',
}
