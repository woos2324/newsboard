'use client'

import { useState, useMemo } from 'react'
import { Editorial, getEditorialById } from '@/lib/queries'
import EditorialModal from './EditorialModal'
import DateNav from './DateNav'

type Period = 'week' | 'month'

const STANCE_COLORS: Record<string, string> = {
  진보: 'bg-blue-100 text-blue-700',
  중도진보: 'bg-blue-50 text-blue-600',
  중립: 'bg-gray-200 text-gray-700',
  중도보수: 'bg-orange-100 text-orange-700',
  보수: 'bg-red-100 text-red-700',
}

const STANCE_BAR_COLORS: Record<string, string> = {
  진보: 'bg-blue-400',
  중도진보: 'bg-blue-300',
  중립: 'bg-gray-300',
  중도보수: 'bg-orange-300',
  보수: 'bg-red-300',
}

const STANCE_ORDER = ['보수', '중도보수', '중립', '중도진보', '진보']

const STANCE_TEXT_COLORS: Record<string, string> = {
  보수: 'text-red-600',
  중도보수: 'text-orange-600',
  중립: 'text-gray-700',
  중도진보: 'text-blue-500',
  진보: 'text-blue-700',
}

const TOPIC_COLORS = ['bg-purple-500', 'bg-green-500', 'bg-blue-500', 'bg-yellow-500', 'bg-red-400', 'bg-indigo-400']

function getWeekStart(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const day = d.getDay()
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1))
  return d
}

function getMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function toDateStr(date: Date): string {
  return date.toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
}

function formatEditionDate(dateStr: string | null) {
  if (!dateStr) return ''
  return dateStr.replace(/-/g, '.')
}

function getMajorStance(items: Editorial[]) {
  const counts = new Map<string, number>()
  for (const e of items) {
    if (e.stance_label) counts.set(e.stance_label, (counts.get(e.stance_label) ?? 0) + 1)
  }
  const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])
  return sorted.length > 0 ? { label: sorted[0][0], count: sorted[0][1], total: items.length } : null
}

function getTopTopic(items: Editorial[]) {
  const counts = new Map<string, number>()
  for (const e of items) {
    const t = e.topic ?? '기타'
    counts.set(t, (counts.get(t) ?? 0) + 1)
  }
  const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])
  return sorted.length > 0 ? { topic: sorted[0][0], count: sorted[0][1], total: items.length } : null
}

export default function TrendTab({ editorials, selectedDate, today }: { editorials: Editorial[]; selectedDate: string; today: string }) {
  const [period, setPeriod] = useState<Period>('week')
  const [selected, setSelected] = useState<Editorial | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  async function openModal(item: Editorial) {
    setSelected(item)
    setDetailLoading(true)
    try {
      const full = await getEditorialById(item.editorial_id)
      if (full) setSelected(full)
    } finally {
      setDetailLoading(false)
    }
  }

  const { currentItems, prevItems, chartData, topicDist } = useMemo(() => {
    const now = new Date()

    if (period === 'week') {
      const currentMonday = getWeekStart(now)
      const prevMonday = new Date(currentMonday)
      prevMonday.setDate(prevMonday.getDate() - 7)
      const currentMondayStr = toDateStr(currentMonday)
      const prevMondayStr = toDateStr(prevMonday)

      const currentItems = editorials.filter(e => e.edition_date && e.edition_date >= currentMondayStr)
      const prevItems = editorials.filter(e => {
        if (!e.edition_date) return false
        return e.edition_date >= prevMondayStr && e.edition_date < currentMondayStr
      })

      // 최근 5주 차트 데이터
      const weeks: { start: Date; label: string; isCurrent: boolean }[] = []
      for (let i = 4; i >= 0; i--) {
        const start = new Date(currentMonday)
        start.setDate(start.getDate() - i * 7)
        const m = start.getMonth() + 1
        const d = start.getDate()
        weeks.push({ start, label: i === 0 ? '이번주' : `${m}/${d}`, isCurrent: i === 0 })
      }

      const chartData = weeks.map(({ start, label, isCurrent }, idx) => {
        const startStr = toDateStr(start)
        const endStr = idx < 4 ? toDateStr(weeks[idx + 1].start) : '9999-99-99'
        const items = editorials.filter(e => {
          if (!e.edition_date) return false
          return e.edition_date >= startStr && e.edition_date < endStr
        })
        const stanceCounts: Record<string, number> = {}
        for (const e of items) {
          if (e.stance_label) stanceCounts[e.stance_label] = (stanceCounts[e.stance_label] ?? 0) + 1
        }
        return { label, isCurrent, total: items.length, stanceCounts }
      })

      const topicMap = new Map<string, number>()
      for (const e of currentItems) {
        const t = e.topic ?? '기타'
        topicMap.set(t, (topicMap.get(t) ?? 0) + 1)
      }
      const topicDist = Array.from(topicMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5)

      return { currentItems, prevItems, chartData, topicDist }
    } else {
      const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
      const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const currentMonthStr = toDateStr(currentMonthStart)
      const prevMonthStr = toDateStr(prevMonthStart)

      const currentItems = editorials.filter(e => e.edition_date && e.edition_date >= currentMonthStr)
      const prevItems = editorials.filter(e => {
        if (!e.edition_date) return false
        return e.edition_date >= prevMonthStr && e.edition_date < currentMonthStr
      })

      // 최근 5개월 차트 데이터
      const months: { start: Date; key: string; label: string; isCurrent: boolean }[] = []
      for (let i = 4; i >= 0; i--) {
        const start = new Date(now.getFullYear(), now.getMonth() - i, 1)
        months.push({ start, key: getMonthKey(start), label: `${start.getMonth() + 1}월`, isCurrent: i === 0 })
      }

      const chartData = months.map(({ start, label, isCurrent }, idx) => {
        const startStr = toDateStr(start)
        const endStr = idx < 4 ? toDateStr(months[idx + 1].start) : '9999-99-99'
        const items = editorials.filter(e => {
          if (!e.edition_date) return false
          return e.edition_date >= startStr && e.edition_date < endStr
        })
        const stanceCounts: Record<string, number> = {}
        for (const e of items) {
          if (e.stance_label) stanceCounts[e.stance_label] = (stanceCounts[e.stance_label] ?? 0) + 1
        }
        return { label, isCurrent, total: items.length, stanceCounts }
      })

      const topicMap = new Map<string, number>()
      for (const e of currentItems) {
        const t = e.topic ?? '기타'
        topicMap.set(t, (topicMap.get(t) ?? 0) + 1)
      }
      const topicDist = Array.from(topicMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5)

      return { currentItems, prevItems, chartData, topicDist }
    }
  }, [editorials, period])

  if (editorials.length === 0) {
    return (
      <div className="text-center py-20 text-gray-400">
        <p className="text-sm">분석된 세계일보 사설이 없습니다.</p>
        <p className="text-xs mt-1">수집 후 AI 분석이 완료되면 자동으로 표시됩니다.</p>
      </div>
    )
  }

  const periodLabel = period === 'week' ? '주' : '달'
  const majorStance = getMajorStance(currentItems)
  const topTopic = getTopTopic(currentItems)
  const diff = currentItems.length - prevItems.length
  const maxChartTotal = Math.max(...chartData.map(d => d.total), 1)
  // 사설 목록은 선택한 날짜만 필터 (통계/차트는 위에서 90일 전체 기준 그대로 유지)
  const listItems = editorials.filter(e => e.edition_date === selectedDate)

  return (
    <div>
      {/* 주간/월간 토글 */}
      <div className="flex items-center gap-1 mb-5 bg-gray-100 rounded-lg p-1 w-fit">
        <button
          onClick={() => setPeriod('week')}
          className={`text-xs px-4 py-1.5 rounded-md transition-all ${period === 'week' ? 'bg-white text-blue-700 font-semibold shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
        >
          주간
        </button>
        <button
          onClick={() => setPeriod('month')}
          className={`text-xs px-4 py-1.5 rounded-md transition-all ${period === 'month' ? 'bg-white text-blue-700 font-semibold shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
        >
          월간
        </button>
      </div>

      {/* 통계 카드 3개 */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 mb-1">이번 {periodLabel} 사설</p>
          <p className="text-2xl font-bold text-gray-900">
            {currentItems.length}<span className="text-sm font-normal text-gray-500 ml-1">건</span>
          </p>
          <p className="text-xs text-gray-400 mt-1">
            지난 {periodLabel} 대비{' '}
            <span className={diff > 0 ? 'text-green-600' : diff < 0 ? 'text-red-500' : 'text-gray-400'}>
              {diff > 0 ? `+${diff}` : diff}건
            </span>
          </p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 mb-1">이번 {periodLabel} 주요 성향</p>
          {majorStance ? (
            <>
              <p className={`text-2xl font-bold ${STANCE_TEXT_COLORS[majorStance.label] ?? 'text-gray-700'}`}>
                {majorStance.label}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                전체 {majorStance.total}건 중 {majorStance.count}건 ({Math.round(majorStance.count / majorStance.total * 100)}%)
              </p>
            </>
          ) : (
            <p className="text-2xl font-bold text-gray-300">—</p>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 mb-1">이번 {periodLabel} 최다 주제</p>
          {topTopic ? (
            <>
              <p className="text-2xl font-bold text-gray-900">{topTopic.topic}</p>
              <p className="text-xs text-gray-400 mt-1">
                {topTopic.total}건 중 {topTopic.count}건 ({Math.round(topTopic.count / topTopic.total * 100)}%)
              </p>
            </>
          ) : (
            <p className="text-2xl font-bold text-gray-300">—</p>
          )}
        </div>
      </div>

      {/* 성향 차트 + 주제 분포 */}
      <div className="grid grid-cols-3 gap-6 mb-6">
        {/* 성향 분포 스택드 바차트 */}
        <div className="col-span-2 bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">
            {period === 'week' ? '주간' : '월간'} 성향 분포 추이
          </h3>
          <div className="flex items-end gap-3" style={{ height: '144px' }}>
            {chartData.map((col) => {
              const barHeightPx = maxChartTotal > 0 ? Math.round((col.total / maxChartTotal) * 120) : 0
              return (
                <div key={col.label} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full flex flex-col justify-end" style={{ height: '120px' }}>
                    {col.total === 0 ? (
                      <div className="w-full bg-gray-100 rounded" style={{ height: '4px' }} />
                    ) : (
                      <div
                        className={`w-full flex flex-col overflow-hidden rounded ${col.isCurrent ? 'ring-2 ring-blue-300' : ''}`}
                        style={{ height: `${barHeightPx}px` }}
                      >
                        {STANCE_ORDER.map((stance) => {
                          const count = col.stanceCounts[stance] ?? 0
                          if (count === 0) return null
                          const pct = (count / col.total) * 100
                          return (
                            <div
                              key={stance}
                              className={STANCE_BAR_COLORS[stance]}
                              style={{ height: `${pct}%` }}
                              title={`${stance}: ${count}건`}
                            />
                          )
                        })}
                      </div>
                    )}
                  </div>
                  <span className={`text-xs ${col.isCurrent ? 'text-blue-600 font-semibold' : 'text-gray-400'}`}>
                    {col.label}{col.isCurrent ? ' ●' : ''}
                  </span>
                </div>
              )
            })}
          </div>
          <div className="flex gap-4 mt-3 text-xs text-gray-500 flex-wrap">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-red-300 inline-block" />보수</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-orange-300 inline-block" />중도보수</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-gray-300 inline-block" />중립</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-blue-300 inline-block" />중도진보</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-blue-400 inline-block" />진보</span>
          </div>
        </div>

        {/* 주제 분포 */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">주제 분포 (이번 {periodLabel})</h3>
          {topicDist.length === 0 ? (
            <p className="text-xs text-gray-400 mt-2">이번 {periodLabel} 데이터 없음</p>
          ) : (
            <div className="space-y-3">
              {topicDist.map(([topic, count], i) => {
                const pct = currentItems.length > 0 ? Math.round(count / currentItems.length * 100) : 0
                return (
                  <div key={topic}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-gray-600">{topic}</span>
                      <span className="text-gray-500">{count}건 ({pct}%)</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full">
                      <div
                        className={`h-2 ${TOPIC_COLORS[i % TOPIC_COLORS.length]} rounded-full`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* 날짜 선택 — 아래 사설 목록에만 적용 */}
      <DateNav date={selectedDate} today={today} basePath="/trend" />

      {/* 사설 목록 — 선택한 날짜 */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex justify-between items-center">
          <h3 className="text-sm font-semibold text-gray-700">
            {formatEditionDate(selectedDate)} 세계일보 사설
          </h3>
          <span className="text-xs text-gray-400">{listItems.length}건</span>
        </div>
        {listItems.length === 0 ? (
          <div className="px-5 py-12 text-center text-gray-400">
            <p className="text-sm">이 날짜의 세계일보 사설이 없습니다.</p>
            <p className="text-xs mt-1">날짜를 이동해 다른 날의 사설을 확인하세요.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {listItems.map((e) => (
              <div
                key={e.editorial_id}
                role="button"
                tabIndex={0}
                onClick={() => openModal(e)}
                onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') openModal(e) }}
                className="flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50 cursor-pointer group"
              >
                <span className="text-xs text-gray-400 w-20 flex-shrink-0">{formatEditionDate(e.edition_date)}</span>
                <span className="flex-1 text-sm text-gray-800 truncate group-hover:text-blue-700">{e.title}</span>
                {e.stance_label && (
                  <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${STANCE_COLORS[e.stance_label] ?? 'bg-gray-100 text-gray-600'}`}>
                    {e.stance_label}
                  </span>
                )}
                {e.topic && (
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full flex-shrink-0">{e.topic}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {selected && (
        <EditorialModal
          item={selected}
          onClose={() => setSelected(null)}
          detailLoading={detailLoading}
        />
      )}
    </div>
  )
}
