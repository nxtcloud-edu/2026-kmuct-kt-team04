2026년 국민대학교 캠퍼스타운 키로톤 04팀 문창동호회 레포지토리입니다.

## 현재 상태

React + Vite + TypeScript 공통 프로젝트와 Amplify Gen 2 백엔드 초안입니다.
백엔드 코드: Cognito 이메일 로그인 설정, 여행방/초대/참여, 날짜 자동 생성, 타임블록/핀 생성·수정,
일반 채팅 저장, 방별 접근·실시간 구독 권한, 동시 수정 충돌 감지 및 중복 생성 방지.
AWS 실제 배포와 두 사용자 실시간 통합 검증은 아직 하지 않았습니다.
현재 화면은 실행 확인용입니다. 지도·일정·채팅·AI 화면 및 Bedrock 연동은 포함하지 않습니다.
Tailwind CSS는 아직 설치하지 않았습니다.

- 팀원 B·C: [백엔드 연결 규격과 사용 예시](docs/BACKEND-CONTRACT.md)
- 팀원 A: [AWS 배포 및 통합 검증 절차](docs/DEPLOYMENT.md)
- 공통 타입: `shared/contracts.ts`
- 화면 개발용 예시: `shared/example-room-state.ts`
- 프런트 연결 함수: `src/lib/backend.ts`

## 로컬 실행

Node.js 24 LTS와 npm을 사용합니다.

```sh
npm ci
npm run dev
```

터미널에 표시되는 로컬 주소로 접속합니다.

```sh
npm run lint
npm run check:backend
npm test
npm run check:infra
npm run build
npm run preview
```

`build`는 TypeScript 검사 후 배포용 파일을 `dist`에 생성합니다.
`preview`는 빌드 결과를 로컬에서 확인하는 용도입니다.

## 협업 범위

- A: 공통 서버, 로그인, 여행방, DB, 실시간 동기화, 접근 권한, 배포
- B: 지도 및 일정 화면
- C: 공동 채팅 및 AI

A가 백엔드 초안으로 공통 데이터 필드와 연결 함수를 먼저 제시했습니다.
B·C는 위 연결 문서를 기준으로 초안을 작성하고, 필요한 변경은 A와 협의해 함께 반영합니다.
다른 담당자의 코드나 공통 설정을 변경하기 전에 작업 범위를 조율합니다.
통합·배포 브랜치와 화면 조립 담당도 팀에서 합의해야 합니다.

## AWS 배포 준비

대회 지정 리전은 버지니아 북부(`us-east-1`)입니다. 아직 Amplify 앱이나 백엔드는 연결하지 않았습니다.
`amplify.yml`에 백엔드 검증·배포와 프런트 빌드를 함께 설정했습니다.
프런트 산출물 폴더는 `dist`입니다. 콘솔에서 우리 저장소·브랜치와 서비스 역할을 연결해야 실제 배포됩니다.
`check:infra`는 가상 계정 값으로 로컬 템플릿을 생성하는 검증이며 AWS 리소스를 생성하지 않습니다.

API 비밀 키와 AWS 인증정보는 Git에 저장하지 않습니다.
`VITE_`로 시작하는 환경변수는 브라우저에 공개되므로 서버 비밀 키를 넣지 않습니다.
