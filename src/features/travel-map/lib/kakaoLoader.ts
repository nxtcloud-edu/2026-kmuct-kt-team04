import type { KakaoMapsNamespace } from '../types/kakao'

// Kakao Maps SDK를 JavaScript 키로 1회 로드합니다.
// - REST 키는 브라우저에서 사용하지 않습니다. 이 파일은 지도 SDK(JS 키)만 다룹니다.
// - autoload=false 로 로드한 뒤 kakao.maps.load(cb) 콜백에서 준비 완료를 보장합니다.

const SDK_SRC = (jsKey: string) =>
  `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${jsKey}&autoload=false`

let loadPromise: Promise<KakaoMapsNamespace> | null = null

export function getKakaoJsKey(): string | undefined {
  return import.meta.env.VITE_KAKAO_JS_KEY as string | undefined
}

/**
 * Kakao Maps SDK를 로드하고 준비된 maps 네임스페이스를 반환합니다.
 * 여러 번 호출해도 스크립트는 한 번만 추가됩니다.
 */
export function loadKakaoMaps(): Promise<KakaoMapsNamespace> {
  if (loadPromise) return loadPromise

  loadPromise = new Promise<KakaoMapsNamespace>((resolve, reject) => {
    const jsKey = getKakaoJsKey()
    if (!jsKey) {
      reject(new Error('KAKAO_JS_KEY_MISSING: VITE_KAKAO_JS_KEY가 설정되지 않았습니다. .env를 확인하세요.'))
      return
    }

    // 이미 로드된 경우(HMR 등) 재사용
    if (window.kakao?.maps) {
      window.kakao.maps.load(() => resolve(window.kakao!.maps!))
      return
    }

    const existing = document.querySelector<HTMLScriptElement>('script[data-kakao-sdk="true"]')
    const script = existing ?? document.createElement('script')

    const onReady = () => {
      if (!window.kakao?.maps) {
        reject(new Error('KAKAO_SDK_LOAD_FAILED: SDK 로드 후 kakao.maps를 찾을 수 없습니다.'))
        return
      }
      window.kakao.maps.load(() => resolve(window.kakao!.maps!))
    }

    if (!existing) {
      script.src = SDK_SRC(jsKey)
      script.async = true
      script.dataset.kakaoSdk = 'true'
      script.addEventListener('load', onReady)
      script.addEventListener('error', () =>
        reject(new Error('KAKAO_SDK_LOAD_FAILED: SDK 스크립트를 불러오지 못했습니다. JS 키/도메인 등록을 확인하세요.')),
      )
      document.head.appendChild(script)
    } else {
      onReady()
    }
  })

  // 실패 시 다음 호출에서 다시 시도할 수 있도록 캐시를 비웁니다.
  loadPromise.catch(() => {
    loadPromise = null
  })

  return loadPromise
}
