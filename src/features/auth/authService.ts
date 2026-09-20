import {
  confirmSignUp,
  getCurrentUser,
  resendSignUpCode,
  signIn,
  signOut,
  signUp,
} from 'aws-amplify/auth'

/** 로그인한 사용자의 최소 정보. */
export interface AuthUser {
  userId: string
  username: string
}

/** 회원가입 결과. 이메일 코드 확인이 필요한지 알려준다. */
export interface SignUpOutcome {
  /** true면 confirmSignUp(코드 확인) 단계가 필요하다. */
  needsConfirmation: boolean
}

/** 로그인 결과. */
export interface SignInOutcome {
  /** 로그인이 완료됐는지. false면 추가 단계(코드 확인 등)가 필요하다. */
  done: boolean
  /** 회원가입 확인이 아직 안 된 경우 true. 코드 확인 화면으로 보낸다. */
  needsConfirmation: boolean
}

export async function registerUser(email: string, password: string): Promise<SignUpOutcome> {
  const result = await signUp({
    username: email,
    password,
    options: { userAttributes: { email } },
  })
  const step = result.nextStep.signUpStep
  return { needsConfirmation: step === 'CONFIRM_SIGN_UP' }
}

export async function confirmUser(email: string, code: string): Promise<void> {
  await confirmSignUp({ username: email, confirmationCode: code })
}

export async function resendCode(email: string): Promise<void> {
  await resendSignUpCode({ username: email })
}

export async function login(email: string, password: string): Promise<SignInOutcome> {
  const result = await signIn({ username: email, password })
  if (result.isSignedIn) return { done: true, needsConfirmation: false }
  const step = result.nextStep.signInStep
  return {
    done: false,
    needsConfirmation: step === 'CONFIRM_SIGN_UP',
  }
}

export async function logout(): Promise<void> {
  await signOut()
}

/** 현재 로그인 사용자를 조회한다. 미로그인 상태면 null. */
export async function currentUser(): Promise<AuthUser | null> {
  try {
    const user = await getCurrentUser()
    return { userId: user.userId, username: user.username }
  } catch {
    return null
  }
}
