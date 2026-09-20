# B(지도·일정) → A·C 전달 사항

B의 지도·일정 기능을 `src/features/travel-map/`에 구현했습니다.
공통 파일(`shared/contracts.ts`, `src/lib/backend.ts`, `shared/example-room-state.ts`, `amplify/`, `src/App.tsx`)은 수정하지 않았습니다.
현재는 임시(demo) 데이터 모드로 동작하며, 화면 상단에 "임시 데이터 모드" 배너를 표시합니다.

## 지금 동작 방식 (임시 모드)

- `shared/example-room-state.ts`의 `exampleRoomState`를 깊은 복제해 브라우저 메모리에서만 사용합니다. 원본은 수정하지 않습니다.
- 타임블록 생성/수정, 핀 생성, 핀 메모(제목·카테고리·메모·상태) 수정이 로컬 상태에 반영됩니다. 새로고침하면 사라집니다.
- 장소 검색은 Mock 결과(부산 인근 고정 예시)입니다. 실제 검색이 아닙니다.

## A에게 (백엔드·통합)

1. **실제 연결 전환**
   - `configureBackend(amplify_outputs.json)`을 앱 진입점에서 1회 호출해 주세요. (B는 진입점/App.tsx를 건드리지 않았습니다.)
   - 배포 후 `.env`에 `VITE_ROOM_ADAPTER=live`를 설정하면 `liveRoomAdapter`가 `roomApi`/`watchRoom`에 위임합니다. 기본값은 `demo`입니다.
   - 연결 지점: `src/features/travel-map/lib/roomAdapter.ts`(모드 선택), `liveRoomAdapter.ts`(위임).

2. **roomId 주입**
   - `TravelMapPanel`은 `roomId` prop을 받습니다. 없으면 임시 모드에서 `exampleRoomState.room.id`를 사용합니다.
   - 통합 시 방 선택/생성 결과의 실제 `roomId`를 `<TravelMapPanel roomId={...} />`로 전달해 주세요.

3. **deletePin (계약에 없음 → B가 구현하지 않음)**
   - 현재 계약/`roomApi`에 `deletePin`이 없어 삭제 기능은 만들지 않았습니다.
   - 어댑터에 이름만 두고 호출 시 `NOT_IMPLEMENTED` 에러를 던지며, 메모 팝업의 삭제 버튼은 비활성 상태입니다.
   - 백엔드에 `deletePin`이 추가되면 알려주세요. `roomApi.deletePin` 시그니처에 맞춰 어댑터와 UI를 연결하겠습니다.
   - 표시 위치(TODO): `roomAdapter.ts`, `liveRoomAdapter.ts`, `demoRoomAdapter.ts`, `components/PinMemoPopup.tsx`.

4. **핀 이동 불가 확인**
   - `updatePin`이 `timeBlockId`를 바꾸지 않으므로, 핀을 다른 타임블록으로 옮기는 기능은 만들지 않았습니다.
   - 핀 이동이 필요하면 계약 변경 협의가 필요합니다. 현재는 요청하지 않습니다.

5. **updatePin 입력 규칙 확인 요청**
   - 메모 저장 시 `title/description/category/status/expectedVersion`을 모두 전송합니다(편집 안 한 값도 현재 값 포함).
   - `expectedVersion`으로 읽어둔 `version`을 보내며, `CONFLICT` 시 자동 덮어쓰기하지 않고 오류를 표시합니다. 이 처리 방식이 서버 기대와 맞는지 확인 부탁드립니다.

## C에게 (채팅·AI·장소 검색)

1. **장소 검색 API 연결 (가장 중요)**
   - 브라우저에서 카카오 REST 키를 사용하지 않았습니다. `.env`에도 `VITE_KAKAO_REST_KEY`를 넣지 않았습니다.
   - 실제 키워드 검색은 C의 서버 API로 처리하도록 인터페이스만 만들어 두었습니다.
   - 연결 지점(TODO): `src/features/travel-map/services/placeSearch.ts`의 `createPlaceSearchService()`와 `MockPlaceSearchService`.
   - C 서비스가 반환해야 하는 형태(`PlaceSearchResult`):
     - `title`, `latitude`, `longitude`, `placeProvider: 'kakao'`, `placeId`(카카오 place id, 필수), `category?`, `address?`
     - `placeId`와 좌표가 없으면 `createPin(placeProvider:'kakao')`이 계약 검증(카카오 장소 ID 필수)을 통과하지 못합니다.
   - 카카오 REST 키는 서버에만 두고, 브라우저는 C의 엔드포인트만 호출하는 구조로 협의하고 싶습니다.

2. **핀 데이터 형식 공유**
   - B가 검색 결과로 핀을 만들 때 `placeProvider:'kakao'` + `placeId`를 그대로 사용합니다.
   - AI가 핀을 만들 때도 같은 형식(좌표·placeId)을 맞춰 주세요. 형식은 사람/AI 동일합니다.

3. **핀 상태(candidate/confirmed) 변경 주의**
   - 확정 여부(`status`)는 메모 팝업에서 사용자가 명시적으로 바꿀 때만 반영합니다.
   - AI가 확정 여부를 임의로 바꾸지 않도록, C 쪽에서도 사용자 의도 확인 후에만 `status`를 변경해 주세요.

## B가 직접 확인할 것 (참고)

- 이 저장소에서 `npm install` 후 `npm run build`(= `tsc -b && vite build`)로 타입/빌드 검증. (작업 환경에 Node가 없어 B가 실행해야 함)
- `.env`에 발급한 `VITE_KAKAO_JS_KEY`를 넣고, 카카오 개발자 콘솔에 사용할 도메인 등록.
- `App.tsx`에 `TravelMapPanel`을 붙이는 것은 통합 담당 영역이라 B가 임의로 넣지 않았습니다. 통합 시 조율 필요.

## 파일 구조

```
src/features/travel-map/
├─ TravelMapPanel.tsx          진입 컴포넌트 (임시모드 배너 + 레이아웃 조립)
├─ types/kakao.d.ts            Kakao Maps SDK 최소 타입
├─ lib/
│  ├─ kakaoLoader.ts           JS 키로 SDK 로드 (REST 키 미사용)
│  ├─ roomAdapter.ts           어댑터 인터페이스 + demo/live 선택
│  ├─ demoRoomAdapter.ts       exampleRoomState 기반 임시 상태
│  └─ liveRoomAdapter.ts       roomApi/watchRoom 위임 (배포 후)
├─ services/placeSearch.ts     검색 인터페이스 + Mock (C 연결 TODO)
├─ hooks/
│  ├─ useRoomData.ts           방 상태 로드/구독 + 액션 래핑
│  ├─ useMapSelection.ts       선택 날짜/타임블록 (서버 비저장 화면 상태)
│  └─ useKakaoMap.ts           지도 생성/마커 렌더·클릭
└─ components/
   ├─ MapView.tsx
   ├─ ScheduleSidebar.tsx
   ├─ TimeBlockForm.tsx
   ├─ PlaceSearchPanel.tsx
   └─ PinMemoPopup.tsx
```
