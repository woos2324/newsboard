'use client'

import { useState } from 'react'
import { Editorial, getEditorialById } from '@/lib/queries'
import EditorialModal from './EditorialModal'

const STANCE_COLORS: Record<string, string> = {
  진보: 'bg-blue-100 text-blue-700',
  중도진보: 'bg-blue-50 text-blue-600',
  중립: 'bg-gray-200 text-gray-700',
  중도보수: 'bg-orange-100 text-orange-700',
  보수: 'bg-red-100 text-red-700',
}

const COMPREHENSIVE = new Set(['세계일보', '조선일보', '중앙일보', '동아일보', '한겨레', '경향신문', '서울신문', '한국일보', '문화일보', '국민일보', '부산일보', '내일신문', '코리아중앙데일리'])
const ECONOMY = new Set(['한국경제', '매일경제', '서울경제', '헤럴드경제', '파이낸셜뉴스', '이데일리', '아시아경제', '아주경제', '디지털타임스', '전자신문', '이투데이', '비즈니스워치', '아이뉴스24'])

type FilterType = '전체' | '종합일간지' | '경제지'

function getMediaType(name: string | undefined): '종합일간지' | '경제지' | '기타' {
  if (!name) return '기타'
  if (COMPREHENSIVE.has(name)) return '종합일간지'
  if (ECONOMY.has(name)) return '경제지'
  return '기타'
}

function formatTime(iso: string | null) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('ko-KR', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
}

function EditorialCard({ item, onClick }: { item: Editorial; onClick: () => void }) {
  const isOurs = item.media_company?.is_our_company
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick() }}
      className={`editorial-card rounded-xl p-4 cursor-pointer ${isOurs ? 'our-card' : 'bg-white border border-gray-200'}`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className={`text-xs font-semibold ${isOurs ? 'text-blue-800' : 'text-gray-600'}`}>
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
      </div>
    </div>
  )
}

export default function TodayTab({ editorials, date }: { editorials: Editorial[]; date: string }) {
  const [filter, setFilter] = useState<FilterType>('전체')
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

  const filtered = filter === '전체'
    ? editorials
    : editorials.filter((e) => getMediaType(e.media_company?.name) === filter)

  const mediaCount = new Set(filtered.map((e) => e.media_company?.name).filter(Boolean)).size

  // 토픽별 그룹화 후 1건짜리는 "기타" 통합
  const topicMap = new Map<string, Editorial[]>()
  for (const e of filtered) {
    const key = e.topic ?? '기타'
    const arr = topicMap.get(key) ?? []
    arr.push(e)
    topicMap.set(key, arr)
  }

  function pickIssue(items: Editorial[]): string | null {
    const freq = new Map<string, number>()
    for (const e of items) {
      if (e.issue) freq.set(e.issue, (freq.get(e.issue) ?? 0) + 1)
    }
    if (freq.size === 0) return null
    return [...freq.entries()].sort((a, b) => b[1] - a[1])[0][0]
  }

  const mainGroups: [string, Editorial[], string | null][] = []
  const singleItems: Editorial[] = []
  for (const [topic, items] of topicMap.entries()) {
    const sorted = [...items].sort((a, b) =>
      (b.media_company?.is_our_company ? 1 : 0) - (a.media_company?.is_our_company ? 1 : 0)
    )
    if (sorted.length === 1) {
      singleItems.push(...sorted)
    } else {
      mainGroups.push([topic, sorted, pickIssue(sorted)])
    }
  }
  mainGroups.sort((a, b) => b[1].length - a[1].length)
  if (singleItems.length > 0) mainGroups.push(['__single__', singleItems, null])

  const FILTERS: FilterType[] = ['전체', '종합일간지', '경제지']

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <span>총 <strong className="text-gray-800">{mediaCount}개 언론사</strong></span>
          <span className="text-gray-300">·</span>
          <span><strong className="text-gray-800">{filtered.length}건</strong> 수집</span>
        </div>
        <div className="flex gap-1">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                filter === f
                  ? 'bg-blue-800 text-white border-blue-800'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-sm">해당 분류의 사설이 없습니다.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {mainGroups.map(([topic, items, issue]) => {
            const isSingle = topic === '__single__'
            return (
              <div key={topic}>
                <div className="flex items-center gap-3 mb-3 pb-2 border-b border-gray-200">
                  <div className="w-1 h-5 bg-blue-700 rounded flex-shrink-0" />
                  <span className="text-sm font-bold text-gray-800">
                    {isSingle ? '기타 — 단독 주제' : issue ? `${topic} — ${issue}` : topic}
                  </span>
                  {!isSingle && (
                    <span className="text-xs text-gray-400 flex-shrink-0">{items.length}개 언론사가 같은 주제</span>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                  {items.map((e) => (
                    <EditorialCard key={e.editorial_id} item={e} onClick={() => openModal(e)} />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {selected && (
        <EditorialModal
          item={selected}
          relatedEditorials={editorials}
          onClose={() => setSelected(null)}
          detailLoading={detailLoading}
        />
      )}
    </div>
  )
}
