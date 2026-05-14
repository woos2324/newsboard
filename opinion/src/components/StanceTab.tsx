'use client'

import { useState } from 'react'
import { MediaStance } from '@/lib/queries'

const TOPICS = ['전체', '정치', '경제', '사회', '외교']

const STANCE_COLORS: Record<string, string> = {
  진보: 'bg-blue-100 text-blue-700',
  중도진보: 'bg-blue-50 text-blue-600',
  중립: 'bg-gray-200 text-gray-700',
  중도보수: 'bg-orange-100 text-orange-700',
  보수: 'bg-red-100 text-red-700',
}

function scoreToLabel(score: number): string {
  if (score <= -1.2) return '진보'
  if (score <= -0.4) return '중도진보'
  if (score <= 0.4) return '중립'
  if (score <= 1.2) return '중도보수'
  return '보수'
}

function scoreToPercent(score: number) {
  return Math.round(((score + 2) / 4) * 100)
}

function dotColor(score: number): string {
  if (score <= -1.2) return '#2563EB'
  if (score <= -0.4) return '#60A5FA'
  if (score <= 0.4) return '#9CA3AF'
  if (score <= 1.2) return '#F97316'
  return '#DC2626'
}

function StanceBadge({ score }: { score: number | undefined }) {
  if (score === undefined) return <span className="text-xs text-gray-300">—</span>
  const label = scoreToLabel(score)
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STANCE_COLORS[label]}`}>
      {label}
    </span>
  )
}

export default function StanceTab({ mediaStances }: { mediaStances: MediaStance[] }) {
  const [topic, setTopic] = useState('전체')

  if (mediaStances.length === 0) {
    return (
      <div className="text-center py-20 text-gray-400">
        <p className="text-sm">아직 분석된 사설이 없습니다.</p>
        <p className="text-xs mt-1">AI 성향 분석이 완료되면 자동으로 표시됩니다.</p>
      </div>
    )
  }

  // 선택 주제 기준 점수
  const scored = mediaStances.map((m) => ({
    ...m,
    score: topic === '전체' ? m.avg_stance : (m.by_topic[topic] ?? undefined),
  })).filter((m) => m.score !== undefined)
  .sort((a, b) => (a.score ?? 0) - (b.score ?? 0))

  const ours = scored.find((m) => m.is_our_company)
  const oursIdx = scored.findIndex((m) => m.is_our_company)

  // 세계일보 인접 언론사 비교 문구
  function comparisonText() {
    if (!ours || ours.score === undefined) return null
    const label = scoreToLabel(ours.score)
    const left = oursIdx > 0 ? scored[oursIdx - 1] : null
    const right = oursIdx < scored.length - 1 ? scored[oursIdx + 1] : null
    const parts = []
    if (left) parts.push(`${left.name}보다 보수적`)
    if (right) parts.push(`${right.name}보다 진보적`)
    const compared = parts.join(', ')
    return `${ours.name}는 최근 30일 사설 기준 ${label} (${ours.score > 0 ? '+' : ''}${ours.score.toFixed(1)}) 포지션으로${compared ? `, ${compared}` : ''}입니다.`
  }

  // 테이블: 세계일보 최상단 고정 후 나머지 avg_stance 순
  const tableRows = [
    ...mediaStances.filter((m) => m.is_our_company),
    ...mediaStances.filter((m) => !m.is_our_company).sort((a, b) => a.avg_stance - b.avg_stance),
  ]

  const topicCols = ['정치', '경제', '사회', '외교']

  return (
    <div>
      {/* 주제 필터 */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <span className="text-xs text-gray-500 font-medium">주제 필터</span>
        {TOPICS.map((t) => (
          <button
            key={t}
            onClick={() => setTopic(t)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              topic === t
                ? 'bg-blue-800 text-white border-blue-800'
                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
            }`}
          >
            {t}
          </button>
        ))}
        <span className="text-xs text-gray-400 ml-2">최근 30일 기준</span>
      </div>

      {/* 포지셔닝 차트 */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-1">언론사별 사설 성향 포지셔닝</h3>
        <p className="text-xs text-gray-400 mb-6">AI 분석 기준 · 참고용</p>

        <div className="px-4">
          <div className="flex justify-between text-xs mb-2">
            <span className="text-blue-600 font-medium">← 진보</span>
            <span className="text-gray-400">중립</span>
            <span className="text-red-600 font-medium">보수 →</span>
          </div>
          <div className="stance-bar-track mb-8">
            {scored.map((m) => (
              <div
                key={m.media_company_id}
                className="stance-dot"
                style={{
                  left: `${scoreToPercent(m.score ?? 0)}%`,
                  background: m.is_our_company ? '#1E40AF' : dotColor(m.score ?? 0),
                  width: m.is_our_company ? '18px' : '14px',
                  height: m.is_our_company ? '18px' : '14px',
                  top: m.is_our_company ? '-5px' : '-3px',
                  zIndex: m.is_our_company ? 10 : 1,
                }}
                title={`${m.name} (${(m.score ?? 0).toFixed(1)})`}
              />
            ))}
          </div>
          <div className="relative h-10 text-xs text-gray-600">
            {[...scored]
              .sort((a, b) => scoreToPercent(a.score ?? 0) - scoreToPercent(b.score ?? 0))
              .map((m, i) => (
                <span
                  key={m.media_company_id}
                  className={`absolute ${m.is_our_company ? 'text-blue-800 font-bold' : ''}`}
                  style={{
                    left: `${scoreToPercent(m.score ?? 0)}%`,
                    transform: 'translateX(-50%)',
                    top: i % 2 === 0 ? '0px' : '18px',
                  }}
                >
                  {m.name.replace('일보', '').replace('신문', '')}{m.is_our_company ? '★' : ''}
                </span>
              ))}
          </div>
        </div>

        {ours && comparisonText() && (
          <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
            {comparisonText()}
          </div>
        )}
      </div>

      {/* 주제별 성향 비교 테이블 */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700">주제별 성향 비교</h3>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500">언론사</th>
              {topicCols.map((t) => (
                <th key={t} className="text-center px-4 py-3 text-xs font-semibold text-gray-500">{t}</th>
              ))}
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500">종합 성향</th>
            </tr>
          </thead>
          <tbody>
            {tableRows.map((m) => (
              <tr
                key={m.media_company_id}
                className={`border-b border-gray-100 ${m.is_our_company ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
              >
                <td className={`px-5 py-5 font-semibold ${m.is_our_company ? 'text-blue-800' : 'text-gray-800'}`}>
                  {m.name}{m.is_our_company ? ' ★' : ''}
                </td>
                {topicCols.map((t) => (
                  <td key={t} className="px-4 py-5 text-center">
                    <StanceBadge score={m.by_topic[t]} />
                  </td>
                ))}
                <td className="px-4 py-5 text-center">
                  <StanceBadge score={m.avg_stance} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
