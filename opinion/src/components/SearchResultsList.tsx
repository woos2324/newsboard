'use client'

import { useState } from 'react'
import { Editorial, getEditorialById } from '@/lib/queries'
import {
  ForeignEditorial,
  getForeignEditorialById,
  getForeignSourceMeta,
} from '@/lib/foreign-queries'
import { getMediaColor } from '@/lib/media-colors'
import EditorialModal from './EditorialModal'
import ForeignEditorialModal from './ForeignEditorialModal'

const COUNTRY_FLAG: Record<string, string> = {
  US: '🇺🇸', UK: '🇬🇧', HK: '🇭🇰', JP: '🇯🇵',
}

function formatDate(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso)
    .toLocaleDateString('ko-KR', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    .replace(/\. /g, '.')
    .replace(/\.$/, '')
}

export default function SearchResultsList({
  mode,
  domesticItems,
  foreignItems,
}: {
  mode: 'domestic' | 'foreign'
  domesticItems: Editorial[]
  foreignItems: ForeignEditorial[]
}) {
  const [selectedDomestic, setSelectedDomestic] = useState<Editorial | null>(null)
  const [selectedForeign, setSelectedForeign] = useState<ForeignEditorial | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  // 클릭 시 본문 포함 상세를 지연 조회 (목록 쿼리에는 body가 없음)
  async function openDomestic(item: Editorial) {
    setSelectedDomestic(item)
    setDetailLoading(true)
    try {
      const full = await getEditorialById(item.editorial_id)
      if (full) setSelectedDomestic(full)
    } finally {
      setDetailLoading(false)
    }
  }

  async function openForeign(item: ForeignEditorial) {
    setSelectedForeign(item)
    setDetailLoading(true)
    try {
      const full = await getForeignEditorialById(item.foreign_editorial_id)
      if (full) setSelectedForeign(full)
    } finally {
      setDetailLoading(false)
    }
  }

  return (
    <>
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        {mode === 'foreign'
          ? foreignItems.map((e) => {
              const meta = getForeignSourceMeta(e.source_code)
              const flag = COUNTRY_FLAG[e.source_country] ?? ''
              const displayTitle = e.title_ko ?? e.title_original
              return (
                <button
                  key={e.foreign_editorial_id}
                  type="button"
                  onClick={() => openForeign(e)}
                  className="flex w-full items-center gap-3 px-4 py-3 border-b border-gray-100 text-left hover:bg-gray-50 transition-colors"
                >
                  <span className="flex-shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-xs font-semibold text-gray-700">
                    {flag} {meta.name_ko}
                  </span>
                  <span className="flex-1 min-w-0 truncate text-sm text-gray-800">{displayTitle}</span>
                  <span className="flex-shrink-0 text-xs text-gray-400">{formatDate(e.published_at)}</span>
                </button>
              )
            })
          : domesticItems.map((e) => {
              const isOurs = e.media_company?.is_our_company
              const mediaName = e.media_company?.name ?? '알 수 없음'
              const color = isOurs ? null : getMediaColor(mediaName)
              return (
                <button
                  key={e.editorial_id}
                  type="button"
                  onClick={() => openDomestic(e)}
                  className="flex w-full items-center gap-3 px-4 py-3 border-b border-gray-100 text-left hover:bg-gray-50 transition-colors"
                >
                  {isOurs ? (
                    <span className="flex-shrink-0 rounded bg-blue-100 px-1.5 py-0.5 text-xs font-semibold text-blue-800">
                      {mediaName} ★
                    </span>
                  ) : (
                    <span className={`flex-shrink-0 rounded px-1.5 py-0.5 text-xs font-semibold ${color!.bg} ${color!.text}`}>
                      {mediaName}
                    </span>
                  )}
                  <span className="flex-1 min-w-0 truncate text-sm text-gray-800">{e.title}</span>
                  <span className="flex-shrink-0 text-xs text-gray-400">{formatDate(e.published_at)}</span>
                </button>
              )
            })}
      </div>

      {selectedDomestic && (
        <EditorialModal
          item={selectedDomestic}
          relatedEditorials={[]}
          onClose={() => setSelectedDomestic(null)}
          detailLoading={detailLoading}
        />
      )}
      {selectedForeign && (
        <ForeignEditorialModal
          item={selectedForeign}
          onClose={() => setSelectedForeign(null)}
          detailLoading={detailLoading}
        />
      )}
    </>
  )
}
