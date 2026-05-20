'use client'

import { Calendar, Menu } from 'lucide-react'
import { useEffect, useState, Suspense } from 'react'
import SearchBar from './SearchBar'

function formatDateTime(date: Date): string {
  const month = date.getMonth() + 1
  const day = date.getDate()
  const weekday = ['일', '월', '화', '수', '목', '금', '토'][date.getDay()]
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${month}월 ${day}일 (${weekday}) ${hours}:${minutes}`
}

export default function OpinionTopbar({ onMenuOpen }: { onMenuOpen?: () => void }) {
  const [datetime, setDatetime] = useState<string | null>(null)

  useEffect(() => {
    setDatetime(formatDateTime(new Date()))
    const timer = setInterval(() => setDatetime(formatDateTime(new Date())), 60000)
    return () => clearInterval(timer)
  }, [])

  return (
    <header className="sticky top-0 z-10 flex h-14 items-center gap-4 border-b border-gray-200 bg-white/80 px-6 backdrop-blur">
      <button
        type="button"
        onClick={onMenuOpen}
        aria-label="메뉴 열기"
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white hover:bg-gray-50 lg:hidden"
      >
        <Menu className="h-4 w-4" />
      </button>
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Calendar className="h-4 w-4" />
        <span>{datetime ?? ''}</span>
      </div>
      <div className="ml-auto">
        <Suspense fallback={<div className="h-9 w-80" />}>
          <SearchBar />
        </Suspense>
      </div>
    </header>
  )
}
