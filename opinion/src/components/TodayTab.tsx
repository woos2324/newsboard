'use client'

import { Editorial } from '@/lib/queries'
import { ExternalLink } from 'lucide-react'

const STANCE_COLORS: Record<string, string> = {
  진보: 'bg-blue-100 text-blue-700',
  중도진보: 'bg-blue-50 text-blue-600',
  중립: 'bg-gray-200 text-gray-700',
  중도보수: 'bg-orange-100 text-orange-700',
  보수: 'bg-red-100 text-red-700',
}

function groupByTopic(editorials: Editorial[]) {
  const map = new Map<string, Editorial[]>()
  for (const e of editorials) {
    const key = e.topic ?? '기타'
    const arr = map.get(key) ?? []
    arr.push(e)
    map.set(key, arr)
  }
  return map
}

function formatTime(iso: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  const h = d.getHours().toString().padStart(2, '0')
  const m = d.getMinutes().toString().padStart(2, '0')
  return `${h}:${m}`
}

function EditorialCard({ item }: { item: Editorial }) {
  const isOurs = item.media_company?.is_our_company
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`editorial-card rounded-xl p-4 block ${isOurs ? 'our-card' : 'bg-white border border-gray-200'}`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className={`text-xs font-semibold px-2 py-0.5 rounded ${isOurs ? 'bg-blue-100 text-blue-800 font-bold' : 'text-gray-700'}`}>
          {item.media_company?.name ?? '알 수 없음'}{isOurs ? ' ★' : ''}
        </span>
        <span className="text-xs text-gray-400">{formatTime(item.published_at)}</span>
      </div>
      <p className="text-sm font-semibold text-gray-900 leading-snug mb-2 line-clamp-2">{item.title}</p>
      {item.summary && (
        <p className="text-xs text-gray-500 leading-relaxed mb-3 line-clamp-3">{item.summary}</p>
      )}
      <div className="flex items-center gap-2 flex-wrap">
        {item.stance_label && (
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STANCE_COLORS[item.stance_label] ?? 'bg-gray-100 text-gray-600'}`}>
            {item.stance_label}
          </span>
        )}
        {item.topic && (
          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{item.topic}</span>
        )}
        <ExternalLink className="w-3 h-3 text-gray-300 ml-auto" />
      </div>
    </a>
  )
}

export default function TodayTab({ editorials, date }: { editorials: Editorial[]; date: string }) {
  const groups = groupByTopic(editorials)
  const topicColors = ['bg-blue-700', 'bg-green-600', 'bg-purple-600', 'bg-amber-500', 'bg-gray-300']
  let colorIdx = 0

  const dateLabel = new Date(date + 'T00:00:00+09:00').toLocaleDateString('ko-KR', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-gray-700">{dateLabel}</span>
          <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
            총 {editorials.length}건 수집
          </span>
        </div>
      </div>

      {editorials.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-sm">오늘 수집된 사설이 없습니다.</p>
          <p className="text-xs mt-1">수집 스크립트가 실행되면 자동으로 표시됩니다.</p>
        </div>
      ) : (
        Array.from(groups.entries()).map(([topic, items]) => {
          const color = topicColors[colorIdx % topicColors.length]
          colorIdx++
          return (
            <div key={topic} className="mb-6">
              <div className="flex items-center gap-2 mb-3">
                <div className={`w-1 h-5 ${color} rounded`} />
                <span className="text-sm font-semibold text-gray-700">{topic}</span>
                {items.length > 1 && (
                  <span className="text-xs text-gray-400">{items.length}개 언론사가 같은 주제</span>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                {items.map((e) => <EditorialCard key={e.editorial_id} item={e} />)}
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}
