export const isLocalBackend = import.meta.env.DEV && import.meta.env.VITE_LOCAL_BACKEND === 'true'

export async function localRequest<T>(path: string, body?: unknown): Promise<T> {
  if (!isLocalBackend) throw new Error('AI_NOT_CONNECTED: 배포 서버의 AI 연결이 아직 구성되지 않았습니다.')
  const response = await fetch(path, body === undefined ? undefined : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || `서버 오류 (${response.status})`)
  return data as T
}

export const localRoomCall = <T>(operation: string, args: unknown = {}) => localRequest<T>(`/api/room/${operation}`, args)
