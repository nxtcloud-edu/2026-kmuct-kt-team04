/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 로컬 연결 시험 활성화. 비밀 키는 브라우저 환경변수로 제공하지 않습니다. */
  readonly VITE_LOCAL_BACKEND?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
