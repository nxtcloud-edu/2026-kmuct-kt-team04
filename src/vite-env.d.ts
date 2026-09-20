/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** OpenAI(ChatGPT) API 키. .env.local에 설정. */
  readonly VITE_OPENAI_API_KEY?: string
  /** 카카오 로컬 검색 REST 키. .env.local에 설정. */
  readonly VITE_KAKAO_REST_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
