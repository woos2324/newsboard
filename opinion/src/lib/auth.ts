// Edge(middleware)·Node(Server Action) 양쪽에서 동작하는 공용 인증 유틸.
// Web Crypto 기반(Buffer 미사용) — 공용 계정 1개 + HMAC 서명 세션 쿠키.
//
// 필요한 환경변수 (Vercel opinion 프로젝트):
//   OPINION_AUTH_USER   — 공용 로그인 아이디
//   OPINION_AUTH_PASS   — 공용 로그인 비밀번호
//   OPINION_AUTH_SECRET — 세션 토큰 HMAC 서명 시크릿(랜덤 긴 문자열). 변경 시 전원 재로그인.

export const SESSION_COOKIE = 'op_session'

// 토큰 payload (단일 공용 계정이므로 고정 메시지를 시크릿으로 서명한 값이 곧 토큰).
const TOKEN_MESSAGE = 'opinion-shared-session-v1'

function bufToHex(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let hex = ''
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0')
  return hex
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))
  return bufToHex(sig)
}

/** 환경변수 시크릿으로 세션 토큰 계산. 시크릿 미설정 시 null. */
export async function expectedToken(): Promise<string | null> {
  const secret = process.env.OPINION_AUTH_SECRET
  if (!secret) return null
  return hmacHex(secret, TOKEN_MESSAGE)
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** 쿠키 토큰이 유효한지 검증 (상수시간 비교). */
export async function verifyToken(token: string | undefined | null): Promise<boolean> {
  if (!token) return false
  const expected = await expectedToken()
  if (!expected) return false
  return timingSafeEqual(token, expected)
}

/** 공용 ID/PW 검증. 환경변수 미설정 시 항상 실패. */
export function checkCredentials(user: string, pass: string): boolean {
  const U = process.env.OPINION_AUTH_USER
  const P = process.env.OPINION_AUTH_PASS
  if (!U || !P) return false
  return user === U && pass === P
}
