// Server Action 전용 인증 방어선. next/headers 를 쓰므로 middleware(edge)에서 import 금지.
import { cookies } from 'next/headers'
import { SESSION_COOKIE, verifyToken } from './auth'

/**
 * 쓰기 Server Action 진입 시 호출. 비로그인이면 throw.
 * middleware 가 1차 차단하지만, Server Action 은 직접 POST 가능하므로 2중 방어.
 */
export async function assertAuthed(): Promise<void> {
  const store = await cookies()
  const ok = await verifyToken(store.get(SESSION_COOKIE)?.value)
  if (!ok) throw new Error('인증이 필요합니다. 다시 로그인해주세요.')
}
