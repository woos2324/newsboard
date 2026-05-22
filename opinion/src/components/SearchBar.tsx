'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { Search } from 'lucide-react'
import { Editorial, searchEditorials } from '@/lib/queries'
import {
  ForeignEditorial,
  searchForeignEditorials,
  getForeignSourceMeta,
} from '@/lib/foreign-queries'
import { getMediaColor } from '@/lib/media-colors'

type SearchMode = 'domestic' | 'foreign'

const COUNTRY_FLAG: Record<string, string> = {
  US: '🇺🇸', UK: '🇬🇧', HK: '🇭🇰', JP: '🇯🇵',
}

function formatRelativeDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const target = new Date(d)
  target.setHours(0, 0, 0, 0)
  if (target.getTime() === today.getTime()) return '오늘'
  if (target.getTime() === yesterday.getTime()) return '어제'
  return d.toLocaleDateString('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: '2-digit',
    day: '2-digit',
  }).replace(/\.$/, '').trim()
}

export default function SearchBar() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [mode, setMode] = useState<SearchMode>('domestic')
  const [keyword, setKeyword] = useState('')
  const [domesticResults, setDomesticResults] = useState<Editorial[]>([])
  const [foreignResults, setForeignResults] = useState<ForeignEditorial[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [highlightIdx, setHighlightIdx] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  const isForeign = mode === 'foreign'
  const resultCount = isForeign ? foreignResults.length : domesticResults.length

  useEffect(() => {
    function onClick(e: MouseEvent) {
      const target = e.target as HTMLElement
      if (!containerRef.current || containerRef.current.contains(target)) return

      // 모달 backdrop(fixed inset-0 z-50) 또는 그 자손 클릭은 무시 — 모달 닫을 때 dropdown까지 닫히지 않도록.
      let el: HTMLElement | null = target
      while (el && el !== document.body) {
        const cls = el.classList
        if (cls.contains('fixed') && cls.contains('inset-0') && cls.contains('z-50')) return
        el = el.parentElement
      }

      setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  useEffect(() => {
    const q = keyword.trim()
    if (q.length < 2) {
      setDomesticResults([])
      setForeignResults([])
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    const handle = setTimeout(async () => {
      try {
        if (isForeign) {
          const r = await searchForeignEditorials(q, 10)
          if (!cancelled) {
            setForeignResults(r)
            setHighlightIdx(0)
          }
        } else {
          const r = await searchEditorials(q, 10)
          if (!cancelled) {
            setDomesticResults(r)
            setHighlightIdx(0)
          }
        }
      } catch (e) {
        console.error('[search]', e)
        if (!cancelled) {
          setDomesticResults([])
          setForeignResults([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(handle)
    }
  }, [keyword, isForeign])

  function selectDomestic(e: Editorial) {
    // 현재 보고 있는 페이지·날짜는 유지하고 ?open=만 갱신.
    if (pathname === '/') {
      const params = new URLSearchParams(searchParams.toString())
      params.set('open', String(e.editorial_id))
      router.push(`/?${params.toString()}`)
    } else {
      router.push(`/?open=${e.editorial_id}`)
    }
  }

  function selectForeign(e: ForeignEditorial) {
    // /foreign 페이지로 이동하며 edition_date + ?open= 둘 다 전달.
    const dateParam = e.edition_date ? `date=${e.edition_date}&` : ''
    router.push(`/foreign?${dateParam}open=${e.foreign_editorial_id}`)
  }

  function handleKeyDown(ev: React.KeyboardEvent) {
    if (ev.key === 'Escape') {
      setOpen(false)
      ;(ev.target as HTMLInputElement).blur()
    } else if (ev.key === 'ArrowDown') {
      ev.preventDefault()
      setHighlightIdx((i) => Math.min(i + 1, resultCount - 1))
    } else if (ev.key === 'ArrowUp') {
      ev.preventDefault()
      setHighlightIdx((i) => Math.max(i - 1, 0))
    } else if (ev.key === 'Enter') {
      ev.preventDefault()
      if (isForeign) {
        const target = foreignResults[highlightIdx]
        if (target) selectForeign(target)
      } else {
        const target = domesticResults[highlightIdx]
        if (target) selectDomestic(target)
      }
    }
  }

  const showDropdown = open && keyword.trim().length >= 2
  const q = keyword.trim()

  return (
    <div ref={containerRef} className="relative flex items-center gap-1.5">
      {/* 국내/해외 토글 */}
      <div className="flex items-center rounded-lg border border-gray-200 bg-white p-0.5">
        <button
          type="button"
          onClick={() => { setMode('domestic'); setHighlightIdx(0) }}
          className={`px-2 py-1 text-xs font-medium rounded-md transition-colors ${
            !isForeign ? 'bg-blue-800 text-white' : 'text-gray-500 hover:text-gray-800'
          }`}
        >
          국내
        </button>
        <button
          type="button"
          onClick={() => { setMode('foreign'); setHighlightIdx(0) }}
          className={`px-2 py-1 text-xs font-medium rounded-md transition-colors ${
            isForeign ? 'bg-blue-800 text-white' : 'text-gray-500 hover:text-gray-800'
          }`}
        >
          해외
        </button>
      </div>

      <div className="relative w-72">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={keyword}
          onChange={(e) => { setKeyword(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={isForeign ? '해외 사설 제목 (한국어/원문)...' : '사설 제목으로 검색...'}
          className="w-full rounded-lg border border-gray-200 bg-white py-1.5 pl-9 pr-3 text-sm placeholder-gray-400 focus:border-blue-400 focus:outline-none"
        />

        {showDropdown && (
          <div className="absolute right-0 top-full mt-2 w-[28rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
            {loading ? (
              <p className="px-4 py-6 text-center text-xs text-gray-400">검색 중...</p>
            ) : resultCount === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-gray-400">
                &lsquo;{q}&rsquo; 검색 결과 없음
              </p>
            ) : isForeign ? (
              <ul className="max-h-96 overflow-y-auto py-1">
                {foreignResults.map((e, idx) => {
                  const isHighlighted = idx === highlightIdx
                  const meta = getForeignSourceMeta(e.source_code)
                  const flag = COUNTRY_FLAG[e.source_country] ?? ''
                  const displayTitle = e.title_ko ?? e.title_original
                  return (
                    <li key={e.foreign_editorial_id}>
                      <button
                        type="button"
                        onMouseEnter={() => setHighlightIdx(idx)}
                        onClick={() => selectForeign(e)}
                        className={`flex w-full items-center gap-3 px-3 py-2 text-left transition-colors ${
                          isHighlighted ? 'bg-blue-50' : 'hover:bg-gray-50'
                        }`}
                      >
                        <span className="flex-shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-xs font-semibold text-gray-700">
                          {flag} {meta.name_ko}
                        </span>
                        <span className="flex-1 truncate text-sm text-gray-800">{displayTitle}</span>
                        <span className="flex-shrink-0 text-xs text-gray-400">
                          {formatRelativeDate(e.published_at)}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <ul className="max-h-96 overflow-y-auto py-1">
                {domesticResults.map((e, idx) => {
                  const isHighlighted = idx === highlightIdx
                  const isOurs = e.media_company?.is_our_company
                  const mediaName = e.media_company?.name ?? '알 수 없음'
                  const color = isOurs ? null : getMediaColor(mediaName)
                  return (
                    <li key={e.editorial_id}>
                      <button
                        type="button"
                        onMouseEnter={() => setHighlightIdx(idx)}
                        onClick={() => selectDomestic(e)}
                        className={`flex w-full items-center gap-3 px-3 py-2 text-left transition-colors ${
                          isHighlighted ? 'bg-blue-50' : 'hover:bg-gray-50'
                        }`}
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
                        <span className="flex-1 truncate text-sm text-gray-800">{e.title}</span>
                        <span className="flex-shrink-0 text-xs text-gray-400">
                          {formatRelativeDate(e.published_at)}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
