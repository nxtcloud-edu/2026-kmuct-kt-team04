import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  RoomState, CreateTimeBlockInput, UpdateTimeBlockInput, CreatePinInput, UpdatePinInput,
  DeletePinInput, ReorderPinsInput, CreateRouteInput, UpdateRouteInput, DeleteRouteInput,
} from '../../../../shared/contracts'
import { createRoomAdapter, type RoomAdapter } from '../lib/roomAdapter'

export interface UseRoomData {
  mode: 'demo' | 'live' | 'loading'
  state: RoomState | null
  error: string | null
  createTimeBlock: (input: CreateTimeBlockInput) => Promise<void>
  updateTimeBlock: (input: UpdateTimeBlockInput) => Promise<void>
  createPin: (input: CreatePinInput) => Promise<void>
  updatePin: (input: UpdatePinInput) => Promise<void>
  deletePin: (input: DeletePinInput) => Promise<void>
  reorderPins: (input: ReorderPinsInput) => Promise<void>
  createRoute: (input: CreateRouteInput) => Promise<void>
  updateRoute: (input: UpdateRouteInput) => Promise<void>
  deleteRoute: (input: DeleteRouteInput) => Promise<void>
  refresh: () => void
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function useRoomData(roomId: string): UseRoomData {
  const [state, setState] = useState<RoomState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<'demo' | 'live' | 'loading'>('loading')
  const adapterRef = useRef<RoomAdapter | null>(null)
  const watcherRef = useRef<{ refresh(): void; unsubscribe(): void } | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const adapter = await createRoomAdapter(roomId)
        if (cancelled) return
        adapterRef.current = adapter
        setMode(adapter.mode)
        watcherRef.current = adapter.watch(
          next => { if (!cancelled) setState(next) },
          err => { if (!cancelled) setError(toMessage(err)) },
        )
      } catch (err) {
        if (!cancelled) setError(toMessage(err))
      }
    })()
    return () => {
      cancelled = true
      watcherRef.current?.unsubscribe()
      watcherRef.current = null
      adapterRef.current = null
    }
  }, [roomId])

  const run = useCallback(async (action: (adapter: RoomAdapter) => Promise<unknown>) => {
    const adapter = adapterRef.current
    if (!adapter) throw new Error('INTERNAL: 어댑터가 아직 준비되지 않았습니다.')
    setError(null)
    try { await action(adapter) }
    catch (err) { setError(toMessage(err)); throw err }
  }, [])

  const createTimeBlock = useCallback((input: CreateTimeBlockInput) => run(a => a.createTimeBlock(input)), [run])
  const updateTimeBlock = useCallback((input: UpdateTimeBlockInput) => run(a => a.updateTimeBlock(input)), [run])
  const createPin = useCallback((input: CreatePinInput) => run(a => a.createPin(input)), [run])
  const updatePin = useCallback((input: UpdatePinInput) => run(a => a.updatePin(input)), [run])
  const deletePin = useCallback((input: DeletePinInput) => run(a => a.deletePin(input)), [run])
  const reorderPins = useCallback((input: ReorderPinsInput) => run(a => a.reorderPins(input)), [run])
  const createRoute = useCallback((input: CreateRouteInput) => run(a => a.createRoute(input)), [run])
  const updateRoute = useCallback((input: UpdateRouteInput) => run(a => a.updateRoute(input)), [run])
  const deleteRoute = useCallback((input: DeleteRouteInput) => run(a => a.deleteRoute(input)), [run])
  const refresh = useCallback(() => { setError(null); watcherRef.current?.refresh() }, [])

  return {
    mode, state, error, createTimeBlock, updateTimeBlock, createPin, updatePin, deletePin, reorderPins,
    createRoute, updateRoute, deleteRoute, refresh,
  }
}
