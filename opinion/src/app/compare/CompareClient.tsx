'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Copy, Check, RefreshCw, GitCompare, Loader2 } from 'lucide-react'
import DateNav from '@/components/DateNav'
import type { EditorialComparison, ComparisonResult } from '@/lib/comparison-queries'
import { generateComparison } from './actions'

interface Props {
  comparisons: EditorialComparison[]
  date: string
  today: string
  initialIssue: string | null
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('ko-KR', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
}

function mediaCount(c: EditorialComparison): number {
  return 1 + (c.result?.others?.length ?? 0)
}

function toMarkdown(issue: string, r: ComparisonResult): string {
  const lines = [
    `# ${issue}`,
    ``,
    `## 핵심 쟁점`,
    r.issue_summary,
    ``,
    `## 세계일보 논조`,
    r.segye_stance,
    ``,
    `## 타사 논조`,
    ...r.others.map((o) => `- **${o.media}**: ${o.stance}`),
    ``,
    `## 공통점`,
    r.common,
    ``,
    `## 차이점`,
    r.differences,
    ``,
    `## 세계일보 시사점·논의 포인트`,
    ...r.implications.map((i) => `- ${i}`),
  ]
  return lines.join('\n')
}

function updateUrlIssue(date: string, issue: string | null) {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  if (issue) url.searchParams.set('issue', issue)
  else url.searchParams.delete('issue')
  if (date) url.searchParams.set('date', date)
  window.history.replaceState({}, '', url.toString())
}

export default function CompareClient({ comparisons, date, today, initialIssue }: Props) {
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

  // ?issue= 딥링크: 캐시에 없으면 1회 자동 생성
  useEffect(() => {
    if (!initialIssue) return
    const exists = list.some((c) => c.issue === initialIssue)
    if (!exists && !attempted.current.has(initialIssue)) {
      attempted.current.add(initialIssue)
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

  return (
    <div>
      <DateNav date={date} today={today} basePath="/compare" />

      {/* === 상세 보기 === */}
      {selectedIssue ? (
        <div>
          <div className="flex items-center justify-between mb-4">
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
                  className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? '복사됨' : '복사'}
                </button>
              </div>
            )}
          </div>

          <h2 className="text-lg font-bold text-gray-900 mb-1">{selectedIssue}</h2>

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
            <ComparisonView issue={selectedIssue} result={selected.result} updatedAt={selected.updated_at} />
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
              {list.map((c) => (
                <button
                  key={c.comparison_id}
                  onClick={() => openDetail(c.issue)}
                  className="w-full text-left rounded-xl border border-gray-200 bg-white p-4 hover:border-blue-300 hover:shadow-sm transition-all"
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-sm font-bold text-gray-900">{c.issue}</span>
                    <span className="text-xs text-gray-400 flex-shrink-0">
                      세계일보 외 {mediaCount(c) - 1}개 매체
                    </span>
                    <span className="ml-auto text-xs text-gray-300 flex-shrink-0">
                      {formatTime(c.updated_at)}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 line-clamp-2">{c.result?.issue_summary}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h3 className="text-sm font-bold text-blue-800 mb-1.5">{title}</h3>
      {children}
    </div>
  )
}

function ComparisonView({
  issue,
  result,
  updatedAt,
}: {
  issue: string
  result: ComparisonResult
  updatedAt: string
}) {
  return (
    <div className="mt-3">
      <Section title="핵심 쟁점">
        <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{result.issue_summary}</p>
      </Section>

      <Section title="세계일보 논조·핵심 주장">
        <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{result.segye_stance}</p>
      </Section>

      <Section title="타사 논조">
        <div className="space-y-2">
          {result.others.map((o, i) => (
            <div key={i} className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
              <span className="text-xs font-semibold text-gray-600">{o.media}</span>
              <p className="text-sm text-gray-700 leading-relaxed mt-0.5 whitespace-pre-line">{o.stance}</p>
            </div>
          ))}
        </div>
      </Section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Section title="공통점">
          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{result.common}</p>
        </Section>
        <Section title="차이점">
          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{result.differences}</p>
        </Section>
      </div>

      <Section title="세계일보 시사점·논의 포인트">
        <ul className="space-y-1.5">
          {result.implications.map((im, i) => (
            <li key={i} className="flex gap-2 text-sm text-gray-700 leading-relaxed">
              <span className="text-blue-600 flex-shrink-0">•</span>
              <span>{im}</span>
            </li>
          ))}
        </ul>
      </Section>

      <p className="text-xs text-gray-300 mt-4">{issue} · 생성 {formatTime(updatedAt)}</p>
    </div>
  )
}
