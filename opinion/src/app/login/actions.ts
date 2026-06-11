'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { SESSION_COOKIE, checkCredentials, expectedToken } from '@/lib/auth'

export type LoginState = { error: string } | undefined

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const user = String(formData.get('username') ?? '').trim()
  const pass = String(formData.get('password') ?? '')

  if (!checkCredentials(user, pass)) {
    return { error: '아이디 또는 비밀번호가 올바르지 않습니다.' }
  }

  const token = await expectedToken()
  if (!token) {
    return { error: '서버 인증 설정이 누락되었습니다. 관리자에게 문의하세요.' }
  }

  const store = await cookies()
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    // maxAge 없음 → 세션 쿠키 (브라우저 종료 시 만료)
  })

  redirect('/')
}

export async function logoutAction() {
  const store = await cookies()
  store.delete(SESSION_COOKIE)
  redirect('/login')
}
