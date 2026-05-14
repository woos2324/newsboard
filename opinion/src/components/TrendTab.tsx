'use client'

import { Editorial } from '@/lib/queries'
import { ExternalLink } from 'lucide-react'

const STANCE_COLORS: Record<string, string> = {
  진보: 'bg-blue-100 text-blue-700',
  중도진보: 'bg-blue-50 text-blue-600',
  중립: 'bg-gray-200 text-gray-700',
  중도보수: 'bg-orange-100 text-orange-700',
  보수: 'bg-red-100 text-red-700',
}

function formatDate(iso: string | null) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric' })
}

export default function TrendTab({ editorials }: { editorials: Editorial[] }) {
  if (editorials.length === 0) {
    return (
      <div className="text-center py-20 text-gray-400">
        <p className="text-sm">분석된 세계일보 사설이 없습니다.</p>
        <p className="text-xs mt-1">수집 후 AI 분석이 완료되면 자동으로 표시됩니다.</p>
      </div>
    )
  }

  const byMonth = new Map<string, Editorial[]>()
  for (const e of editorials) {
    const key = e.published_at ? e.published_at.slice(0, 7) : '기타'
    const arr = byMonth.get(key) ?? []
    arr.push(e)
    byMonth.set(key, arr)
  }

  const topicCount = new Map<string, number>()
  for (const e of editorials) {
    const t = e.topic ?? '기타'
    topicCount.set(t, (topicCount.get(t) ?? 0) + 1)
  }
  const topTopics = Array.from(topicCount.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5)

  const withStance = editorials.filter((e) => e.stance_score !== null)
  const avgStance = withStance.length > 0
    ? withStance.reduce((s, e) => s + (e.stance_score ?? 0), 0) / withStance.length
    : null

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 mb-1">총 사설 수 (90일)</p>
          <p className="text-2xl font-bold text-blue-800">{editorials.length}<span className="text-sm font-normal text-gray-500 ml-1">건</span></p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 mb-1">평균 성향 점수</p>
          <p className="text-2xl font-bold text-orange-600">
            {avgStance !== null ? `${avgStance > 0 ? '+' : ''}${avgStance.toFixed(2)}` : '—'}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 mb-1">주요 주제</p>
          <div className="flex flex-wrap gap-1 mt-1">
            {topTopics.map(([topic, cnt]) => (
              <span key={topic} className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">
                {topic} ({cnt})
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {editorials.map((e) => (
          <a
            key={e.editorial_id}
            href={e.url}
            target="_blank"
            rel="noopener noreferrer"
            className="editorial-card bg-white border border-gray-200 rounded-xl p-4 flex items-start gap-4 block"
          >
            <div className="text-xs text-gray-400 w-16 flex-shrink-0 pt-0.5">{formatDate(e.published_at)}</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 leading-snug mb-1 truncate">{e.title}</p>
              {e.summary && <p className="text-xs text-gray-500 line-clamp-2">{e.summary}</p>}
            </div>
            <div className="flex flex-col items-end gap-1 flex-shrink-0">
              {e.stance_label && (
                <div className="relative group">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium cursor-help ${STANCE_COLORS[e.stance_label] ?? 'bg-gray-100 text-gray-600'}`}>
                    {e.stance_label}
                  </span>
                  {(e.ai_analysis as Record<string, string> | null)?.stance_reason && (
                    <div className="absolute bottom-full right-0 mb-1.5 w-52 bg-gray-800 text-white text-xs rounded-lg p-2.5 opacity-0 group-hover:opacity-100 transition-opacity z-20 pointer-events-none leading-relaxed shadow-lg">
                      {(e.ai_analysis as Record<string, string>).stance_reason}
                    </div>
                  )}
                </div>
              )}
              {e.topic && <span className="text-xs text-gray-400">{e.topic}</span>}
            </div>
            <ExternalLink className="w-3.5 h-3.5 text-gray-300 flex-shrink-0 mt-0.5" />
          </a>
        ))}
      </div>
    </div>
  )
}
