import type {
  RoomState, RoomEvent,
  CreateTimeBlockInput, UpdateTimeBlockInput, CreatePinInput, UpdatePinInput,
} from '../../../../shared/contracts'

// 방 데이터 접근 계층.
// 화면 컴포넌트는 이 인터페이스만 사용하고, 임시(demo) / 실제(live) 어댑터를 교체합니다.
// - demo: exampleRoomState 기반 로컬 상태 (AWS 미배포 시 화면 시험용)
// - live: A의 roomApi / watchRoom에 그대로 위임 (배포 및 configureBackend 이후)

export interface RoomWatcher {
  refresh(): void
  unsubscribe(): void
}

export interface RoomAdapter {
  /** 화면에 임시 모드임을 표시하기 위한 구분값. */
  readonly mode: 'demo' | 'live'
  loadRoomState(): Promise<RoomState>
  watch(onState: (state: RoomState) => void, onError: (error: unknown) => void): RoomWatcher

  createTimeBlock(input: CreateTimeBlockInput): Promise<RoomEvent>
  updateTimeBlock(input: UpdateTimeBlockInput): Promise<RoomEvent>
  createPin(input: CreatePinInput): Promise<RoomEvent>
  updatePin(input: UpdatePinInput): Promise<RoomEvent>

  // TODO(A/백엔드): 서버 계약에 deletePin이 없습니다. 백엔드 구현 후 아래 시그니처로 연결하세요.
  //   - 계약(BACKEND-CONTRACT.md)에 deletePin이 추가되면 roomApi.deletePin과 demo 어댑터를 함께 구현합니다.
  //   - 그 전까지 B는 삭제 기능을 임의로 구현하지 않습니다. 호출 시 미구현 에러를 던집니다.
  deletePin(roomId: string, pinId: string): Promise<never>
}

/**
 * 사용할 어댑터를 선택합니다.
 * 기본은 demo. 배포 후 통합 담당자가 configureBackend를 호출하고
 * VITE_ROOM_ADAPTER=live 로 지정하면 live 어댑터를 사용합니다.
 */
export async function createRoomAdapter(roomId: string): Promise<RoomAdapter> {
  const wantsLive = (import.meta.env.VITE_ROOM_ADAPTER as string | undefined) === 'live'
  if (wantsLive) {
    const { createLiveRoomAdapter } = await import('./liveRoomAdapter')
    return createLiveRoomAdapter(roomId)
  }
  const { createDemoRoomAdapter } = await import('./demoRoomAdapter')
  return createDemoRoomAdapter(roomId)
}
