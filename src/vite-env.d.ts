/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 로컬 연결 시험 활성화. 비밀 키는 브라우저 환경변수로 제공하지 않습니다. */
  readonly VITE_LOCAL_BACKEND?: string
  /** Kakao Maps JavaScript SDK 공개 키. */
  readonly VITE_KAKAO_JS_KEY?: string
  /** AWS 방 데이터를 지도에 연결할 때 사용하는 어댑터 모드. */
  readonly VITE_ROOM_ADAPTER?: 'demo' | 'live'
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
