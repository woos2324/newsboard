'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import OpinionSidebar from './OpinionSidebar'
import OpinionTopbar from './OpinionTopbar'

export default function OpinionShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const pathname = usePathname()

  // 로그인 페이지는 사이드바/탑바 없이 단독 렌더
  if (pathname === '/login') {
    return <>{children}</>
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <OpinionSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <OpinionTopbar onMenuOpen={() => setSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
