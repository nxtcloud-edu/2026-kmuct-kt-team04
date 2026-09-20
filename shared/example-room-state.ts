import type { RoomState } from './contracts'

/** UI-only example, not deployed data. Replace with roomApi/watchRoom once AWS is connected. */
export const exampleRoomState: RoomState = {
  room: {
    id: '10000000-0000-4000-8000-000000000001', name: '부산 여행', destination: '부산',
    startDate: '2026-10-01', endDate: '2026-10-02', createdBy: 'example-user-a', version: 1,
    createdAt: '2026-09-20T03:00:00.000Z', updatedAt: '2026-09-20T03:00:00.000Z',
  },
  members: [{
    roomId: '10000000-0000-4000-8000-000000000001', userId: 'example-user-a',
    role: 'owner', displayName: '사용자 A', joinedAt: '2026-09-20T03:00:00.000Z',
  }],
  days: [
    { id: '20000000-0000-4000-8000-000000000001', roomId: '10000000-0000-4000-8000-000000000001', date: '2026-10-01', dayNumber: 1 },
    { id: '20000000-0000-4000-8000-000000000002', roomId: '10000000-0000-4000-8000-000000000001', date: '2026-10-02', dayNumber: 2 },
  ],
  timeBlocks: [{
    id: '30000000-0000-4000-8000-000000000001', roomId: '10000000-0000-4000-8000-000000000001',
    dayId: '20000000-0000-4000-8000-000000000001', title: '해운대 산책', startTime: '10:00', endTime: '12:00',
    description: '', createdBy: 'example-user-a', version: 1,
    createdAt: '2026-09-20T03:00:00.000Z', updatedAt: '2026-09-20T03:00:00.000Z',
  }],
  pins: [{
    id: '40000000-0000-4000-8000-000000000001', roomId: '10000000-0000-4000-8000-000000000001',
    timeBlockId: '30000000-0000-4000-8000-000000000001', title: '지도 표시 예시 위치',
    latitude: 35.1587, longitude: 129.1604, placeProvider: 'manual',
    description: '화면 개발용 예시입니다. 실제 장소 검색 결과가 아닙니다.', category: '', status: 'candidate',
    createdBy: 'example-user-a', version: 1,
    createdAt: '2026-09-20T03:00:00.000Z', updatedAt: '2026-09-20T03:00:00.000Z',
  }],
  messages: [{
    id: '50000000-0000-4000-8000-000000000001', roomId: '10000000-0000-4000-8000-000000000001',
    userId: 'example-user-a', type: 'user', content: '첫날은 어디부터 갈까요?', createdAt: '2026-09-20T03:00:00.000Z',
  }],
  messagesHasMore: false,
}
