import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // 부모 저장소(d:\newsboard)에도 package-lock.json 이 있어 Next 16 turbopack 이
  // 워크스페이스 루트를 부모로 잘못 추론 → 루트의 src/middleware.ts 를 끌어오는 문제 방지.
  // opinion 을 루트로 고정. (Vercel 배포는 opinion 컨텍스트만 올라가 무관하나 로컬 빌드 정합성 위해 명시)
  turbopack: {
    root: __dirname,
  },
}

export default nextConfig
