'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Newspaper, BarChart2, TrendingUp, PenSquare, X, Tag, ClipboardList } from 'lucide-react'

const nav = [
  { href: '/', label: '오늘의 사설', icon: Newspaper },
  // { href: '/stance', label: '성향 비교', icon: BarChart2 },
  { href: '/trend', label: '세계일보 트렌드', icon: TrendingUp },
  { href: '/label', label: '성향 레이블링', icon: Tag },
  { href: '/report', label: '사설 일일 동향', icon: ClipboardList },
]

type Props = { isOpen?: boolean; onClose?: () => void }

export default function OpinionSidebar({ isOpen = false, onClose }: Props) {
  const pathname = usePathname()

  return (
    <>
      {/* 모바일 오버레이 */}
      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex h-full w-56 shrink-0 flex-col border-r border-gray-200 bg-white transition-transform duration-200 ease-in-out lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-14 items-center gap-2 border-b border-gray-200 px-5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-800 text-white">
            <PenSquare className="h-4 w-4" />
          </div>
          <span className="text-sm font-semibold text-gray-900">사설 분석</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="메뉴 닫기"
            className="ml-auto flex h-7 w-7 items-center justify-center rounded-lg hover:bg-gray-100 lg:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 px-3 py-4">
          <ul className="space-y-1">
            {nav.map((item) => {
              const Icon = item.icon
              const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onClose}
                    className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                      active
                        ? 'bg-blue-50 font-medium text-blue-800'
                        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>

        <div className="border-t border-gray-200 p-4">
          <p className="text-xs text-gray-400">세계일보 논설실</p>
        </div>
      </aside>
    </>
  )
}
