import Link from 'next/link'
import { Search } from 'lucide-react'
import { Editorial, searchEditorialsPaged } from '@/lib/queries'
import { ForeignEditorial, searchForeignEditorialsPaged } from '@/lib/foreign-queries'
import SearchResultsList from '@/components/SearchResultsList'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 20

// 현재 검색 상태를 유지한 채 특정 페이지로 가는 URL
function pageHref(mode: string, q: string, page: number): string {
  const params = new URLSearchParams({ mode, q, page: String(page) })
  return `/search?${params.toString()}`
}

// 페이지 번호 윈도우 (현재 페이지 주변 ±2)
function pageWindow(current: number, totalPages: number): number[] {
  const start = Math.max(1, current - 2)
  const end = Math.min(totalPages, current + 2)
  const pages: number[] = []
  for (let p = start; p <= end; p++) pages.push(p)
  return pages
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; q?: string; page?: string }>
}) {
  const sp = await searchParams
  const mode = sp.mode === 'foreign' ? 'foreign' : 'domestic'
  const isForeign = mode === 'foreign'
  const q = (sp.q ?? '').trim()
  const pageNum = Math.max(1, Number(sp.page) || 1)
  const tooShort = q.length < 2

  let domesticItems: Editorial[] = []
  let foreignItems: ForeignEditorial[] = []
  let total = 0
  let totalPages = 0

  if (!tooShort) {
    if (isForeign) {
      const { items, total: t } = await searchForeignEditorialsPaged(q, pageNum, PAGE_SIZE).catch((e) => {
        console.error('[search-foreign]', e)
        return { items: [] as ForeignEditorial[], total: 0 }
      })
      foreignItems = items
      total = t
    } else {
      const { items, total: t } = await searchEditorialsPaged(q, pageNum, PAGE_SIZE).catch((e) => {
        console.error('[search-domestic]', e)
        return { items: [] as Editorial[], total: 0 }
      })
      domesticItems = items
      total = t
    }
    totalPages = Math.ceil(total / PAGE_SIZE)
  }

  return (
    <div className="page-wrapper">
      {/* 헤더 */}
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-1">
          <Search className="w-5 h-5 text-gray-400" />
          <h1 className="text-lg font-bold tracking-tight text-gray-900">
            {q ? <>&lsquo;{q}&rsquo; 검색 결과</> : '사설 검색'}
          </h1>
        </div>
        {!tooShort && (
          <p className="text-xs text-gray-500">
            {isForeign ? '해외' : '국내'} 사설 · 총 {total.toLocaleString()}건
            {totalPages > 1 && ` · ${pageNum}/${totalPages} 페이지`}
          </p>
        )}
      </div>

      {/* 국내/해외 탭 */}
      <div className="mb-4 inline-flex items-center rounded-lg border border-gray-200 bg-white p-0.5">
        <Link
          href={pageHref('domestic', q, 1)}
          className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
            !isForeign ? 'bg-blue-800 text-white' : 'text-gray-500 hover:text-gray-800'
          }`}
        >
          국내
        </Link>
        <Link
          href={pageHref('foreign', q, 1)}
          className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
            isForeign ? 'bg-blue-800 text-white' : 'text-gray-500 hover:text-gray-800'
          }`}
        >
          해외
        </Link>
      </div>

      {/* 결과 목록 */}
      {tooShort ? (
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-12 text-center text-sm text-gray-400">
          검색어를 2글자 이상 입력해주세요.
        </div>
      ) : total === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-12 text-center text-sm text-gray-400">
          &lsquo;{q}&rsquo; 검색 결과가 없습니다.
        </div>
      ) : (
        <>
          <SearchResultsList mode={mode} domesticItems={domesticItems} foreignItems={foreignItems} />

          {/* 페이지네이션 */}
          {totalPages > 1 && (
            <div className="mt-5 flex items-center justify-center gap-1">
              <PagerLink mode={mode} q={q} page={pageNum - 1} disabled={pageNum <= 1} label="‹" />
              {pageWindow(pageNum, totalPages).map((p) => (
                <Link
                  key={p}
                  href={pageHref(mode, q, p)}
                  className={`min-w-9 rounded-md px-3 py-1.5 text-center text-sm font-medium transition-colors ${
                    p === pageNum
                      ? 'bg-blue-800 text-white'
                      : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {p}
                </Link>
              ))}
              <PagerLink mode={mode} q={q} page={pageNum + 1} disabled={pageNum >= totalPages} label="›" />
            </div>
          )}
        </>
      )}
    </div>
  )
}

function PagerLink({
  mode,
  q,
  page,
  disabled,
  label,
}: {
  mode: string
  q: string
  page: number
  disabled: boolean
  label: string
}) {
  if (disabled) {
    return (
      <span className="min-w-9 rounded-md border border-gray-100 bg-gray-50 px-3 py-1.5 text-center text-sm text-gray-300">
        {label}
      </span>
    )
  }
  return (
    <Link
      href={pageHref(mode, q, page)}
      className="min-w-9 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-center text-sm text-gray-600 hover:bg-gray-50"
    >
      {label}
    </Link>
  )
}
