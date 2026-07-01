'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search } from 'lucide-react'

type SearchMode = 'domestic' | 'foreign'

export default function SearchBar() {
  const router = useRouter()
  const [mode, setMode] = useState<SearchMode>('domestic')
  const [keyword, setKeyword] = useState('')

  const isForeign = mode === 'foreign'

  function submit() {
    const q = keyword.trim()
    if (q.length < 2) return
    router.push(`/search?mode=${mode}&q=${encodeURIComponent(q)}`)
  }

  return (
    <div className="flex items-center gap-1.5">
      {/* 국내/해외 토글 */}
      <div className="flex items-center rounded-lg border border-gray-200 bg-white p-0.5">
        <button
          type="button"
          onClick={() => setMode('domestic')}
          className={`px-2 py-1 text-xs font-medium rounded-md transition-colors ${
            !isForeign ? 'bg-blue-800 text-white' : 'text-gray-500 hover:text-gray-800'
          }`}
        >
          국내
        </button>
        <button
          type="button"
          onClick={() => setMode('foreign')}
          className={`px-2 py-1 text-xs font-medium rounded-md transition-colors ${
            isForeign ? 'bg-blue-800 text-white' : 'text-gray-500 hover:text-gray-800'
          }`}
        >
          해외
        </button>
      </div>

      <div className="relative w-40 sm:w-56 md:w-72">
        <button
          type="button"
          onClick={submit}
          aria-label="검색"
          className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-blue-600"
        >
          <Search className="h-4 w-4" />
        </button>
        <input
          type="text"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              submit()
            }
          }}
          placeholder={isForeign ? '해외 사설 제목 (한국어/원문)...' : '사설 제목으로 검색...'}
          className="w-full rounded-lg border border-gray-200 bg-white py-1.5 pl-9 pr-3 text-sm placeholder-gray-400 focus:border-blue-400 focus:outline-none"
        />
      </div>
    </div>
  )
}
