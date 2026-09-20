import { configureBackend } from './backend'

/**
 * 배포 후 생성되는 amplify_outputs.json을 있으면 로드해 백엔드를 설정한다.
 * 파일이 없으면(배포 전) 설정하지 않고 false를 반환한다.
 *
 * 정적 import는 파일이 없을 때 빌드를 깨뜨리므로(문서 명시), Vite의 glob import로
 * 선택적으로 읽는다. eager: false → 파일이 있을 때만 번들에 포함된다.
 */
const outputsModules = import.meta.glob('../../amplify_outputs.json')

export async function bootstrapBackend(): Promise<boolean> {
  const entries = Object.values(outputsModules)
  if (entries.length === 0) return false
  try {
    const mod = (await entries[0]()) as { default: Parameters<typeof configureBackend>[0] }
    configureBackend(mod.default)
    return true
  } catch {
    return false
  }
}
