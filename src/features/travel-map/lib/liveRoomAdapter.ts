import { roomApi, watchRoom } from '../../../lib/backend'
import type {
  CreateTimeBlockInput, UpdateTimeBlockInput, CreatePinInput, UpdatePinInput,
} from '../../../../shared/contracts'
import type { RoomAdapter } from './roomAdapter'

// 실제 백엔드 연결 어댑터. A의 roomApi / watchRoom에 그대로 위임합니다.
// 이 어댑터는 configureBackend(amplify_outputs.json)가 앱 진입점에서 호출된 뒤에만 정상 동작합니다.
// (AWS 미배포 상태에서는 loadRoomState/watch가 실패하므로 기본값은 demo 어댑터입니다.)
export function createLiveRoomAdapter(roomId: string): RoomAdapter {
  return {
    mode: 'live',
    loadRoomState: () => roomApi.getRoomState(roomId),
    watch: (onState, onError) => watchRoom(roomId, onState, onError),
    createTimeBlock: (input: CreateTimeBlockInput) => roomApi.createTimeBlock(input),
    updateTimeBlock: (input: UpdateTimeBlockInput) => roomApi.updateTimeBlock(input),
    createPin: (input: CreatePinInput) => roomApi.createPin(input),
    updatePin: (input: UpdatePinInput) => roomApi.updatePin(input),
    // TODO(A/백엔드): 계약에 deletePin이 추가되면 roomApi.deletePin으로 위임하도록 교체하세요.
    deletePin: () =>
      Promise.reject(new Error('NOT_IMPLEMENTED: deletePin은 서버 계약에 없습니다. 백엔드 구현 후 연결하세요.')),
  }
}
