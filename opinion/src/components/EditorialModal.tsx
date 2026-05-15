'use client'

import { X, ExternalLink } from 'lucide-react'
import { Editorial } from '@/lib/queries'

const STANCE_COLORS: Record<string, string> = {
  진보: 'bg-blue-100 text-blue-700',
  중도진보: 'bg-blue-50 text-blue-600',
  중립: 'bg-gray-200 text-gray-700',
  중도보수: 'bg-orange-100 text-orange-700',
  보수: 'bg-red-100 text-red-700',
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

export default function EditorialModal({
  item,
  relatedEditorials = [],
  onClose,
  detailLoading = false,
}: {
  item: Editorial
  relatedEditorials?: Editorial[]
  onClose: () => void
  detailLoading?: boolean
}) {
  const isOurs = item.media_company?.is_our_company
  const stanceReason = (item.ai_analysis as Record<string, string> | null)?.stance_reason
  const score = item.stance_score ?? 0
  const leftPercent = Math.min(100, Math.max(0, ((score + 2) / 4) * 100))

  const others = relatedEditorials
    .filter((e) => e.editorial_id !== item.editorial_id && e.topic === item.topic)
    .slice(0, 5)

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">

        {/* 헤더 */}
        <div className="flex items-start justify-between p-6 border-b border-gray-100">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className={`text-xs font-bold px-2 py-0.5 rounded flex-shrink-0 ${isOurs ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-700'}`}>
                {item.media_company?.name ?? '알 수 없음'}{isOurs ? ' ★' : ''}
              </span>
              <span className="text-xs text-gray-400 flex-shrink-0">{formatDate(item.published_at)}</span>
              {item.topic && (
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full flex-shrink-0">{item.topic}</span>
              )}
            </div>
            <h2 className="text-base font-bold text-gray-900 leading-snug">{item.title}</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 ml-4 flex-shrink-0 mt-0.5">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">

          {/* AI 요약 */}
          {item.summary && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">AI 요약</p>
              <p className="text-sm text-gray-700 leading-relaxed">{item.summary}</p>
            </div>
          )}

          {/* 성향 분석 */}
          {item.stance_label && (
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                성향 분석{' '}
                <span className="text-gray-400 font-normal normal-case">AI 분석 기준 · 참고용</span>
              </p>
              <div className="flex items-center gap-3 mb-3">
                <span className={`text-sm font-bold px-3 py-1 rounded-full ${STANCE_COLORS[item.stance_label] ?? 'bg-gray-100 text-gray-700'}`}>
                  {item.stance_label}
                </span>
                {item.stance_score != null && (
                  <span className="text-xs text-gray-500">
                    스펙트럼 점수: {item.stance_score > 0 ? '+' : ''}{item.stance_score.toFixed(1)} / 2.0
                  </span>
                )}
              </div>
              {/* 스펙트럼 바 */}
              <div className="mb-1">
                <div
                  className="relative h-2 rounded-full"
                  style={{ background: 'linear-gradient(to right, #2563EB, #93C5FD, #D1D5DB, #FCA77D, #DC2626)' }}
                >
                  <div
                    className="absolute w-3.5 h-3.5 rounded-full border-2 border-white shadow bg-gray-800 top-1/2 -translate-y-1/2 -translate-x-1/2"
                    style={{ left: `${leftPercent}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-gray-400 mt-1.5">
                  <span>← 진보</span><span>중립</span><span>보수 →</span>
                </div>
              </div>
              {/* 판단 근거 */}
              {stanceReason && (
                <div className="mt-3 border-t border-gray-200 pt-3">
                  <p className="text-xs font-medium text-gray-600 mb-1">판단 근거</p>
                  <p className="text-xs text-gray-500 leading-relaxed">{stanceReason}</p>
                </div>
              )}
            </div>
          )}

          {/* 본문 */}
          {detailLoading ? (
            <div>
              <div className="h-3 w-12 bg-gray-200 rounded animate-pulse mb-2" />
              <div className="space-y-1.5">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className={`h-3 bg-gray-100 rounded animate-pulse ${i === 5 ? 'w-3/4' : 'w-full'}`} />
                ))}
              </div>
            </div>
          ) : item.body ? (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">본문</p>
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{item.body}</p>
            </div>
          ) : null}

          {/* 같은 주제 타사 사설 */}
          {others.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">같은 주제 타사 사설</p>
              <div className="space-y-2">
                {others.map((e) => (
                  <a
                    key={e.editorial_id}
                    href={e.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 hover:bg-gray-50"
                  >
                    <span className="text-xs font-semibold text-gray-600 w-20 flex-shrink-0 truncate">
                      {e.media_company?.name}
                    </span>
                    <span className="flex-1 text-xs text-gray-700 truncate">{e.title}</span>
                    {e.stance_label && (
                      <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${STANCE_COLORS[e.stance_label] ?? 'bg-gray-100 text-gray-700'}`}>
                        {e.stance_label}
                      </span>
                    )}
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* 원문 보기 */}
          <div className="border-t border-gray-100 pt-4 flex justify-end">
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1.5 font-medium"
            >
              원문 보기 (네이버)
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>

        </div>
      </div>
    </div>
  )
}
