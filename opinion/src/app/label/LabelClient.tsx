'use client'

import { useState } from 'react'
import { Editorial, EditorialLabel, submitLabel, getEditorialLabels, getEditorialById } from '@/lib/queries'
import { ExternalLink, X, CheckCircle } from 'lucide-react'

const STANCE_OPTIONS = ['진보', '중도진보', '중립', '중도보수', '보수'] as const
type StanceOption = typeof STANCE_OPTIONS[number]

const STANCE_COLORS: Record<string, string> = {
  진보: 'bg-blue-100 text-blue-700',
  중도진보: 'bg-sky-100 text-sky-700',
  중립: 'bg-gray-200 text-gray-700',
  중도보수: 'bg-orange-100 text-orange-700',
  보수: 'bg-red-100 text-red-700',
}

const STANCE_BTN: Record<StanceOption, string> = {
  진보: 'border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100',
  중도진보: 'border-sky-300 bg-sky-50 text-sky-700 hover:bg-sky-100',
  중립: 'border-gray-300 bg-gray-50 text-gray-700 hover:bg-gray-100',
  중도보수: 'border-orange-300 bg-orange-50 text-orange-700 hover:bg-orange-100',
  보수: 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100',
}

const PAGE_SIZE = 16

function formatTime(iso: string | null) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('ko-KR', {
    timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: true,
  })
}

function formatDate(iso: string | null) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('ko-KR', {
    timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit',
  }).replace(/\. /g, '.').replace(/\.$/, '')
}

/* ── 평가 모달 ── */
function LabelModal({
  item,
  onClose,
  detailLoading = false,
}: {
  item: Editorial
  onClose: () => void
  detailLoading?: boolean
}) {
  const [name, setName] = useState('')
  const [selected, setSelected] = useState<StanceOption | null>(null)
  const [note, setNote] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [existingLabels, setExistingLabels] = useState<EditorialLabel[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const stanceReason =
    (item.ai_analysis as Record<string, string> | null)?.final_reasoning ??
    (item.ai_analysis as Record<string, string> | null)?.stance_reason

  async function handleSubmit() {
    if (!name.trim()) { setError('이름을 입력해주세요.'); return }
    if (!selected) { setError('성향을 선택해주세요.'); return }
    setError(null)
    setLoading(true)
    try {
      await submitLabel(item.editorial_id, name, selected, note)
      const labels = await getEditorialLabels(item.editorial_id)
      setExistingLabels(labels)
      setSubmitted(true)
    } catch {
      setError('저장 실패. 다시 시도해주세요.')
    } finally {
      setLoading(false)
    }
  }

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
              <span className={`text-xs font-bold px-2 py-0.5 rounded flex-shrink-0 ${item.media_company?.is_our_company ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-700'}`}>
                {item.media_company?.name ?? '알 수 없음'}{item.media_company?.is_our_company ? ' ★' : ''}
              </span>
              <span className="text-xs text-gray-400">{formatDate(item.published_at)}</span>
              {item.topic && (
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{item.topic}</span>
              )}
              <a href={item.url} target="_blank" rel="noopener noreferrer"
                className="ml-auto text-xs text-blue-500 flex items-center gap-1 hover:text-blue-700">
                원문 <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <h2 className="text-base font-bold text-gray-900 leading-snug">{item.title}</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 ml-4 flex-shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">

          {/* 본문 */}
          {detailLoading ? (
            <div>
              <div className="h-3 w-16 bg-gray-200 rounded animate-pulse mb-2" />
              <div className="space-y-1.5">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className={`h-3 bg-gray-100 rounded animate-pulse ${i === 4 ? 'w-3/4' : 'w-full'}`} />
                ))}
              </div>
            </div>
          ) : (item.body || item.summary) ? (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">본문 요약</p>
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">
                {item.body ?? item.summary}
              </p>
            </div>
          ) : null}

          {!submitted ? (
            <>
              {/* 이름 입력 */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">평가자 이름</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="이름 입력"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-400"
                />
              </div>

              {/* 성향 선택 */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 block">성향 선택</label>
                <div className="flex gap-2 flex-wrap">
                  {STANCE_OPTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => setSelected(s)}
                      className={`px-4 py-2 rounded-lg border text-sm font-medium transition-all ${STANCE_BTN[s]} ${
                        selected === s ? 'ring-2 ring-offset-1 ring-current' : 'opacity-70'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              {/* 메모 */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">메모 (선택)</label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="판단 근거나 특이사항..."
                  rows={2}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-400 resize-none"
                />
              </div>

              {error && <p className="text-xs text-red-500">{error}</p>}

              <button
                onClick={handleSubmit}
                disabled={loading || !selected || !name.trim()}
                className="w-full py-2.5 bg-blue-800 text-white text-sm font-semibold rounded-lg hover:bg-blue-900 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? '저장 중...' : '평가 제출'}
              </button>
            </>
          ) : (
            <>
              {/* 제출 완료 */}
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle className="w-4 h-4" />
                <span className="text-sm font-semibold">평가 완료</span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500 mb-1">내 판단</p>
                  <span className={`text-sm font-bold px-2 py-0.5 rounded-full ${STANCE_COLORS[selected!] ?? 'bg-gray-100 text-gray-700'}`}>
                    {selected}
                  </span>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500 mb-1">AI 판단</p>
                  {item.stance_label ? (
                    <span className={`text-sm font-bold px-2 py-0.5 rounded-full ${STANCE_COLORS[item.stance_label] ?? 'bg-gray-100 text-gray-700'}`}>
                      {item.stance_label}
                      {' '}{selected === item.stance_label ? '✓ 일치' : '✗ 불일치'}
                    </span>
                  ) : (
                    <span className="text-sm text-gray-400">없음</span>
                  )}
                </div>
              </div>

              {stanceReason && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-1">AI 판단 근거</p>
                  <p className="text-xs text-gray-600 leading-relaxed">{stanceReason}</p>
                </div>
              )}

              {existingLabels.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-2">전체 평가 현황</p>
                  <div className="space-y-1.5">
                    {existingLabels.map((l) => (
                      <div key={l.label_id} className="flex items-center gap-2 text-xs">
                        <span className="text-gray-600 font-medium w-20 flex-shrink-0">{l.labeled_by}</span>
                        <span className={`px-2 py-0.5 rounded-full ${STANCE_COLORS[l.stance_label] ?? 'bg-gray-100 text-gray-700'}`}>
                          {l.stance_label}
                        </span>
                        {l.note && <span className="text-gray-400 truncate">{l.note}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <button
                onClick={onClose}
                className="w-full py-2.5 bg-gray-100 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-200 transition-colors"
              >
                닫기
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── 사설 카드 ── */
function LabelCard({ item, onEval }: { item: Editorial; onEval: () => void }) {
  const isOurs = item.media_company?.is_our_company
  return (
    <div className={`rounded-xl p-4 flex flex-col ${isOurs ? 'border-2 border-blue-700 bg-blue-50' : 'bg-white border border-gray-200'}`}>
      <div className="flex items-center justify-between mb-2">
        <span className={`text-xs font-semibold ${isOurs ? 'text-blue-800' : 'text-gray-600'}`}>
          {item.media_company?.name ?? '알 수 없음'}{isOurs ? ' ★' : ''}
        </span>
        <span className="text-xs text-gray-400">{formatTime(item.published_at)}</span>
      </div>
      <p className="text-sm font-semibold text-gray-900 leading-snug mb-2 line-clamp-2">{item.title}</p>
      {item.summary && (
        <p className="text-xs text-gray-500 leading-relaxed mb-3 line-clamp-3">{item.summary}</p>
      )}
      <div className="flex items-center gap-2 mt-auto flex-wrap">
        {item.stance_label && (
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STANCE_COLORS[item.stance_label] ?? 'bg-gray-100 text-gray-600'}`}>
            {item.stance_label}
          </span>
        )}
        {item.topic && (
          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{item.topic}</span>
        )}
        <button
          onClick={onEval}
          className="ml-auto text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-3 py-1 rounded-lg hover:bg-blue-100 transition-colors"
        >
          평가
        </button>
      </div>
    </div>
  )
}

/* ── 메인 ── */
export default function LabelClient({ editorials }: { editorials: Editorial[] }) {
  const [page, setPage] = useState(1)
  const [target, setTarget] = useState<Editorial | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  async function openModal(item: Editorial) {
    setTarget(item)
    setDetailLoading(true)
    try {
      const full = await getEditorialById(item.editorial_id)
      if (full) setTarget(full)
    } finally {
      setDetailLoading(false)
    }
  }

  const totalPages = Math.ceil(editorials.length / PAGE_SIZE)
  const pageItems = editorials.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  // 페이지 버튼 범위 (최대 7개 표시)
  const pageNums = Array.from({ length: totalPages }, (_, i) => i + 1).filter(
    (n) => n === 1 || n === totalPages || Math.abs(n - page) <= 2
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div className="text-sm text-gray-500">
          총 <strong className="text-gray-800">{editorials.length}건</strong>
          <span className="text-gray-300 mx-2">·</span>
          {page} / {totalPages} 페이지
        </div>
      </div>

      {/* 카드 그리드 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        {pageItems.map((item) => (
          <LabelCard key={item.editorial_id} item={item} onEval={() => openModal(item)} />
        ))}
      </div>

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1">
          <button
            onClick={() => setPage((p) => Math.max(p - 1, 1))}
            disabled={page === 1}
            className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            이전
          </button>
          {pageNums.map((n, i) => (
            <>
              {i > 0 && pageNums[i - 1] !== n - 1 && (
                <span key={`gap-${n}`} className="px-1 text-gray-400 text-sm">…</span>
              )}
              <button
                key={n}
                onClick={() => setPage(n)}
                className={`w-9 h-9 text-sm rounded-lg border transition-colors ${
                  n === page
                    ? 'bg-blue-800 text-white border-blue-800'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {n}
              </button>
            </>
          ))}
          <button
            onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
            disabled={page === totalPages}
            className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            다음
          </button>
        </div>
      )}

      {/* 평가 모달 */}
      {target && <LabelModal item={target} onClose={() => setTarget(null)} detailLoading={detailLoading} />}
    </div>
  )
}
