'use client'

import { useState, useEffect, useRef, useTransition } from 'react'
import { Plus, Trash2, X, Copy, Printer, Eye, Edit3, ChevronLeft, ChevronRight } from 'lucide-react'
import type { DailyReport, ReportSection, ReportArticle, ReportSource } from '@/lib/report-queries'
import ArticleSearchModal from '@/components/ArticleSearchModal'
import {
  ensureReport,
  addSection,
  updateSection,
  deleteSection,
  addArticle,
  deleteArticle,
} from './actions'

type SaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error'

interface Props {
  initialReport: DailyReport | null
  date: string
}

function formatHeader(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00+09:00')
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const weekday = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()]
  return `${y}.${m}.${day} (${weekday}) 일일 보고`
}

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00+09:00')
  d.setDate(d.getDate() + days)
  return d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
}

function formatSavedAt(ts: number) {
  const d = new Date(ts)
  return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
}

export default function ReportClient({ initialReport, date }: Props) {
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
  const [reportId, setReportId] = useState<number | null>(initialReport?.report_id ?? null)
  const [sections, setSections] = useState<ReportSection[]>(initialReport?.sections ?? [])
  const [viewMode, setViewMode] = useState(false)
  const [searchTarget, setSearchTarget] = useState<{ sectionId: number; sectionIndex: number; source: ReportSource } | null>(null)
  const [globalSaveState, setGlobalSaveState] = useState<SaveState>('idle')
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null)
  const [, startTransition] = useTransition()

  function bumpSavedAt() {
    setLastSavedAt(Date.now())
    setGlobalSaveState('saved')
  }

  async function getOrCreateReportId(): Promise<number> {
    if (reportId) return reportId
    setGlobalSaveState('saving')
    const id = await ensureReport(date)
    setReportId(id)
    return id
  }

  async function handleAddSection() {
    try {
      setGlobalSaveState('saving')
      const id = await getOrCreateReportId()
      const sectionId = await addSection(id)
      setSections((prev) => [
        ...prev,
        { section_id: sectionId, report_id: id, sort_order: prev.length + 1, title: '', comment: '', articles: [] },
      ])
      bumpSavedAt()
    } catch (e) {
      console.error(e)
      setGlobalSaveState('error')
    }
  }

  async function handleDeleteSection(sectionId: number) {
    if (!confirm('이 보고 항목을 삭제하시겠습니까?')) return
    try {
      setGlobalSaveState('saving')
      await deleteSection(sectionId)
      setSections((prev) => prev.filter((s) => s.section_id !== sectionId))
      bumpSavedAt()
    } catch (e) {
      console.error(e)
      setGlobalSaveState('error')
    }
  }

  function handleSectionPatched() {
    bumpSavedAt()
  }

  function handleSectionPending() {
    setGlobalSaveState('pending')
  }

  function handleSectionSaving() {
    setGlobalSaveState('saving')
  }

  function handleSectionError() {
    setGlobalSaveState('error')
  }

  async function handleAddArticle(item: { article_id: number; title: string; url: string; published_at: string | null; media_name: string }) {
    if (!searchTarget) return
    const { sectionId, source } = searchTarget
    try {
      setGlobalSaveState('saving')
      const refId = await addArticle(sectionId, {
        source,
        article_id: item.article_id,
        article_url: item.url,
        article_title: item.title,
        media_name: item.media_name,
        published_at: item.published_at,
      })
      setSections((prev) =>
        prev.map((s) =>
          s.section_id === sectionId
            ? {
                ...s,
                articles: [
                  ...s.articles,
                  {
                    article_ref_id: refId,
                    section_id: sectionId,
                    sort_order: s.articles.filter((a) => a.source === source).length + 1,
                    source,
                    article_id: item.article_id,
                    article_url: item.url,
                    article_title: item.title,
                    media_name: item.media_name,
                    published_at: item.published_at,
                  },
                ],
              }
            : s,
        ),
      )
      bumpSavedAt()
      setSearchTarget(null)
    } catch (e) {
      console.error(e)
      setGlobalSaveState('error')
    }
  }

  async function handleDeleteArticle(sectionId: number, refId: number) {
    try {
      setGlobalSaveState('saving')
      await deleteArticle(refId)
      setSections((prev) =>
        prev.map((s) =>
          s.section_id === sectionId
            ? { ...s, articles: s.articles.filter((a) => a.article_ref_id !== refId) }
            : s,
        ),
      )
      bumpSavedAt()
    } catch (e) {
      console.error(e)
      setGlobalSaveState('error')
    }
  }

  function goToDate(target: string) {
    const url = target >= today ? '/report' : `/report?date=${target}`
    startTransition(() => {
      window.location.href = url
    })
  }

  function handleCopy() {
    const lines: string[] = []
    lines.push(`${formatHeader(date)}\n`)
    sections.forEach((s, i) => {
      lines.push(`\n${i + 1}. ${s.title || '(제목 없음)'}\n`)
      const segye = s.articles.filter((a) => a.source === 'segye')
      const other = s.articles.filter((a) => a.source === 'other')
      if (segye.length > 0) {
        lines.push('  [세계일보]')
        segye.forEach((a) => lines.push(`   · ${a.article_title}`))
      }
      if (other.length > 0) {
        lines.push('  [타 매체]')
        other.forEach((a) => lines.push(`   · ${a.media_name} — ${a.article_title}`))
      }
      if (s.comment.trim()) lines.push(`  💬 ${s.comment}`)
    })
    navigator.clipboard.writeText(lines.join('\n'))
    alert('클립보드에 복사되었습니다.')
  }

  const isToday = date >= today

  return (
    <div className={`mx-auto max-w-6xl px-6 py-6 ${viewMode ? 'view-mode' : ''}`}>
      <style jsx global>{`
        .view-mode .edit-only { display: none !important; }
        .view-mode textarea {
          border: none !important;
          background: transparent !important;
          padding: 0 !important;
          pointer-events: none;
        }
        .view-mode input[type='text'] {
          border: none !important;
          background: transparent !important;
          padding: 0 !important;
          pointer-events: none;
        }
      `}</style>

      {/* 헤더 */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => goToDate(shiftDate(date, -1))}
            className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h1 className="text-xl font-bold text-gray-900">{formatHeader(date)}</h1>
          <button
            onClick={() => goToDate(shiftDate(date, 1))}
            disabled={isToday}
            className={`rounded-lg p-1.5 ${isToday ? 'cursor-not-allowed text-gray-300' : 'text-gray-500 hover:bg-gray-100'}`}
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <SaveIndicator state={globalSaveState} savedAt={lastSavedAt} className="edit-only mr-1" />

          <button
            onClick={handleAddSection}
            className="edit-only flex items-center gap-1 rounded-lg bg-blue-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-800"
          >
            <Plus className="h-3.5 w-3.5" />
            보고 항목 추가
          </button>
          <button
            onClick={handleCopy}
            className="edit-only flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
          >
            <Copy className="h-3.5 w-3.5" />
            복사
          </button>
          <button
            onClick={() => window.print()}
            className="edit-only flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
          >
            <Printer className="h-3.5 w-3.5" />
            인쇄
          </button>
          {viewMode ? (
            <button
              onClick={() => setViewMode(false)}
              className="flex items-center gap-1 rounded-lg bg-blue-800 px-3 py-1.5 text-xs text-white hover:bg-blue-900"
            >
              <Edit3 className="h-3.5 w-3.5" />
              편집으로
            </button>
          ) : (
            <button
              onClick={() => setViewMode(true)}
              className="edit-only flex items-center gap-1 rounded-lg bg-blue-800 px-3 py-1.5 text-xs text-white hover:bg-blue-900"
            >
              <Eye className="h-3.5 w-3.5" />
              보기 모드
            </button>
          )}
        </div>
      </div>

      {/* 빈 상태 */}
      {sections.length === 0 && (
        <div className="rounded-xl border-2 border-dashed border-gray-300 bg-white p-12 text-center">
          <p className="mb-4 text-sm text-gray-500">아직 작성된 보고 항목이 없습니다.</p>
          <button
            onClick={handleAddSection}
            className="edit-only inline-flex items-center gap-1 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800"
          >
            <Plus className="h-4 w-4" />첫 보고 항목 추가
          </button>
        </div>
      )}

      {/* 보고 항목 그리드 */}
      {sections.length > 0 && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {sections.map((s, idx) => (
            <SectionCard
              key={s.section_id}
              section={s}
              index={idx + 1}
              onDelete={() => handleDeleteSection(s.section_id)}
              onOpenSearch={(source) =>
                setSearchTarget({ sectionId: s.section_id, sectionIndex: idx + 1, source })
              }
              onDeleteArticle={(refId) => handleDeleteArticle(s.section_id, refId)}
              onPatched={handleSectionPatched}
              onPending={handleSectionPending}
              onSaving={handleSectionSaving}
              onError={handleSectionError}
            />
          ))}
        </div>
      )}

      {searchTarget && (
        <ArticleSearchModal
          source={searchTarget.source}
          sectionIndex={searchTarget.sectionIndex}
          onSelect={handleAddArticle}
          onClose={() => setSearchTarget(null)}
        />
      )}
    </div>
  )
}

// ─────────────── 저장 상태 인디케이터 ───────────────
function SaveIndicator({
  state,
  savedAt,
  className,
}: {
  state: SaveState
  savedAt: number | null
  className?: string
}) {
  let text = ''
  let color = 'text-gray-400'

  if (state === 'pending') {
    text = '저장 대기 중...'
    color = 'text-gray-400'
  } else if (state === 'saving') {
    text = '저장 중...'
    color = 'text-blue-600'
  } else if (state === 'saved' && savedAt) {
    text = `자동 저장됨 · ${formatSavedAt(savedAt)}`
    color = 'text-gray-500'
  } else if (state === 'error') {
    text = '⚠ 저장 실패'
    color = 'text-red-600'
  } else {
    text = ''
  }

  return <span className={`text-xs ${color} ${className ?? ''}`}>{text}</span>
}

// ─────────────── 보고 항목 카드 ───────────────
interface SectionCardProps {
  section: ReportSection
  index: number
  onDelete: () => void
  onOpenSearch: (source: ReportSource) => void
  onDeleteArticle: (refId: number) => void
  onPatched: () => void
  onPending: () => void
  onSaving: () => void
  onError: () => void
}

function SectionCard({
  section,
  index,
  onDelete,
  onOpenSearch,
  onDeleteArticle,
  onPatched,
  onPending,
  onSaving,
  onError,
}: SectionCardProps) {
  const [title, setTitle] = useState(section.title)
  const [comment, setComment] = useState(section.comment)
  const initialMount = useRef(true)
  const saveTimer = useRef<NodeJS.Timeout | null>(null)

  // section prop이 외부에서 갱신되면 동기화
  useEffect(() => {
    setTitle(section.title)
    setComment(section.comment)
  }, [section.section_id])

  // title/comment 변경 시 debounce save
  useEffect(() => {
    if (initialMount.current) {
      initialMount.current = false
      return
    }
    onPending()
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      try {
        onSaving()
        await updateSection(section.section_id, { title, comment })
        onPatched()
      } catch (e) {
        console.error(e)
        onError()
      }
    }, 1000)
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, comment])

  const segyeArticles = section.articles.filter((a) => a.source === 'segye')
  const otherArticles = section.articles.filter((a) => a.source === 'other')

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5">
      <div className="mb-4 flex items-center gap-3 border-b border-gray-100 pb-3">
        <span className="inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-blue-700 text-xs font-bold text-white">
          {index}
        </span>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="보고 항목 제목"
          className="flex-1 border-b border-transparent bg-transparent text-base font-bold text-gray-900 focus:border-blue-400 focus:outline-none"
        />
        <button
          onClick={onDelete}
          className="edit-only rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500"
          title="이 항목 삭제"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {/* 세계일보 */}
      <div className="mb-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-bold text-blue-800">세계일보 ★</span>
          <span className="text-xs text-gray-400">{segyeArticles.length}건</span>
        </div>
        {segyeArticles.length > 0 && (
          <div className="mb-2 space-y-1.5">
            {segyeArticles.map((a) => (
              <ArticleChip key={a.article_ref_id} article={a} onDelete={() => onDeleteArticle(a.article_ref_id)} />
            ))}
          </div>
        )}
        <button
          onClick={() => onOpenSearch('segye')}
          className="edit-only w-full rounded-lg border border-dashed border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100"
        >
          + 세계일보 기사 검색
        </button>
      </div>

      {/* 타 매체 */}
      <div className="mb-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-bold text-gray-700">타 매체</span>
          <span className="text-xs text-gray-400">{otherArticles.length}건</span>
        </div>
        {otherArticles.length > 0 && (
          <div className="mb-2 space-y-1.5">
            {otherArticles.map((a) => (
              <ArticleChip key={a.article_ref_id} article={a} onDelete={() => onDeleteArticle(a.article_ref_id)} />
            ))}
          </div>
        )}
        <button
          onClick={() => onOpenSearch('other')}
          className="edit-only w-full rounded-lg border border-dashed border-gray-300 bg-gray-50 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-100"
        >
          + 타 매체 기사 검색
        </button>
      </div>

      {/* 코멘트 */}
      <div className="rounded-lg" style={{ background: '#F9FAFB', borderLeft: '3px solid #1E40AF', padding: '10px 14px' }}>
        <label className="edit-only mb-2 block text-xs font-semibold text-blue-700">💬 논설위원 코멘트</label>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={4}
          placeholder="이 보고 항목에 대한 코멘트..."
          className="w-full resize-y rounded-lg border border-gray-200 bg-white p-3 text-sm leading-relaxed text-gray-700 focus:border-blue-400 focus:outline-none"
        />
      </div>
    </div>
  )
}

// ─────────────── 기사 chip ───────────────
function ArticleChip({ article, onDelete }: { article: ReportArticle; onDelete: () => void }) {
  const isOurs = article.source === 'segye'
  return (
    <div
      className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${
        isOurs ? 'border-blue-200 bg-gradient-to-br from-blue-50 to-white' : 'border-gray-200 bg-white'
      }`}
    >
      {!isOurs && (
        <span className="flex-shrink-0 text-xs font-semibold text-gray-700">{article.media_name}</span>
      )}
      <a
        href={article.article_url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex-1 truncate text-sm text-gray-800 hover:underline"
        title={article.article_title}
      >
        {article.article_title}
      </a>
      <button
        onClick={onDelete}
        className="edit-only flex-shrink-0 text-gray-300 hover:text-red-500"
        title="삭제"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
