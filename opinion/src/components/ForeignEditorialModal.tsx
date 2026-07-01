'use client'

import { useState } from 'react'
import { X, ExternalLink, Languages, Printer } from 'lucide-react'
import { ForeignEditorial, getForeignSourceMeta } from '@/lib/foreign-queries'

const COUNTRY_FLAG: Record<string, string> = {
  US: '🇺🇸', UK: '🇬🇧', HK: '🇭🇰', JP: '🇯🇵',
}

function formatDate(iso: string | null) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).replace(/\. /g, '.').replace(/\.$/, '')
}

export default function ForeignEditorialModal({
  item,
  onClose,
  detailLoading = false,
}: {
  item: ForeignEditorial
  onClose: () => void
  detailLoading?: boolean
}) {
  const [tab, setTab] = useState<'ko' | 'original'>('ko')
  const meta = getForeignSourceMeta(item.source_code)
  const flag = COUNTRY_FLAG[item.source_country] ?? ''

  const titleKo = item.title_ko ?? item.title_original
  const bodyKo = item.body_ko
  const titleOrig = item.title_original
  const bodyOrig = item.body_original

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      {/* 인쇄 전용 (매체·날짜·제목·본문만 — 현재 선택된 탭 기준) */}
      <div className="print-area print-only">
        <div style={{ fontSize: '16px', color: '#555', marginBottom: '6px' }}>
          {flag} {meta.name_ko} · {formatDate(item.published_at)}
        </div>
        <h2 style={{ fontSize: '22px', fontWeight: 700, lineHeight: 1.4, marginBottom: '14px' }}>
          {tab === 'ko' ? titleKo : titleOrig}
        </h2>
        <div style={{ fontSize: '17px', lineHeight: 1.75, whiteSpace: 'pre-line' }}>
          {tab === 'ko' ? bodyKo : bodyOrig}
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">

        {/* 헤더 */}
        <div className="flex items-start justify-between p-6 border-b border-gray-100">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="text-xs font-bold px-2 py-0.5 rounded bg-gray-100 text-gray-700 flex-shrink-0">
                {flag} {meta.name_ko}
              </span>
              <span className="text-xs text-gray-400 flex-shrink-0">{formatDate(item.published_at)}</span>
              <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full flex-shrink-0">
                {item.source_language === 'ja' ? '日本語' : 'English'} → 한국어
              </span>
            </div>
            <h2 className="text-base font-bold text-gray-900 leading-snug">
              {tab === 'ko' ? titleKo : titleOrig}
            </h2>
            {tab === 'ko' && item.title_ko && item.title_original !== item.title_ko && (
              <p className="text-xs text-gray-400 mt-1 truncate">원문: {titleOrig}</p>
            )}
          </div>
          <div className="flex items-center gap-1 ml-4 flex-shrink-0 mt-0.5 no-print">
            <button onClick={() => window.print()} className="text-gray-400 hover:text-blue-600" title="인쇄" aria-label="인쇄">
              <Printer className="w-5 h-5" />
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="닫기">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 탭 */}
        <div className="px-6 pt-4 flex items-center gap-1 border-b border-gray-100">
          <button
            onClick={() => setTab('ko')}
            className={`text-xs px-3 py-1.5 rounded-t-lg font-medium transition-colors ${
              tab === 'ko'
                ? 'bg-blue-50 text-blue-800 border-b-2 border-blue-800'
                : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            한국어 번역
          </button>
          <button
            onClick={() => setTab('original')}
            className={`text-xs px-3 py-1.5 rounded-t-lg font-medium transition-colors flex items-center gap-1 ${
              tab === 'original'
                ? 'bg-blue-50 text-blue-800 border-b-2 border-blue-800'
                : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            <Languages className="w-3 h-3" /> 원문 ({item.source_language === 'ja' ? '日本語' : 'English'})
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* 본문 */}
          {detailLoading ? (
            <div>
              <div className="space-y-1.5">
                {[...Array(8)].map((_, i) => (
                  <div key={i} className={`h-3 bg-gray-100 rounded animate-pulse ${i === 7 ? 'w-3/4' : 'w-full'}`} />
                ))}
              </div>
            </div>
          ) : (
            <div>
              {tab === 'ko' ? (
                bodyKo ? (
                  <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{bodyKo}</p>
                ) : (
                  <p className="text-sm text-gray-400 italic">번역 본문이 아직 준비되지 않았습니다.</p>
                )
              ) : (
                bodyOrig ? (
                  <p
                    className="text-sm text-gray-700 leading-relaxed whitespace-pre-line"
                    lang={item.source_language}
                  >{bodyOrig}</p>
                ) : (
                  <p className="text-sm text-gray-400 italic">원문 본문이 저장되지 않았습니다.</p>
                )
              )}
            </div>
          )}

          {/* 원문 출처 */}
          <div className="border-t border-gray-100 pt-4 flex items-center justify-between">
            <span className="text-xs text-gray-400">{meta.name_en}</span>
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1.5 font-medium"
            >
              매체 사이트에서 보기
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
