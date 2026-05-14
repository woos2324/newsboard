'use client'

import { useState } from 'react'
import { Editorial, MediaStance } from '@/lib/queries'
import TodayTab from './TodayTab'
import StanceTab from './StanceTab'
import TrendTab from './TrendTab'

type Tab = 'today' | 'stance' | 'trend'

const TABS: { key: Tab; label: string }[] = [
  { key: 'today', label: '오늘의 사설' },
  { key: 'stance', label: '성향 비교' },
  { key: 'trend', label: '세계일보 트렌드' },
]

export default function EditorialClient({
  todayEditorials,
  mediaStances,
  segyeEditorials,
  today,
}: {
  todayEditorials: Editorial[]
  mediaStances: MediaStance[]
  segyeEditorials: Editorial[]
  today: string
}) {
  const [tab, setTab] = useState<Tab>('today')

  return (
    <>
      <div className="border-b border-gray-200 mb-6">
        <div className="flex gap-0">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-5 py-3 text-sm border-b-2 transition-all ${
                tab === t.key
                  ? 'border-blue-700 text-blue-800 font-semibold'
                  : 'border-transparent text-gray-600 hover:text-gray-800'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'today' && <TodayTab editorials={todayEditorials} date={today} />}
      {tab === 'stance' && <StanceTab mediaStances={mediaStances} />}
      {tab === 'trend' && <TrendTab editorials={segyeEditorials} />}
    </>
  )
}
