import { roomApi, watchRoom } from '../../../lib/backend'
import type {
  CreateTimeBlockInput, UpdateTimeBlockInput, CreatePinInput, UpdatePinInput, DeletePinInput, ReorderPinsInput,
  CreateRouteInput, UpdateRouteInput, DeleteRouteInput,
} from '../../../../shared/contracts'
import type { RoomAdapter } from './roomAdapter'

// 실제 백엔드 연결 어댑터. roomApi / watchRoom에 그대로 위임합니다.
export function createLiveRoomAdapter(roomId: string): RoomAdapter {
  return {
    mode: 'live',
    loadRoomState: () => roomApi.getRoomState(roomId),
    watch: (onState, onError) => watchRoom(roomId, onState, onError),
    createTimeBlock: (input: CreateTimeBlockInput) => roomApi.createTimeBlock(input),
    updateTimeBlock: (input: UpdateTimeBlockInput) => roomApi.updateTimeBlock(input),
    deleteTimeBlock: input => roomApi.deleteTimeBlock(input),
    createPin: (input: CreatePinInput) => roomApi.createPin(input),
    updatePin: (input: UpdatePinInput) => roomApi.updatePin(input),
    deletePin: (input: DeletePinInput) => roomApi.deletePin(input),
    reorderPins: (input: ReorderPinsInput) => roomApi.reorderPins(input),
    createRoute: (input: CreateRouteInput) => roomApi.createRoute(input),
    updateRoute: (input: UpdateRouteInput) => roomApi.updateRoute(input),
    deleteRoute: (input: DeleteRouteInput) => roomApi.deleteRoute(input),
  }
}
