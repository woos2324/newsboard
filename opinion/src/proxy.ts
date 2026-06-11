import { NextResponse, type NextRequest } from 'next/server'
import { SESSION_COOKIE, verifyToken } from '@/lib/auth'

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl
  const authed = await verifyToken(req.cookies.get(SESSION_COOKIE)?.value)

  if (pathname === '/login') {
    // 이미 로그인 상태면 홈으로
    if (authed) {
      const url = req.nextUrl.clone()
      url.pathname = '/'
      url.search = ''
      return NextResponse.redirect(url)
    }
    return NextResponse.next()
  }

  if (!authed) {
    const url = req.nextUrl.clone()
    url.pathname = '/login'
    url.search = ''
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  // _next 내부 자원·정적 파일 제외 전 경로 차단
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|css|js|woff2?)).*)',
  ],
}
