'use client'

import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react'
import { useRouter } from 'next/navigation'

function formatEditionDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00+09:00')
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const weekday = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()]
  return `${year}.${month}.${day}.${weekday}`
}

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00+09:00')
  d.setDate(d.getDate() + days)
  return d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
}

export default function DateNav({ date, today }: { date: string; today: string }) {
  const router = useRouter()
  const isToday = date >= today

  function go(target: string) {
    if (target >= today) {
      router.push('/')
    } else {
      router.push(`/?date=${target}`)
    }
  }

  return (
    <div className="flex items-center justify-center gap-3 mb-6">
      <button
        onClick={() => go(shiftDate(date, -1))}
        className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
        aria-label="이전 날"
      >
        <ChevronLeft className="w-5 h-5" />
      </button>

      <div className="flex items-center gap-2 select-none">
        <span className="text-base font-bold text-gray-800">{formatEditionDate(date)}</span>
        <Calendar className="w-4 h-4 text-blue-600" />
      </div>

      <button
        onClick={() => go(shiftDate(date, 1))}
        disabled={isToday}
        className={`p-1.5 rounded-lg transition-colors ${
          isToday ? 'text-gray-300 cursor-not-allowed' : 'hover:bg-gray-100 text-gray-500'
        }`}
        aria-label="다음 날"
      >
        <ChevronRight className="w-5 h-5" />
      </button>
    </div>
  )
}
