import type { Metadata } from 'next'
import './globals.css'
import OpinionShell from '@/components/OpinionShell'

export const metadata: Metadata = {
  title: '사설 분석 — 세계일보 논설실',
  description: '주요 언론사 사설 수집 · AI 성향 분석 · 비교',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className="h-full">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-full bg-gray-50 text-gray-900 antialiased">
        <OpinionShell>{children}</OpinionShell>
      </body>
    </html>
  )
}
