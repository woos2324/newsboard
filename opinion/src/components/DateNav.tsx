'use client'

import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useRef, useEffect } from 'react'

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

function toDateStr(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function CalendarPopup({
  date,
  today,
  onSelect,
  onClose,
}: {
  date: string
  today: string
  onSelect: (d: string) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [year, setYear] = useState(() => parseInt(date.slice(0, 4)))
  const [month, setMonth] = useState(() => parseInt(date.slice(5, 7)))

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  function prevMonth() {
    if (month === 1) { setYear(y => y - 1); setMonth(12) } else setMonth(m => m - 1)
  }
  function nextMonth() {
    const todayYear = parseInt(today.slice(0, 4))
    const todayMonth = parseInt(today.slice(5, 7))
    if (year > todayYear || (year === todayYear && month >= todayMonth)) return
    if (month === 12) { setYear(y => y + 1); setMonth(1) } else setMonth(m => m + 1)
  }

  const todayYear = parseInt(today.slice(0, 4))
  const todayMonth = parseInt(today.slice(5, 7))
  const isNextDisabled = year > todayYear || (year === todayYear && month >= todayMonth)

  // 달력 날짜 계산
  const firstDay = new Date(year, month - 1, 1).getDay() // 0=일
  const daysInMonth = new Date(year, month, 0).getDate()
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  // 6주 채우기
  while (cells.length % 7 !== 0) cells.push(null)

  const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

  return (
    <div
      ref={ref}
      className="absolute z-50 top-full mt-2 left-1/2 -translate-x-1/2 bg-white rounded-2xl shadow-xl border border-gray-200 p-4 w-72"
    >
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={prevMonth}
          className="p-1 rounded-lg hover:bg-gray-100 text-gray-500"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2">
          <span className="font-bold text-gray-800">{year}.{String(month).padStart(2, '0')}</span>
          <button
            onClick={() => {
              setYear(todayYear)
              setMonth(todayMonth)
            }}
            className="text-xs px-2 py-0.5 rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50"
          >
            오늘
          </button>
        </div>

        <button
          onClick={nextMonth}
          disabled={isNextDisabled}
          className={`p-1 rounded-lg ${isNextDisabled ? 'text-gray-200 cursor-not-allowed' : 'hover:bg-gray-100 text-gray-500'}`}
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* 요일 헤더 */}
      <div className="grid grid-cols-7 mb-1">
        {WEEKDAYS.map((w, i) => (
          <div
            key={w}
            className={`text-center text-xs font-medium py-1 ${i === 0 ? 'text-red-500' : 'text-gray-400'}`}
          >
            {w}
          </div>
        ))}
      </div>

      {/* 날짜 그리드 */}
      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((day, idx) => {
          if (!day) return <div key={idx} />

          const dateStr = toDateStr(year, month, day)
          const isFuture = dateStr > today
          const isSelected = dateStr === date
          const isToday = dateStr === today
          const isSunday = idx % 7 === 0

          return (
            <button
              key={idx}
              disabled={isFuture}
              onClick={() => { onSelect(dateStr); onClose() }}
              className={`
                mx-auto flex items-center justify-center w-8 h-8 rounded-full text-sm transition-colors
                ${isSelected ? 'bg-blue-600 text-white font-bold' : ''}
                ${!isSelected && isToday ? 'text-red-500 font-bold hover:bg-gray-100' : ''}
                ${!isSelected && !isToday && isFuture ? 'text-gray-300 cursor-not-allowed' : ''}
                ${!isSelected && !isToday && !isFuture && isSunday ? 'text-red-400 hover:bg-gray-100' : ''}
                ${!isSelected && !isToday && !isFuture && !isSunday ? 'text-gray-700 hover:bg-gray-100' : ''}
              `}
            >
              {day}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function DateNav({
  date,
  today,
  basePath = '/',
}: {
  date: string
  today: string
  basePath?: string
}) {
  const router = useRouter()
  const [isCalendarOpen, setIsCalendarOpen] = useState(false)
  const isToday = date >= today

  function go(target: string) {
    if (target >= today) {
      router.push(basePath)
    } else {
      const sep = basePath.includes('?') ? '&' : '?'
      router.push(`${basePath}${sep}date=${target}`)
    }
  }

  return (
    <div className="relative flex items-center justify-center gap-3 mb-6">
      <button
        onClick={() => go(shiftDate(date, -1))}
        className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
        aria-label="이전 날"
      >
        <ChevronLeft className="w-5 h-5" />
      </button>

      <div className="flex items-center gap-2 select-none">
        <span className="text-base font-bold text-gray-800">{formatEditionDate(date)}</span>
        <button
          onClick={() => setIsCalendarOpen(o => !o)}
          className="p-0.5 rounded hover:bg-gray-100 transition-colors"
          aria-label="달력 열기"
        >
          <Calendar className="w-4 h-4 text-blue-600" />
        </button>
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

      {isCalendarOpen && (
        <CalendarPopup
          date={date}
          today={today}
          onSelect={go}
          onClose={() => setIsCalendarOpen(false)}
        />
      )}
    </div>
  )
}
