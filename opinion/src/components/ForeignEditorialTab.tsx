'use client'

import { useState, useEffect } from 'react'
import {
  ForeignEditorial,
  FOREIGN_SOURCE_ORDER,
  getForeignSourceMeta,
  getForeignEditorialById,
} from '@/lib/foreign-queries'
import ForeignEditorialModal from './ForeignEditorialModal'

const COUNTRY_FLAG: Record<string, string> = {
  US: '🇺🇸', UK: '🇬🇧', HK: '🇭🇰', JP: '🇯🇵',
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

const GROUP_PREVIEW = 5

function EditorialRow({ item, onClick }: { item: ForeignEditorial; onClick: () => void }) {
  const displayTitle = item.title_ko ?? item.title_original
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick() }}
      className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer transition-colors"
    >
      <span className="flex-1 text-sm text-gray-800 truncate">{displayTitle}</span>
      {item.title_ko && (
        <span className="flex-shrink-0 text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium">
          번역
        </span>
      )}
      <span className="w-14 flex-shrink-0 text-right text-xs text-gray-400">{formatTime(item.published_at)}</span>
    </div>
  )
}

export default function ForeignEditorialTab({
  editorials,
  initialOpenId,
}: {
  editorials: ForeignEditorial[]
  initialOpenId?: number | null
}) {
  const [selected, setSelected] = useState<ForeignEditorial | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

  async function openModal(item: ForeignEditorial) {
    setSelected(item)
    setDetailLoading(true)
    try {
      const full = await getForeignEditorialById(item.foreign_editorial_id)
      if (full) setSelected(full)
    } finally {
      setDetailLoading(false)
    }
  }

  // ?open=ID URL 파라미터 진입 시 자동 오픈 (검색 결과 클릭에서 사용)
  useEffect(() => {
    if (initialOpenId == null) return
    let cancelled = false
    setDetailLoading(true)
    ;(async () => {
      try {
        const full = await getForeignEditorialById(initialOpenId)
        if (!cancelled && full) setSelected(full)
      } finally {
        if (!cancelled) setDetailLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [initialOpenId])

  // 매체별 그룹화 (FOREIGN_SOURCE_ORDER 순서 + 그 외는 가나다 끝쪽)
  const bySource = new Map<string, ForeignEditorial[]>()
  for (const e of editorials) {
    const arr = bySource.get(e.source_code) ?? []
    arr.push(e)
    bySource.set(e.source_code, arr)
  }

  const orderedCodes = [
    ...FOREIGN_SOURCE_ORDER.filter((c) => bySource.has(c)),
    ...Array.from(bySource.keys()).filter((c) => !FOREIGN_SOURCE_ORDER.includes(c)).sort(),
  ]

  const sourceCount = orderedCodes.length
  const totalCount = editorials.length

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <span>총 <strong className="text-gray-800">{sourceCount}개 매체</strong></span>
          <span className="text-gray-300">·</span>
          <span><strong className="text-gray-800">{totalCount}건</strong> 수집</span>
        </div>
      </div>

      {totalCount === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-sm">이 날짜에 수집된 해외 사설이 없습니다.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {orderedCodes.map((code) => {
            const items = bySource.get(code) ?? []
            const meta = getForeignSourceMeta(code)
            const flag = COUNTRY_FLAG[meta.country] ?? ''
            const isExpanded = expandedGroups.has(code)
            const visibleItems = isExpanded ? items : items.slice(0, GROUP_PREVIEW)
            const hiddenCount = items.length - GROUP_PREVIEW

            return (
              <div key={code}>
                <div className="flex items-center gap-3 mb-3 pb-2 border-b border-gray-200">
                  <div className="w-1 h-5 rounded flex-shrink-0 bg-blue-700" />
                  <span className="text-sm font-bold text-gray-800">
                    {flag} {meta.name_ko}
                  </span>
                  <span className="text-xs text-gray-400">{meta.name_en}</span>
                  <span className="text-xs text-gray-400 flex-shrink-0 ml-auto">
                    {items.length}건
                  </span>
                </div>
                <div className="overflow-hidden rounded-xl border border-gray-200 bg-white divide-y divide-gray-100">
                  {visibleItems.map((e) => (
                    <EditorialRow key={e.foreign_editorial_id} item={e} onClick={() => openModal(e)} />
                  ))}
                  {!isExpanded && hiddenCount > 0 && (
                    <button
                      onClick={() => setExpandedGroups((prev) => new Set([...prev, code]))}
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
        <ForeignEditorialModal
          item={selected}
          onClose={() => {
            setSelected(null)
            // ?open= 제거 — 새로고침 시 모달이 다시 뜨지 않도록
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
