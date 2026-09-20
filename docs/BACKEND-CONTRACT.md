# 팀원 B·C 연결 안내 — 백엔드 초안 v1

이 문서는 A가 먼저 제시하는 연결 기준입니다. 변경 요청을 협의해서 반영하며, 각자 다른 필드나 저장 경로를 추가하지 않습니다.
백엔드 코드는 구현되어 있으나 AWS 실배포·두 브라우저 통합 검증은 아직 하지 않았습니다.

## 지금 화면 개발을 시작하려면

1. 타입은 `shared/contracts.ts`, 예시 데이터는 `shared/example-room-state.ts`를 참고합니다.
2. 실제 연결 함수는 `src/lib/backend.ts`의 `roomApi`와 `watchRoom`입니다.
3. AWS 배포 전에는 `exampleRoomState`로 각자 화면을 만들 수 있습니다. 이 데이터는 예시이며 서버 저장을 흉내 내지 않습니다.
4. 공통 설정 파일, `amplify/`, `shared/contracts.ts`, `src/lib/backend.ts`는 A와 조율해 변경합니다.
5. B는 지도·일정 화면, C는 채팅·AI를 담당합니다. 이 변경에는 해당 화면이 포함되지 않습니다.

```ts
import { exampleRoomState } from '../../shared/example-room-state'
// 컴포넌트 위치에 따라 상대 경로만 조정하세요.
// exampleRoomState.timeBlocks / pins / messages로 화면 초안을 작성합니다.
```

## 데이터 규칙

| 데이터 | 주요 필드 |
| --- | --- |
| Room | id, name, destination, startDate, endDate, createdBy, version |
| RoomMember | roomId, userId, role(owner/member), displayName, joinedAt |
| TravelDay | id, roomId, date, dayNumber |
| TimeBlock | id, roomId, dayId, title, startTime, endTime, description, createdBy, version |
| Pin | id, roomId, timeBlockId, title, latitude, longitude, placeProvider, placeId?, description, category, status, createdBy, version |
| Message | id, roomId, userId, content, type(user/ai/system), createdAt |

- 날짜: `YYYY-MM-DD`, 타임블록: 한국 시간 `HH:mm` (같은 날짜에서 시작 < 종료).
- 생성·수정 시각: 서버가 설정하는 UTC ISO 문자열. 화면에서는 한국 시간으로 표시합니다.
- 여행은 최대 30일. 방 생성 시 시작일~종료일을 포함한 TravelDay를 자동 생성합니다.
- 좌표는 숫자, 위도 `latitude`, 경도 `longitude`입니다. 순서를 바꾸지 않습니다.
- 카카오 검색 결과는 `placeProvider: 'kakao'`, `placeId` 필수. 사용자의 직접 위치 선택은 `manual`입니다.
- 핀 상태는 `candidate` 또는 `confirmed`. AI가 확정 여부를 임의로 바꾸지 않도록 C가 요청 의도를 확인합니다.
- `createdBy`, `userId`, `role`, 생성 시각은 서버가 결정합니다. 입력에 넣으면 거절합니다.
- 이름 최대 100자, 메모 2,000자, 메시지 4,000자, 참여자 표시 이름 40자입니다.
- 지도 범위·선택 날짜·선택 타임블록은 각 사용자 화면 상태입니다. 방 데이터에 저장하지 않습니다.
- AI 작업 대상 타임블록은 지도 표시 범위와 분리하고, 요청 시 실제 ID를 고정해서 전달합니다.

## 로그인과 초기 설정

로그인은 Cognito 이메일/비밀번호 방식입니다. 회원가입 후 이메일 확인 코드 입력이 필요합니다.
`aws-amplify/auth`의 `signUp`, `confirmSignUp`, `signIn`, `getCurrentUser`, `signOut`을 사용합니다.
인증 화면은 아직 포함하지 않았습니다. 로그인 결과의 `nextStep`을 확인해야 합니다.

AWS 배포 후 생성된 `amplify_outputs.json`을 통합 담당자가 준비하면 앱 진입점에서 한 번 설정합니다.
파일이 없는 현재 상태에서 import를 먼저 추가하면 빌드가 실패하므로 배포 후 연결합니다.

```ts
import outputs from '../amplify_outputs.json'
import { configureBackend } from './lib/backend'
configureBackend(outputs)
```

## 함수 사용법

모든 쓰기 결과는 `RoomEvent`입니다. 생성/수정한 객체는 `result.data`, 객체 ID는 `result.entityId`입니다.
함수 입력의 전체 타입은 `shared/contracts.ts`가 기준입니다.

| 함수 | 입력 | 결과 |
| --- | --- | --- |
| listMyRooms | 없음 | 참여 중인 Room 배열 |
| createRoom | name, destination, startDate, endDate, displayName, requestId | RoomEvent (data: Room) |
| createInvite | roomId | roomId, inviteToken, expiresAt |
| joinRoom | inviteToken, displayName | RoomEvent (data: RoomMember) |
| getRoomState | roomId | room, members, days, timeBlocks, pins, messages, messagesHasMore |
| createTimeBlock | roomId, dayId, title, startTime, endTime, description?, requestId | RoomEvent (data: TimeBlock) |
| updateTimeBlock | roomId, timeBlockId, title, startTime, endTime, description, expectedVersion | RoomEvent |
| createPin | roomId, timeBlockId, title, latitude, longitude, placeProvider, placeId?, description?, category?, status?, requestId | RoomEvent (data: Pin) |
| updatePin | roomId, pinId, title, description, category, status, expectedVersion | RoomEvent |
| sendMessage | roomId, content, requestId | RoomEvent (data: Message) |
| watchRoom | roomId, onState, onError | refresh(), unsubscribe() |

```ts
import { roomApi, watchRoom } from './lib/backend'

const created = await roomApi.createRoom({
  name: '부산 여행', destination: '부산', startDate: '2026-10-01', endDate: '2026-10-03',
  displayName: '여행자 A', requestId: crypto.randomUUID(),
})
const state = await roomApi.getRoomState(created.roomId)
const block = await roomApi.createTimeBlock({
  roomId: created.roomId, dayId: state.days[0].id,
  title: '점심', startTime: '12:00', endTime: '13:00', requestId: crypto.randomUUID(),
})

const watcher = watchRoom(created.roomId, nextState => {
  // 각자의 화면 상태를 nextState로 갱신합니다.
}, error => {
  // 오류를 표시합니다. FORBIDDEN/로그인 오류이면 구독을 종료합니다.
  console.error(error)
})
// 화면에서 나가거나 로그아웃할 때 반드시 watcher.unsubscribe()
```

### 중복 생성과 동시 수정

- `requestId`는 새 작업마다 `crypto.randomUUID()`로 만들고, 네트워크 오류로 같은 작업을 재시도할 때는 같은 값을 사용합니다.
- 같은 사용자·같은 방·같은 작업 종류에서 같은 requestId는 최초 저장 결과를 반환합니다. 입력 내용을 바꾸어 재사용하지 않습니다.
- 갱신할 때 읽어 둔 객체의 `version`을 `expectedVersion`으로 보냅니다.
- 다른 사용자가 먼저 수정했다면 `CONFLICT`가 납니다. 최신 데이터를 다시 읽고 수정할 내용을 확인합니다. 자동 덮어쓰기는 하지 않습니다.
- 실시간 이벤트의 도착 순서를 최종 상태로 가정하지 않습니다. `watchRoom`은 이벤트마다 서버 상태를 다시 조회합니다.
- 연결 복구 시 재조회하며, 초기 연결 중 유실된 이벤트 복구를 위해 15초 간격 재조회도 사용합니다.
- 채팅은 저장된 메시지 중 최근 100개가 반환됩니다. 더 오래된 메시지는 DB에 남지만 과거 기록 페이지 기능은 아직 없습니다.

### 초대

초대 토큰은 7일 동안 유효하며 링크를 가진 로그인 사용자가 참여할 수 있습니다.
토큰 원문은 DB에 저장하지 않고 해시로 조회합니다. 초대 링크는 공개 채널에 게시하지 않습니다.
프런트엔드 라우팅 경로는 아직 정하지 않았습니다. `inviteToken`을 읽어 `joinRoom`에 전달하도록 통합 때 정합니다.
초대 재발급은 기존 링크를 폐기하지 않습니다. 탈퇴·강퇴·초대 취소는 현재 범위에 없습니다.

## C 담당 AI 연결

- `sendMessage`는 일반 사용자 메시지만 저장합니다. `type: 'ai'`를 브라우저에서 보내면 거절됩니다.
- Message 타입은 UI 준비를 위해 user/ai/system을 구분합니다. 현재 서버가 생성하는 것은 user뿐이며, AI 메시지의 userId 의미는 요청 사용자로 통일할 예정입니다.
- AI 응답 저장·서버 간 인증·AI 실행 상태는 C의 실제 서버 함수 구조를 확인한 뒤 A가 연결합니다. 현재 완료된 API로 설명하지 않습니다.
- 핀 데이터 형식은 사람/AI가 같습니다. `createPin`은 현재 Cognito로 인증된 요청을 받습니다.
- AI 서버가 ID만 임의로 넣어 호출할 수는 없습니다. 사용자 인증 컨텍스트를 어떻게 전달할지 C와 연결 전에 협의합니다.
- 서버는 방 참여 여부와 타임블록 소속을 검사하지만, 현재 createPin 자체가 카카오 API를 재조회하지는 않습니다.
- C는 실제 카카오 검색 결과에서 장소 ID와 좌표를 확보해야 합니다. 이 백엔드는 장소 검색이나 Bedrock 호출을 구현하지 않습니다.
- 일반 추천만 요청하면 핀을 저장하지 않습니다. 명시한 타임블록 우선, 중복 이름/불명확한 대상은 질문합니다.
- AI가 경로·확정 일정·방문 순서를 임의로 변경하는 기능은 없습니다.

## 오류 처리

오류 메시지는 `CODE: 설명` 형태입니다. 프런트 함수는 Promise를 reject합니다.
`UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `VALIDATION`, `INVALID_INVITE`, `CONFLICT`, `INTERNAL`을 처리합니다.
AppSync/Cognito 연결 자체의 오류는 AWS 라이브러리 오류가 올 수 있습니다.

## 현재 구현 범위와 미완료

구현: Cognito 설정, 방/초대/참여, 자동 여행 날짜, 타임블록/핀 생성·수정, 일반 채팅,
방별 조회 및 구독 권한, 충돌 감지, 생성 재시도 중복 방지, 프런트 연결 함수.

미완료: AWS 실제 배포, 이메일 인증 실제 동작, 두 브라우저 실시간 통합 시험,
AI 응답 저장 연결, 지도·채팅 화면, 삭제/탈퇴/강퇴, 여행 기간 변경, 과거 채팅 페이지, 경로/예산/사진.
전체 방 상태를 조회하는 방식이므로 해커톤의 작은 여행방을 대상으로 합니다. 대규모 데이터는 페이지별 조회로 확장해야 합니다.
