'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Copy, Check, RefreshCw, GitCompare, Loader2, Printer, Trash2, Pencil, X } from 'lucide-react'
import DateNav from '@/components/DateNav'
import type { EditorialComparison, ComparisonResult } from '@/lib/comparison-queries'
import { generateComparison, deleteComparison, updateComparisonResult } from './actions'

interface Props {
  comparisons: EditorialComparison[]
  date: string
  today: string
  initialIssue: string | null
  initialRegen?: boolean
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('ko-KR', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
}

function hasSegyeStance(r: ComparisonResult | null | undefined): boolean {
  return !!r?.segye_stance?.trim()
}

/** 그룹의 총 매체 수 (세계일보 포함 그룹은 others + 1, 미포함은 others 전부) */
function totalMedia(c: EditorialComparison): number {
  const others = c.result?.others?.length ?? 0
  return others + (hasSegyeStance(c.result) ? 1 : 0)
}

function toMarkdown(issue: string, r: ComparisonResult): string {
  const hasSegye = hasSegyeStance(r)
  const lines = [
    `# ${issue}`,
    ``,
    `## 핵심 쟁점`,
    r.issue_summary,
    ``,
  ]
  if (hasSegye) {
    lines.push(`## 세계일보 논조`, r.segye_stance, ``)
  }
  lines.push(
    `## ${hasSegye ? '타사 논조' : '매체별 논조'}`,
    ...r.others.map((o) => `- **${o.media}**: ${o.stance}`),
    ``,
    `## 공통점`,
    r.common,
    ``,
    `## 차이점`,
    r.differences,
    ``,
    `## ${hasSegye ? '세계일보 시사점·논의 포인트' : '종합 시사점·논의 포인트'}`,
    ...r.implications.map((i) => `- ${i}`),
  )
  return lines.join('\n')
}

function updateUrlIssue(date: string, issue: string | null) {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  if (issue) url.searchParams.set('issue', issue)
  else url.searchParams.delete('issue')
  if (date) url.searchParams.set('date', date)
  url.searchParams.delete('regen')
  window.history.replaceState({}, '', url.toString())
}

export default function CompareClient({ comparisons, date, today, initialIssue, initialRegen = false }: Props) {
  const [list, setList] = useState<EditorialComparison[]>(comparisons)
  const [selectedIssue, setSelectedIssue] = useState<string | null>(initialIssue)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const attempted = useRef<Set<string>>(new Set())

  const selected = selectedIssue ? list.find((c) => c.issue === selectedIssue) ?? null : null

  async function runGenerate(issue: string) {
    setGenerating(true)
    setError(null)
    try {
      const row = await generateComparison(date, issue)
      setList((prev) => {
        const rest = prev.filter((c) => c.issue !== issue)
        return [row, ...rest]
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : '비교 분석 생성에 실패했습니다.')
    } finally {
      setGenerating(false)
    }
  }

  // ?issue= 딥링크: 캐시에 없으면 1회 자동 생성. ?regen=1 이면 캐시 있어도 강제 재생성.
  useEffect(() => {
    if (!initialIssue) return
    const exists = list.some((c) => c.issue === initialIssue)
    if (!attempted.current.has(initialIssue) && (!exists || initialRegen)) {
      attempted.current.add(initialIssue)
      // regen 파라미터는 URL 에서 제거 (새로고침 시 재재생성 방지)
      updateUrlIssue(date, initialIssue)
      runGenerate(initialIssue)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialIssue])

  function openDetail(issue: string) {
    setSelectedIssue(issue)
    setError(null)
    updateUrlIssue(date, issue)
  }

  function backToList() {
    setSelectedIssue(null)
    setError(null)
    updateUrlIssue(date, null)
  }

  async function regenerate(issue: string) {
    attempted.current.add(issue)
    await runGenerate(issue)
  }

  async function copyReport() {
    if (!selected) return
    await navigator.clipboard.writeText(toMarkdown(selected.issue, selected.result))
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  async function handleDelete(issue: string) {
    if (!confirm('이 비교 보고서를 삭제할까요?')) return
    try {
      await deleteComparison(date, issue)
      setList((prev) => prev.filter((c) => c.issue !== issue))
      if (selectedIssue === issue) backToList()
    } catch (e) {
      alert(e instanceof Error ? e.message : '삭제에 실패했습니다.')
    }
  }

  // 섹션 인라인 수정 저장 → DB 업데이트 후 list 갱신
  async function saveResult(issue: string, newResult: ComparisonResult) {
    const row = await updateComparisonResult(date, issue, newResult)
    setList((prev) => prev.map((c) => (c.issue === issue ? row : c)))
  }

  return (
    <div>
      <div className="no-print">
        <DateNav date={date} today={today} basePath="/compare" />
      </div>

      {/* === 상세 보기 === */}
      {selectedIssue ? (
        <div>
          <div className="flex items-center justify-between mb-4 no-print">
            <button
              onClick={backToList}
              className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" /> 목록
            </button>
            {selected && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => regenerate(selectedIssue)}
                  disabled={generating}
                  className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${generating ? 'animate-spin' : ''}`} /> 재생성
                </button>
                <button
                  onClick={copyReport}
                  className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? '복사됨' : '복사'}
                </button>
                <button
                  onClick={() => window.print()}
                  className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
                >
                  <Printer className="w-3.5 h-3.5" /> 인쇄
                </button>
                <button
                  onClick={() => handleDelete(selectedIssue)}
                  className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50"
                >
                  <Trash2 className="w-3.5 h-3.5" /> 삭제
                </button>
              </div>
            )}
          </div>

          <h2 className="text-lg font-bold text-gray-900 mb-1 no-print">{selectedIssue}</h2>

          {generating && (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <Loader2 className="w-8 h-8 animate-spin mb-3 text-blue-600" />
              <p className="text-sm">AI가 사설을 비교 분석 중입니다… (최대 30초)</p>
            </div>
          )}

          {!generating && error && (
            <div className="py-16 text-center">
              <p className="text-sm text-red-600 mb-4">{error}</p>
              <button
                onClick={() => regenerate(selectedIssue)}
                className="text-sm px-4 py-2 rounded-lg bg-blue-800 text-white hover:bg-blue-900"
              >
                다시 시도
              </button>
            </div>
          )}

          {!generating && !error && selected && (
            <div className="print-area">
              <div className="print-only mb-4 border-b border-gray-300 pb-2">
                <p className="text-xs text-gray-500">세계일보 논설실 · today 사설 분석 · {date}</p>
                <h2 className="text-lg font-bold text-gray-900 mt-1">{selectedIssue}</h2>
              </div>
              <ComparisonView
                issue={selectedIssue}
                result={selected.result}
                updatedAt={selected.updated_at}
                onSave={(r) => saveResult(selectedIssue, r)}
              />
            </div>
          )}
        </div>
      ) : (
        /* === 카드 리스트 === */
        <div>
          {list.length === 0 ? (
            <div className="text-center py-20 text-gray-400">
              <GitCompare className="w-10 h-10 mx-auto mb-3 text-gray-300" />
              <p className="text-sm">생성된 비교 분석이 없습니다.</p>
              <p className="text-xs mt-1">오늘의 사설에서 멀티-매체 그룹의 &quot;언론사 비교&quot;를 눌러 생성하세요.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {list.map((c) => {
                const segye = hasSegyeStance(c.result)
                const total = totalMedia(c)
                return (
                  <div
                    key={c.comparison_id}
                    role="button"
                    tabIndex={0}
                    onClick={() => openDetail(c.issue)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') openDetail(c.issue) }}
                    className="group w-full text-left rounded-xl border border-gray-200 bg-white p-4 hover:border-blue-300 hover:shadow-sm transition-all cursor-pointer"
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-sm font-bold text-gray-900">{c.issue}</span>
                      {segye ? (
                        <span className="flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-medium">
                          자사 포함
                        </span>
                      ) : (
                        <span className="flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 font-medium">
                          매체 비교
                        </span>
                      )}
                      <span className="text-xs text-gray-400 flex-shrink-0">
                        {segye ? `세계일보 외 ${total - 1}개 매체` : `${total}개 매체`}
                      </span>
                      <span className="ml-auto text-xs text-gray-300 flex-shrink-0">
                        {formatTime(c.updated_at)}
                      </span>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(c.issue) }}
                        title="삭제"
                        aria-label="비교 보고서 삭제"
                        className="flex-shrink-0 text-gray-300 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <p className="text-xs text-gray-500 line-clamp-2">{c.result?.issue_summary}</p>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** 섹션 박스 — 제목 우측 연필(수정) 버튼 옵션 */
function Section({
  title,
  onEdit,
  children,
}: {
  title: string
  onEdit?: () => void
  children: React.ReactNode
}) {
  return (
    <div className="mb-5 report-section">
      <div className="flex items-center gap-1.5 mb-1.5">
        <h3 className="text-sm font-bold text-blue-800">{title}</h3>
        {onEdit && (
          <button
            onClick={onEdit}
            title="수정"
            aria-label={`${title} 수정`}
            className="no-print text-gray-300 hover:text-blue-600 transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      {children}
    </div>
  )
}

/** 인라인 편집 textarea + 저장/취소 */
function EditBox({
  value,
  onChange,
  onSave,
  onCancel,
  saving,
  rows = 5,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  onSave: () => void
  onCancel: () => void
  saving: boolean
  rows?: number
  placeholder?: string
}) {
  return (
    <div className="no-print">
      <textarea
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        className="w-full text-sm text-gray-700 leading-relaxed border border-blue-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400 resize-y"
      />
      <div className="flex items-center gap-2 mt-1.5">
        <button
          onClick={onSave}
          disabled={saving}
          className="flex items-center gap-1 text-xs px-3 py-1 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} 저장
        </button>
        <button
          onClick={onCancel}
          disabled={saving}
          className="flex items-center gap-1 text-xs px-3 py-1 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-50"
        >
          <X className="w-3.5 h-3.5" /> 취소
        </button>
      </div>
    </div>
  )
}

function ComparisonView({
  issue,
  result,
  updatedAt,
  onSave,
}: {
  issue: string
  result: ComparisonResult
  updatedAt: string
  onSave: (r: ComparisonResult) => Promise<void>
}) {
  const hasSegye = hasSegyeStance(result)
  // editing = 편집 중인 필드 식별자 ('issue_summary' | 'segye_stance' | 'common' | 'differences' | 'implications' | `other:${i}`)
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)

  function start(field: string, value: string) {
    setEditing(field)
    setDraft(value)
  }

  function cancel() {
    setEditing(null)
    setDraft('')
  }

  async function commit(apply: (r: ComparisonResult) => ComparisonResult) {
    setSaving(true)
    try {
      await onSave(apply(result))
      setEditing(null)
      setDraft('')
    } catch (e) {
      alert(e instanceof Error ? e.message : '저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const text = 'text-sm text-gray-700 leading-relaxed whitespace-pre-line'

  return (
    <div className="mt-3">
      <Section title="핵심 쟁점" onEdit={() => start('issue_summary', result.issue_summary)}>
        {editing === 'issue_summary' ? (
          <EditBox
            value={draft}
            onChange={setDraft}
            onSave={() => commit((r) => ({ ...r, issue_summary: draft }))}
            onCancel={cancel}
            saving={saving}
          />
        ) : (
          <p className={text}>{result.issue_summary}</p>
        )}
      </Section>

      {hasSegye && (
        <Section title="세계일보 논조·핵심 주장" onEdit={() => start('segye_stance', result.segye_stance)}>
          {editing === 'segye_stance' ? (
            <EditBox
              value={draft}
              onChange={setDraft}
              onSave={() => commit((r) => ({ ...r, segye_stance: draft }))}
              onCancel={cancel}
              saving={saving}
              rows={7}
            />
          ) : (
            <p className={text}>{result.segye_stance}</p>
          )}
        </Section>
      )}

      <Section title={hasSegye ? '타사 논조' : '매체별 논조'}>
        <div className="space-y-2">
          {result.others.map((o, i) => {
            const field = `other:${i}`
            return (
              <div key={i} className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 print-keep">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-gray-600">{o.media}</span>
                  <button
                    onClick={() => start(field, o.stance)}
                    title="수정"
                    aria-label={`${o.media} 논조 수정`}
                    className="no-print text-gray-300 hover:text-blue-600 transition-colors"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                </div>
                {editing === field ? (
                  <div className="mt-1">
                    <EditBox
                      value={draft}
                      onChange={setDraft}
                      onSave={() =>
                        commit((r) => ({
                          ...r,
                          others: r.others.map((x, xi) => (xi === i ? { ...x, stance: draft } : x)),
                        }))
                      }
                      onCancel={cancel}
                      saving={saving}
                      rows={4}
                    />
                  </div>
                ) : (
                  <p className="text-sm text-gray-700 leading-relaxed mt-0.5 whitespace-pre-line">{o.stance}</p>
                )}
              </div>
            )
          })}
        </div>
      </Section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Section title="공통점" onEdit={() => start('common', result.common)}>
          {editing === 'common' ? (
            <EditBox
              value={draft}
              onChange={setDraft}
              onSave={() => commit((r) => ({ ...r, common: draft }))}
              onCancel={cancel}
              saving={saving}
              rows={4}
            />
          ) : (
            <p className={text}>{result.common}</p>
          )}
        </Section>
        <Section title="차이점" onEdit={() => start('differences', result.differences)}>
          {editing === 'differences' ? (
            <EditBox
              value={draft}
              onChange={setDraft}
              onSave={() => commit((r) => ({ ...r, differences: draft }))}
              onCancel={cancel}
              saving={saving}
              rows={4}
            />
          ) : (
            <p className={text}>{result.differences}</p>
          )}
        </Section>
      </div>

      <Section
        title={hasSegye ? '세계일보 시사점·논의 포인트' : '종합 시사점·논의 포인트'}
        onEdit={() => start('implications', result.implications.join('\n'))}
      >
        {editing === 'implications' ? (
          <EditBox
            value={draft}
            onChange={setDraft}
            onSave={() =>
              commit((r) => ({
                ...r,
                implications: draft.split('\n').map((s) => s.trim()).filter(Boolean),
              }))
            }
            onCancel={cancel}
            saving={saving}
            rows={7}
            placeholder="한 줄에 하나씩 입력"
          />
        ) : (
          <ul className="space-y-1.5">
            {result.implications.map((im, i) => (
              <li key={i} className="flex gap-2 text-sm text-gray-700 leading-relaxed print-keep">
                <span className="text-blue-600 flex-shrink-0">•</span>
                <span>{im}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <p className="text-xs text-gray-300 mt-4">{issue} · 생성 {formatTime(updatedAt)}</p>
    </div>
  )
}
