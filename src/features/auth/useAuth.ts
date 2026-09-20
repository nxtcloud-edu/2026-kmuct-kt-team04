import { useCallback, useEffect, useState } from 'react'
import { currentUser, logout } from './authService'
import type { AuthUser } from './authService'

interface UseAuth {
  /** 초기 세션 조회 중 여부. */
  loading: boolean
  /** 로그인한 사용자. 미로그인이면 null. */
  user: AuthUser | null
  /** 로그인 성공 후 세션을 다시 조회한다. */
  refresh: () => Promise<void>
  /** 로그아웃한다. */
  signOutUser: () => Promise<void>
}

/** 앱 진입 시 현재 세션을 확인하고 로그인 상태를 관리한다. */
export function useAuth(): UseAuth {
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<AuthUser | null>(null)

  const refresh = useCallback(async () => {
    const found = await currentUser()
    setUser(found)
  }, [])

  useEffect(() => {
    let active = true
    ;(async () => {
      const found = await currentUser()
      if (active) {
        setUser(found)
        setLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [])

  const signOutUser = useCallback(async () => {
    await logout()
    setUser(null)
  }, [])

  return { loading, user, refresh, signOutUser }
}
