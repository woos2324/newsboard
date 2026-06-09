'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { GitCompare } from 'lucide-react'
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

type FilterType = '전체' | '종합일간지' | '경제지' | '매체별'

function getMediaType(name: string | undefined): '종합일간지' | '경제지' | '기타' {
  if (!name) return '기타'
  if (COMPREHENSIVE.has(name)) return '종합일간지'
  if (ECONOMY.has(name)) return '경제지'
  return '기타'
}

const MEDIA_TYPE_ORDER: Record<'종합일간지' | '경제지' | '기타', number> = {
  '종합일간지': 0,
  '경제지': 1,
  '기타': 2,
}

function compareMediaName(a: string, b: string): number {
  if (a === '세계일보') return -1
  if (b === '세계일보') return 1
  const typeA = getMediaType(a)
  const typeB = getMediaType(b)
  if (typeA !== typeB) return MEDIA_TYPE_ORDER[typeA] - MEDIA_TYPE_ORDER[typeB]
  return a.localeCompare(b, 'ko')
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

function EditorialRow({ item, onClick }: { item: Editorial; onClick: () => void }) {
  const isOurs = item.media_company?.is_our_company
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick() }}
      className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer transition-colors"
    >
      <span className={`w-20 flex-shrink-0 truncate text-xs font-semibold ${isOurs ? 'text-blue-800' : 'text-gray-500'}`}>
        {item.media_company?.name ?? '알 수 없음'}{isOurs ? ' ★' : ''}
      </span>
      <span className="flex-1 text-sm text-gray-800 truncate">{item.title}</span>
      {item.stance_label && (
        <span className={`flex-shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${STANCE_COLORS[item.stance_label] ?? 'bg-gray-100 text-gray-600'}`}>
          {item.stance_label}
        </span>
      )}
      <span className="w-14 flex-shrink-0 text-right text-xs text-gray-400">{formatTime(item.published_at)}</span>
    </div>
  )
}

const GROUP_PREVIEW = 5

export default function TodayTab({
  editorials,
  date,
  initialOpenId,
}: {
  editorials: Editorial[]
  date: string
  initialOpenId?: number | null
}) {
  const [filter, setFilter] = useState<FilterType>('전체')
  const [selected, setSelected] = useState<Editorial | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

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

  // ?open=ID URL 파라미터로 진입 시 해당 사설 모달 자동 오픈 (Topbar 검색에서 결과 클릭)
  useEffect(() => {
    if (initialOpenId == null) return
    let cancelled = false
    setDetailLoading(true)
    ;(async () => {
      try {
        const full = await getEditorialById(initialOpenId)
        if (!cancelled && full) setSelected(full)
      } finally {
        if (!cancelled) setDetailLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [initialOpenId])

  const filtered = filter === '전체' || filter === '매체별'
    ? editorials
    : editorials.filter((e) => getMediaType(e.media_company?.name) === filter)

  const mediaCount = new Set(filtered.map((e) => e.media_company?.name).filter(Boolean)).size

  const mainGroups: [string, Editorial[]][] = []
  if (filter === '매체별') {
    // 매체별 그룹화: 세계일보 → 종합일간지(가나다) → 경제지(가나다) → 기타
    const mediaMap = new Map<string, Editorial[]>()
    for (const e of filtered) {
      const key = e.media_company?.name ?? '알 수 없음'
      const arr = mediaMap.get(key) ?? []
      arr.push(e)
      mediaMap.set(key, arr)
    }
    const entries = Array.from(mediaMap.entries())
    entries.sort(([a], [b]) => compareMediaName(a, b))
    for (const [name, items] of entries) {
      mainGroups.push([name, items])
    }
  } else {
    // issue 기준 그룹화, 1건짜리는 "기타" 통합
    const issueMap = new Map<string, Editorial[]>()
    for (const e of filtered) {
      const key = e.issue ?? '기타'
      const arr = issueMap.get(key) ?? []
      arr.push(e)
      issueMap.set(key, arr)
    }
    const singleItems: Editorial[] = []
    for (const [issue, items] of issueMap.entries()) {
      const sorted = [...items].sort((a, b) =>
        (b.media_company?.is_our_company ? 1 : 0) - (a.media_company?.is_our_company ? 1 : 0)
      )
      if (sorted.length === 1) {
        singleItems.push(...sorted)
      } else {
        mainGroups.push([issue, sorted])
      }
    }
    mainGroups.sort((a, b) => b[1].length - a[1].length)
    if (singleItems.length > 0) mainGroups.push(['__single__', singleItems])
  }

  const FILTERS: FilterType[] = ['전체', '종합일간지', '경제지', '매체별']

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
          {mainGroups.map(([issue, items]) => {
            const isSingle = issue === '__single__'
            const isExpanded = expandedGroups.has(issue)
            const visibleItems = isExpanded ? items : items.slice(0, GROUP_PREVIEW)
            const hiddenCount = items.length - GROUP_PREVIEW
            return (
              <div key={issue}>
                <div className="flex items-center gap-3 mb-3 pb-2 border-b border-gray-200">
                  <div className={`w-1 h-5 rounded flex-shrink-0 ${
                    filter === '매체별' && issue === '세계일보' ? 'bg-blue-800' : 'bg-blue-700'
                  }`} />
                  <span className="text-sm font-bold text-gray-800">
                    {isSingle ? '기타 — 단독 주제' : issue}
                    {filter === '매체별' && issue === '세계일보' && ' ★'}
                  </span>
                  {!isSingle && (
                    <span className="text-xs text-gray-400 flex-shrink-0">
                      {filter === '매체별' ? `${items.length}건` : `${items.length}개 언론사가 같은 주제`}
                    </span>
                  )}
                  {!isSingle &&
                    filter !== '매체별' &&
                    items.some((e) => e.media_company?.is_our_company) &&
                    items.some((e) => !e.media_company?.is_our_company) && (
                      <Link
                        href={`/compare?date=${date}&issue=${encodeURIComponent(issue)}`}
                        className="ml-auto flex items-center gap-1 flex-shrink-0 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 transition-colors"
                      >
                        <GitCompare className="w-3.5 h-3.5" /> 언론사 비교
                      </Link>
                    )}
                </div>
                <div className="overflow-hidden rounded-xl border border-gray-200 bg-white divide-y divide-gray-100">
                  {visibleItems.map((e) => (
                    <EditorialRow key={e.editorial_id} item={e} onClick={() => openModal(e)} />
                  ))}
                  {!isExpanded && hiddenCount > 0 && (
                    <button
                      onClick={() => setExpandedGroups((prev) => new Set([...prev, issue]))}
                      className="w-full px-4 py-2.5 text-xs font-semibold text-blue-600 hover:bg-blue-50 transition-colors"
                    >
                      더보기 +{hiddenCount}건
                    </button>
                  )}
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
          onClose={() => {
            setSelected(null)
            // ?open= 제거 — 새로고침 시 모달이 다시 뜨지 않도록.
            // history.replaceState로 silently 갱신해 서버 재요청 없이 URL만 정리.
            if (typeof window !== 'undefined') {
              const url = new URL(window.location.href)
              if (url.searchParams.has('open')) {
                url.searchParams.delete('open')
                window.history.replaceState({}, '', url.toString())
              }
            }
          }}
          detailLoading={detailLoading}
        />
      )}
    </div>
  )
}
