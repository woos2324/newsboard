'use client'

import { Calendar, Menu, LogOut } from 'lucide-react'
import { useEffect, useState, Suspense } from 'react'
import SearchBar from './SearchBar'
import { logoutAction } from '@/app/login/actions'

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
    <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b border-gray-200 bg-white/80 px-4 backdrop-blur sm:gap-4 sm:px-6">
      <button
        type="button"
        onClick={onMenuOpen}
        aria-label="메뉴 열기"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white hover:bg-gray-50 lg:hidden"
      >
        <Menu className="h-4 w-4" />
      </button>
      <div className="hidden items-center gap-2 text-sm text-gray-500 md:flex">
        <Calendar className="h-4 w-4 shrink-0" />
        <span className="whitespace-nowrap">{datetime ?? ''}</span>
      </div>
      <div className="ml-auto flex min-w-0 items-center gap-2 sm:gap-3">
        <Suspense fallback={<div className="h-9 w-40 sm:w-72" />}>
          <SearchBar />
        </Suspense>
        <form action={logoutAction}>
          <button
            type="submit"
            aria-label="로그아웃"
            title="로그아웃"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-700"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </form>
      </div>
    </header>
  )
}
