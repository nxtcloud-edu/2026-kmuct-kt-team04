import type {
  CreatePinInput, CreateRouteInput, CreateTimeBlockInput, DeletePinInput, DeleteRouteInput,
  ReorderPinsInput, RoomEvent, RoomState, UpdatePinInput, UpdateRouteInput, UpdateTimeBlockInput,
} from '../../../../shared/contracts'
import { isLocalBackend } from '../../../lib/local-api'
import type { DeleteTimeBlockInput } from '../../../../shared/contracts'

export interface RoomWatcher {
  refresh(): void
  unsubscribe(): void
}

export interface RoomAdapter {
  readonly mode: 'demo' | 'live'
  loadRoomState(): Promise<RoomState>
  watch(onState: (state: RoomState) => void, onError: (error: unknown) => void): RoomWatcher
  createTimeBlock(input: CreateTimeBlockInput): Promise<RoomEvent>
  updateTimeBlock(input: UpdateTimeBlockInput): Promise<RoomEvent>
  deleteTimeBlock(input: DeleteTimeBlockInput): Promise<RoomEvent>
  createPin(input: CreatePinInput): Promise<RoomEvent>
  updatePin(input: UpdatePinInput): Promise<RoomEvent>
  deletePin(input: DeletePinInput): Promise<RoomEvent>
  reorderPins(input: ReorderPinsInput): Promise<RoomEvent>
  createRoute(input: CreateRouteInput): Promise<RoomEvent>
  updateRoute(input: UpdateRouteInput): Promise<RoomEvent>
  deleteRoute(input: DeleteRouteInput): Promise<RoomEvent>
}

/** 로컬 시연 서버 또는 명시적인 AWS live 설정에서는 공통 roomApi를 사용합니다. */
export async function createRoomAdapter(roomId: string): Promise<RoomAdapter> {
  const wantsLive = isLocalBackend || (import.meta.env.VITE_ROOM_ADAPTER as string | undefined) === 'live'
  if (wantsLive) {
    const { createLiveRoomAdapter } = await import('./liveRoomAdapter')
    return createLiveRoomAdapter(roomId)
  }
  const { createDemoRoomAdapter } = await import('./demoRoomAdapter')
  return createDemoRoomAdapter(roomId)
}
