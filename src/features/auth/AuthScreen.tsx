import { useState } from 'react'
import { confirmUser, login, registerUser, resendCode } from './authService'

type Mode = 'signIn' | 'signUp' | 'confirm'

interface AuthScreenProps {
  /** 로그인이 완료되면 호출한다. 상위에서 세션을 새로고침한다. */
  onAuthenticated: () => Promise<void> | void
}

export function AuthScreen({ onAuthenticated }: AuthScreenProps) {
  const [mode, setMode] = useState<Mode>('signIn')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  function resetMessages() {
    setError(null)
    setNotice(null)
  }

  async function handleSignIn(event: React.FormEvent) {
    event.preventDefault()
    resetMessages()
    setBusy(true)
    try {
      const result = await login(email.trim(), password)
      if (result.done) {
        await onAuthenticated()
        return
      }
      if (result.needsConfirmation) {
        setNotice('이메일 인증이 필요합니다. 받은 코드를 입력하세요.')
        setMode('confirm')
      } else {
        setError('추가 인증 단계가 필요합니다. 관리자에게 문의하세요.')
      }
    } catch (err) {
      setError(authMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleSignUp(event: React.FormEvent) {
    event.preventDefault()
    resetMessages()
    setBusy(true)
    try {
      const result = await registerUser(email.trim(), password)
      if (result.needsConfirmation) {
        setNotice('가입 확인 코드를 이메일로 보냈습니다. 코드를 입력하세요.')
        setMode('confirm')
      } else {
        // 확인이 필요 없으면 바로 로그인 시도.
        const signedIn = await login(email.trim(), password)
        if (signedIn.done) await onAuthenticated()
      }
    } catch (err) {
      setError(authMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleConfirm(event: React.FormEvent) {
    event.preventDefault()
    resetMessages()
    setBusy(true)
    try {
      await confirmUser(email.trim(), code.trim())
      // 확인 후 자동 로그인 시도. 비밀번호가 남아 있으면 그대로 로그인.
      if (password) {
        const signedIn = await login(email.trim(), password)
        if (signedIn.done) {
          await onAuthenticated()
          return
        }
      }
      setNotice('인증이 완료됐습니다. 로그인하세요.')
      setMode('signIn')
    } catch (err) {
      setError(authMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleResend() {
    resetMessages()
    setBusy(true)
    try {
      await resendCode(email.trim())
      setNotice('확인 코드를 다시 보냈습니다.')
    } catch (err) {
      setError(authMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="auth" aria-label="로그인 및 회원가입">
      <h1>Pintravle</h1>

      {mode === 'confirm' ? (
        <form className="auth__form" onSubmit={handleConfirm}>
          <h2>이메일 인증</h2>
          <p className="auth__hint">{email}로 보낸 확인 코드를 입력하세요.</p>
          <label htmlFor="auth-code">확인 코드</label>
          <input
            id="auth-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={e => setCode(e.target.value)}
            required
          />
          <button type="submit" disabled={busy || !code.trim()}>확인</button>
          <button type="button" className="auth__link" onClick={handleResend} disabled={busy}>
            코드 다시 보내기
          </button>
          <button type="button" className="auth__link" onClick={() => { resetMessages(); setMode('signIn') }}>
            로그인으로 돌아가기
          </button>
        </form>
      ) : (
        <form className="auth__form" onSubmit={mode === 'signIn' ? handleSignIn : handleSignUp}>
          <h2>{mode === 'signIn' ? '로그인' : '회원가입'}</h2>
          <label htmlFor="auth-email">이메일</label>
          <input
            id="auth-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
          />
          <label htmlFor="auth-password">비밀번호</label>
          <input
            id="auth-password"
            type="password"
            autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            minLength={8}
          />
          <button type="submit" disabled={busy || !email.trim() || !password}>
            {mode === 'signIn' ? '로그인' : '가입하기'}
          </button>
          <button
            type="button"
            className="auth__link"
            onClick={() => { resetMessages(); setMode(mode === 'signIn' ? 'signUp' : 'signIn') }}
          >
            {mode === 'signIn' ? '계정이 없으신가요? 회원가입' : '이미 계정이 있으신가요? 로그인'}
          </button>
        </form>
      )}

      {error && <p className="auth__error" role="alert">{error}</p>}
      {notice && <p className="auth__notice">{notice}</p>}
    </section>
  )
}

/** Amplify/Cognito 오류를 한국어 안내로 다듬는다. */
function authMessage(error: unknown): string {
  if (!(error instanceof Error)) return '알 수 없는 오류가 발생했습니다.'
  const name = (error as { name?: string }).name ?? ''
  switch (name) {
    case 'UserAlreadyExistsException':
      return '이미 가입된 이메일입니다. 로그인해 주세요.'
    case 'UsernameExistsException':
      return '이미 가입된 이메일입니다. 로그인해 주세요.'
    case 'NotAuthorizedException':
      return '이메일 또는 비밀번호가 올바르지 않습니다.'
    case 'UserNotConfirmedException':
      return '이메일 인증이 완료되지 않았습니다. 확인 코드를 입력하세요.'
    case 'CodeMismatchException':
      return '확인 코드가 올바르지 않습니다.'
    case 'ExpiredCodeException':
      return '확인 코드가 만료됐습니다. 코드를 다시 요청하세요.'
    case 'InvalidPasswordException':
      return '비밀번호가 정책에 맞지 않습니다. 더 복잡하게 설정하세요.'
    case 'UserNotFoundException':
      return '가입된 계정을 찾을 수 없습니다.'
    default:
      return error.message || '요청을 처리하지 못했습니다.'
  }
}
