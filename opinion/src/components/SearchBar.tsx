'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Search } from 'lucide-react'
import { Editorial, searchEditorials } from '@/lib/queries'
import { getMediaColor } from '@/lib/media-colors'

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
  const [keyword, setKeyword] = useState('')
  const [results, setResults] = useState<Editorial[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [highlightIdx, setHighlightIdx] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  useEffect(() => {
    const q = keyword.trim()
    if (q.length < 2) {
      setResults([])
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    const handle = setTimeout(async () => {
      try {
        const r = await searchEditorials(q, 10)
        if (!cancelled) {
          setResults(r)
          setHighlightIdx(0)
        }
      } catch (e) {
        console.error('[search]', e)
        if (!cancelled) setResults([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(handle)
    }
  }, [keyword])

  function selectResult(e: Editorial) {
    if (!e.edition_date) return
    router.push(`/?date=${e.edition_date}&open=${e.editorial_id}`)
    setKeyword('')
    setResults([])
    setOpen(false)
  }

  function handleKeyDown(ev: React.KeyboardEvent) {
    if (ev.key === 'Escape') {
      setOpen(false)
      ;(ev.target as HTMLInputElement).blur()
    } else if (ev.key === 'ArrowDown') {
      ev.preventDefault()
      setHighlightIdx((i) => Math.min(i + 1, results.length - 1))
    } else if (ev.key === 'ArrowUp') {
      ev.preventDefault()
      setHighlightIdx((i) => Math.max(i - 1, 0))
    } else if (ev.key === 'Enter') {
      ev.preventDefault()
      const target = results[highlightIdx]
      if (target) selectResult(target)
    }
  }

  const showDropdown = open && keyword.trim().length >= 2
  const q = keyword.trim()

  return (
    <div ref={containerRef} className="relative w-80">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={keyword}
          onChange={(e) => { setKeyword(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="사설 제목으로 검색..."
          className="w-full rounded-lg border border-gray-200 bg-white py-1.5 pl-9 pr-3 text-sm placeholder-gray-400 focus:border-blue-400 focus:outline-none"
        />
      </div>

      {showDropdown && (
        <div className="absolute right-0 top-full mt-2 w-[28rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
          {loading ? (
            <p className="px-4 py-6 text-center text-xs text-gray-400">검색 중...</p>
          ) : results.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-gray-400">
              &lsquo;{q}&rsquo; 검색 결과 없음
            </p>
          ) : (
            <ul className="max-h-96 overflow-y-auto py-1">
              {results.map((e, idx) => {
                const isHighlighted = idx === highlightIdx
                const isOurs = e.media_company?.is_our_company
                const mediaName = e.media_company?.name ?? '알 수 없음'
                const color = isOurs ? null : getMediaColor(mediaName)
                return (
                  <li key={e.editorial_id}>
                    <button
                      type="button"
                      onMouseEnter={() => setHighlightIdx(idx)}
                      onClick={() => selectResult(e)}
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
  )
}
