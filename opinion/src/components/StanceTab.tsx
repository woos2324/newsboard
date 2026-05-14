'use client'

import { MediaStance } from '@/lib/queries'

function stanceToPercent(score: number) {
  return Math.round(((score + 2) / 4) * 100)
}

function stanceDotColor(score: number) {
  if (score <= -1.2) return '#2563EB'
  if (score <= -0.4) return '#60A5FA'
  if (score <= 0.4) return '#9CA3AF'
  if (score <= 1.2) return '#F97316'
  return '#DC2626'
}

function stanceLabelKo(score: number) {
  if (score <= -1.2) return '진보'
  if (score <= -0.4) return '중도진보'
  if (score <= 0.4) return '중립'
  if (score <= 1.2) return '중도보수'
  return '보수'
}

export default function StanceTab({ mediaStances }: { mediaStances: MediaStance[] }) {
  const ours = mediaStances.find((m) => m.is_our_company)

  if (mediaStances.length === 0) {
    return (
      <div className="text-center py-20 text-gray-400">
        <p className="text-sm">아직 분석된 사설이 없습니다.</p>
        <p className="text-xs mt-1">AI 성향 분석이 완료되면 자동으로 표시됩니다.</p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <span className="text-sm text-gray-500">최근 30일 기준</span>
        <span className="text-xs text-gray-400 ml-auto">AI 분석 기준 · 참고용</span>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-6">언론사별 사설 성향 포지셔닝</h3>

        <div className="mb-8 px-4">
          <div className="flex justify-between text-xs text-gray-500 mb-2">
            <span className="text-blue-600 font-medium">← 진보</span>
            <span>중립</span>
            <span className="text-red-600 font-medium">보수 →</span>
          </div>
          <div className="stance-bar-track mb-10">
            {mediaStances.map((m) => {
              const left = stanceToPercent(m.avg_stance)
              const isOurs = m.is_our_company
              return (
                <div key={m.media_company_id} className="group">
                  <div
                    className="stance-dot"
                    style={{
                      left: `${left}%`,
                      background: isOurs ? '#1E40AF' : stanceDotColor(m.avg_stance),
                      width: isOurs ? '18px' : '14px',
                      height: isOurs ? '18px' : '14px',
                      top: isOurs ? '-5px' : '-3px',
                      zIndex: isOurs ? 10 : 1,
                    }}
                    title={`${m.name} (${m.avg_stance.toFixed(1)})`}
                  />
                </div>
              )
            })}
          </div>
          <div className="relative h-8 text-xs text-gray-600">
            {mediaStances.map((m) => {
              const left = stanceToPercent(m.avg_stance)
              return (
                <span
                  key={m.media_company_id}
                  className={`absolute ${m.is_our_company ? 'text-blue-800 font-bold' : ''}`}
                  style={{ left: `${left}%`, transform: 'translateX(-50%)' }}
                >
                  {m.name.replace('일보', '').replace('신문', '')}{m.is_our_company ? '★' : ''}
                </span>
              )
            })}
          </div>
        </div>

        {ours && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
            <span className="font-semibold text-blue-800">{ours.name}</span>
            <span className="text-blue-700">는 최근 30일 사설 기준 </span>
            <span className="font-semibold text-orange-600">
              {stanceLabelKo(ours.avg_stance)} ({ours.avg_stance > 0 ? '+' : ''}{ours.avg_stance.toFixed(1)})
            </span>
            <span className="text-blue-700"> 포지션입니다.</span>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">언론사</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500">성향</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500">점수</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500">분석 사설 수</th>
            </tr>
          </thead>
          <tbody>
            {mediaStances.map((m, i) => (
              <tr key={m.media_company_id} className={`border-b border-gray-100 ${m.is_our_company ? 'bg-blue-50' : i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                <td className="px-4 py-3 font-medium">
                  {m.name}{m.is_our_company ? ' ★' : ''}
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    m.avg_stance <= -1.2 ? 'bg-blue-100 text-blue-700' :
                    m.avg_stance <= -0.4 ? 'bg-blue-50 text-blue-600' :
                    m.avg_stance <= 0.4 ? 'bg-gray-200 text-gray-700' :
                    m.avg_stance <= 1.2 ? 'bg-orange-100 text-orange-700' :
                    'bg-red-100 text-red-700'
                  }`}>
                    {stanceLabelKo(m.avg_stance)}
                  </span>
                </td>
                <td className="px-4 py-3 text-center text-gray-600">
                  {m.avg_stance > 0 ? '+' : ''}{m.avg_stance.toFixed(2)}
                </td>
                <td className="px-4 py-3 text-center text-gray-500">{m.editorial_count}건</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
