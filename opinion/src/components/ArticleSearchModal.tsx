'use client'

import { useState, useEffect, useRef } from 'react'
import { X, Search } from 'lucide-react'
import { searchArticlesAction } from '@/app/report/actions'
import { getMediaColor } from '@/lib/media-colors'

interface SearchResult {
  article_id: number | null
  title: string
  url: string
  published_at: string | null
  media_name: string
}

interface Props {
  source: 'segye' | 'other'
  sectionIndex: number
  onSelect: (item: SearchResult) => void
  onClose: () => void
}

function formatDate(iso: string | null) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function ArticleSearchModal({ source, sectionIndex, onSelect, onClose }: Props) {
  const [keyword, setKeyword] = useState('')
  const [days, setDays] = useState(7)
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const handle = setTimeout(async () => {
      try {
        const r = await searchArticlesAction(keyword, source, days)
        if (!cancelled) setResults(r)
      } catch (e) {
        console.error('[search] error:', e)
        if (!cancelled) setResults([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(handle)
    }
  }, [keyword, source, days])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="flex max-h-[80vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <h3 className="text-base font-bold text-gray-800">사설 검색</h3>
            <p className="mt-0.5 text-xs text-gray-500">
              보고 항목 {sectionIndex} · {source === 'segye' ? '세계일보' : '타 매체'}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="border-b border-gray-100 px-6 py-4">
          <div className="relative mb-3">
            <Search className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
            <input
              ref={inputRef}
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="사설 제목으로 검색..."
              className="w-full rounded-lg border border-gray-300 py-2.5 pl-10 pr-4 focus:border-blue-400 focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-gray-500">기간:</span>
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="rounded border border-gray-200 px-2 py-1 text-gray-700"
            >
              <option value={1}>최근 1일</option>
              <option value={7}>최근 7일</option>
              <option value={30}>최근 30일</option>
            </select>
            <span className="mx-1 text-gray-300">|</span>
            <span className="text-gray-400">
              매체:{' '}
              {source === 'segye' ? (
                <span className="font-semibold text-blue-800">세계일보로 고정 ★</span>
              ) : (
                <span className="font-semibold text-gray-700">타 매체 전체 (세계일보 제외)</span>
              )}
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-3">
          {loading ? (
            <p className="py-8 text-center text-xs text-gray-400">검색 중...</p>
          ) : results.length === 0 ? (
            <p className="py-8 text-center text-xs text-gray-400">
              {keyword ? '검색 결과가 없습니다.' : '검색어를 입력하세요.'}
            </p>
          ) : (
            <>
              <p className="mb-3 text-xs text-gray-400">검색 결과 {results.length}건</p>
              {results.map((r) => {
                const color = source === 'segye' ? null : getMediaColor(r.media_name)
                return (
                  <button
                    key={r.url}
                    onClick={() => onSelect(r)}
                    className="mb-2 w-full rounded-lg border border-gray-200 p-3 text-left hover:border-blue-400 hover:bg-blue-50"
                  >
                    <div className="mb-1 flex items-center gap-2">
                      {source === 'segye' ? (
                        <span className="text-xs font-semibold text-blue-800">
                          {r.media_name} ★
                        </span>
                      ) : (
                        <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${color!.bg} ${color!.text}`}>
                          {r.media_name}
                        </span>
                      )}
                      <span className="text-xs text-gray-400">{formatDate(r.published_at)}</span>
                    </div>
                    <p className="text-sm font-medium text-gray-900">{r.title}</p>
                  </button>
                )
              })}
            </>
          )}
        </div>

        <div className="border-t border-gray-100 px-6 py-3 text-center text-xs text-gray-400">
          클릭하여 이 보고 항목에 추가
        </div>
      </div>
    </div>
  )
}
