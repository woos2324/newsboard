"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { X, ExternalLink, Sparkles, FileText, Loader2, AlertTriangle } from "lucide-react";
import { useRouter } from "next/navigation";
import { InfoTip } from "@/components/InfoTip";
import type { TrendingWithCoverage } from "@/lib/queries";

// ---------------------------------------------------------------------------
// 신선도 헬퍼
// ---------------------------------------------------------------------------

function freshnessSignal(startedAt: string | null): { emoji: string; label: string } {
  if (!startedAt) return { emoji: "⚪", label: "알 수 없음" };
  const diffH = (Date.now() - new Date(startedAt).getTime()) / 3600000;
  if (diffH <= 1) return { emoji: "🟢", label: "최신 (1시간 이내)" };
  if (diffH <= 6) return { emoji: "🟡", label: "보통 (6시간 이내)" };
  return { emoji: "🔴", label: "오래됨 (6시간 초과)" };
}

function formatGrowth(rate: number | null): string {
  if (rate === null) return "-";
  return `↑${rate.toLocaleString()}%`;
}

// ---------------------------------------------------------------------------
// InfoTip 툴팁 문구
// ---------------------------------------------------------------------------

const TIPS = {
  rank: "구글이 집계한 실시간 트렌드 순위",
  volume: "구글 추정 검색 횟수 (대략값)",
  growth: "직전 대비 검색량 급상승 비율. 높을수록 빠르게 뜨는 중",
  freshness: "트렌드가 처음 감지된 시점. 🟢 1시간 이내 · 🟡 1~6시간 · 🔴 6시간 초과",
  coverage: "세계일보 보도 여부 (전체 발행 기사 기준 추정). 참고용",
  relatedQueries: "함께 검색되는 연관어 (소제목·키워드 힌트)",
  relatedNews: "구글이 노출한 관련 기사 (최대 3건). 어떤 매체가 어떤 앵글로 썼는지 참고",
  trendChart: "우리가 3분마다 수집한 검색량 추이 (구글 비공개 데이터)",
};

// ---------------------------------------------------------------------------
// 정렬 타입
// ---------------------------------------------------------------------------

type SortKey = "rank" | "freshness" | "growth" | "volume";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "rank", label: "구글 순위" },
  { key: "freshness", label: "신선도" },
  { key: "growth", label: "증가율" },
  { key: "volume", label: "검색량" },
];

// ---------------------------------------------------------------------------
// 추이 미니 SVG 그래프
// ---------------------------------------------------------------------------

function MiniChart({ history }: { history: { fetched_at: string; search_volume: number | null }[] }) {
  const valid = history.filter((h) => h.search_volume !== null);
  if (valid.length < 2) {
    return (
      <p className="text-xs text-muted italic">
        관측 데이터 누적 중 (3분 주기 수집, 수 시간 후 그래프 활성화)
      </p>
    );
  }
  const volumes = valid.map((h) => h.search_volume as number);
  const min = Math.min(...volumes);
  const max = Math.max(...volumes);
  const range = max - min || 1;
  const W = 280;
  const H = 60;
  const pts = valid.map((h, i) => {
    const x = (i / (valid.length - 1)) * W;
    const y = H - (((h.search_volume as number) - min) / range) * H;
    return `${x},${y}`;
  });
  const polyline = pts.join(" ");
  const area = `0,${H} ${polyline} ${W},${H}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 60 }}>
      <polygon points={area} fill="#EFF6FF" />
      <polyline points={polyline} fill="none" stroke="#1E40AF" strokeWidth="1.5" />
      {valid.length > 0 && (
        <circle
          cx={W}
          cy={H - (((valid[valid.length - 1].search_volume as number) - min) / range) * H}
          r="3"
          fill="#1E40AF"
        />
      )}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// 초안 작성 섹션 (reporter 전용)
// ---------------------------------------------------------------------------

type DraftStep =
  | { type: "idle" }
  | { type: "confirm_no_profile" }
  | { type: "extracting" }
  | { type: "generating" }
  | { type: "error"; message: string };

interface DraftItem {
  id: number;
  keyword: string;
  title: string;
  status: string;
  created_at: string;
}

interface DraftSectionProps {
  item: TrendingWithCoverage;
  userId: string;
  reporterId: string;
}

function DraftSection({ item, userId, reporterId }: DraftSectionProps) {
  const router = useRouter();
  const [step, setStep] = useState<DraftStep>({ type: "idle" });
  const [drafts, setDrafts] = useState<DraftItem[]>([]);

  // 키워드 변경 시마다 초안 목록 새로 로드
  useEffect(() => {
    let cancelled = false;
    async function loadDrafts() {
      try {
        const res = await fetch(`/api/autowrite/drafts?keyword=${encodeURIComponent(item.keyword)}`);
        if (res.ok && !cancelled) {
          const data = await res.json();
          setDrafts(data.drafts ?? []);
        }
      } catch {
        // 목록 로드 실패는 무시
      }
    }
    setDrafts([]);
    setStep({ type: "idle" });
    loadDrafts();
    return () => { cancelled = true; };
  }, [item.keyword]);

  const handleStart = async () => {
    // reporter_id로 프로파일 존재 여부 확인
    if (!reporterId) {
      setStep({ type: "confirm_no_profile" });
      return;
    }
    // 프로파일 DB 조회는 초안 생성 API에서 처리 — 여기선 바로 진행
    await runGenerate(true);
  };

  const runGenerate = async (withProfile: boolean) => {
    setStep({ type: "extracting" });
    try {
      // 팩트 추출
      const factsRes = await fetch("/api/autowrite/facts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keyword: item.keyword,
          related_news: item.related_news ?? [],
        }),
      });
      if (!factsRes.ok) throw new Error("팩트 추출에 실패했습니다.");

      setStep({ type: "generating" });

      // 초안 생성
      const draftRes = await fetch("/api/autowrite/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keyword: item.keyword,
          user_id: userId,
          reporter_id: withProfile ? reporterId : null,
          related_news: item.related_news ?? [],
        }),
      });
      if (!draftRes.ok) {
        const err = await draftRes.json().catch(() => ({}));
        throw new Error(err.detail ?? "초안 생성에 실패했습니다.");
      }

      const draft = await draftRes.json();
      router.push(`/autowrite/${draft.draft_id}`);
    } catch (e) {
      setStep({ type: "error", message: e instanceof Error ? e.message : "알 수 없는 오류가 발생했습니다." });
    }
  };

  const isMissed = !item.covered;
  const hasRelatedNews = (item.related_news ?? []).length > 0;
  const canGenerate = isMissed && hasRelatedNews;

  return (
    <div>
      <p className="mb-2 flex items-center gap-1 text-xs font-semibold text-muted">
        <FileText className="h-3 w-3" /> 초안 작성
      </p>

      {/* 기존 초안 목록 */}
      {drafts.length > 0 && (
        <ul className="mb-3 space-y-1.5">
          {drafts.map((d) => (
            <li key={d.id}>
              <button
                onClick={() => router.push(`/autowrite/${d.id}`)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-left hover:border-primary-500/40 hover:bg-blue-50/30"
              >
                <p className="truncate text-sm text-foreground">{d.title || "(제목 없음)"}</p>
                <p className="mt-0.5 text-[10px] text-muted">
                  {new Date(d.created_at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* 상태별 UI */}
      {step.type === "idle" && (
        <button
          onClick={handleStart}
          disabled={!canGenerate}
          className={`w-full rounded-lg border py-2 text-center text-xs font-semibold transition-colors ${
            canGenerate
              ? "border-primary-500 bg-primary-500 text-white hover:bg-primary-600"
              : "cursor-not-allowed border-border bg-background text-muted"
          }`}
        >
          {!hasRelatedNews
            ? "관련 기사 없음 (초안 작성 불가)"
            : !isMissed
            ? "이미 보도된 키워드"
            : "초안 작성하기"}
        </button>
      )}

      {step.type === "confirm_no_profile" && (
        <div className="rounded-lg border border-warning/40 bg-amber-50/60 p-3 text-sm">
          <p className="mb-3 leading-relaxed text-foreground/80">
            문체 학습 데이터가 준비되지 않은 계정입니다.
            팩트 기반으로만 초안을 작성해 드릴까요?
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => runGenerate(false)}
              className="flex-1 rounded-lg bg-primary-500 py-1.5 text-xs font-semibold text-white hover:bg-primary-600"
            >
              작성하기
            </button>
            <button
              onClick={() => setStep({ type: "idle" })}
              className="flex-1 rounded-lg border border-border py-1.5 text-xs font-semibold text-muted hover:bg-background"
            >
              취소
            </button>
          </div>
        </div>
      )}

      {step.type === "extracting" && (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-3 text-xs text-muted">
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary-500" />
          관련 기사 분석 중...
        </div>
      )}

      {step.type === "generating" && (
        <div className="rounded-lg border border-primary-500/20 bg-blue-50/40 px-3 py-3">
          <div className="mb-1.5 flex items-center gap-2 text-xs font-semibold text-primary-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            기사 초안을 작성하고 있습니다.
          </div>
          <p className="text-[11px] text-muted">약 20~40초 소요됩니다.</p>
        </div>
      )}

      {step.type === "error" && (
        <div className="rounded-lg border border-error/30 bg-red-50/40 px-3 py-3">
          <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-error">
            <AlertTriangle className="h-3.5 w-3.5" />
            초안 생성 실패
          </div>
          <p className="mb-2 text-[11px] text-muted">{step.message}</p>
          <button
            onClick={() => setStep({ type: "idle" })}
            className="text-xs font-semibold text-primary-500 hover:underline"
          >
            다시 시도
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 상세 패널
// ---------------------------------------------------------------------------

interface DetailPanelProps {
  item: TrendingWithCoverage;
  history: { fetched_at: string; search_volume: number | null }[];
  onClose: () => void;
  isReporter: boolean;
  userId: string;
  reporterId: string;
}

function DetailPanel({ item, history, onClose, isReporter, userId, reporterId }: DetailPanelProps) {
  const freshness = freshnessSignal(item.started_at);
  const relatedNews = (item.related_news ?? []) as {
    title: string; url: string; source: string; published_ago?: string;
  }[];
  const relatedQueries = item.related_queries ?? [];
  const encKeyword = encodeURIComponent(item.keyword);

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* 헤더 */}
      <div className="flex items-start justify-between gap-2 border-b border-border px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-bold">{item.keyword}</h2>
          <span className={item.covered ? "badge badge-success" : "badge badge-error"}>
            {item.covered ? "보도됨" : "미보도"}
          </span>
        </div>
        <button onClick={onClose} className="shrink-0 rounded p-1 hover:bg-background">
          <X className="h-4 w-4 text-muted" />
        </button>
      </div>

      <div className="flex flex-col gap-5 px-5 py-4">
        {/* 핵심 지표 */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-border bg-background p-3">
            <p className="flex items-center gap-1 text-[10px] font-semibold text-muted uppercase">
              검색량 <InfoTip text={TIPS.volume} />
            </p>
            <p className="mt-1 text-xl font-bold">{item.approx_traffic}</p>
          </div>
          <div className="rounded-lg border border-border bg-background p-3">
            <p className="flex items-center gap-1 text-[10px] font-semibold text-muted uppercase">
              증가율 <InfoTip text={TIPS.growth} />
            </p>
            <p className={`mt-1 text-xl font-bold ${(item.growth_rate ?? 0) >= 500 ? "text-error" : ""}`}>
              {formatGrowth(item.growth_rate)}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-background p-3">
            <p className="flex items-center gap-1 text-[10px] font-semibold text-muted uppercase">
              시작 <InfoTip text={TIPS.freshness} />
            </p>
            <p className="mt-1 text-sm font-semibold">
              {freshness.emoji} {item.started_ago_text ?? "-"}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-background p-3">
            <p className="text-[10px] font-semibold text-muted uppercase">상태</p>
            <p className="mt-1 text-sm font-semibold">{item.status ?? "-"}</p>
          </div>
        </div>

        {/* 추이 그래프 */}
        <div>
          <p className="mb-2 flex items-center gap-1 text-xs font-semibold text-muted">
            📈 우리 관측 추이 <InfoTip text={TIPS.trendChart} />
          </p>
          <div className="rounded-lg border border-border bg-background p-3">
            <MiniChart history={history} />
          </div>
        </div>

        {/* AI 요약 */}
        <div>
          <p className="mb-1 flex items-center gap-1 text-xs font-semibold text-primary-500">
            <Sparkles className="h-3 w-3" /> AI 요약
          </p>
          {item.ai_summary ? (
            <p className="text-sm leading-relaxed text-foreground/80">{item.ai_summary}</p>
          ) : (
            <p className="text-xs italic text-muted">생성 중...</p>
          )}
        </div>

        {/* 초안 작성 (reporter 전용) */}
        {isReporter && (
          <DraftSection item={item} userId={userId} reporterId={reporterId} />
        )}

        {/* 관련 검색어 */}
        {relatedQueries.length > 0 && (
          <div>
            <p className="mb-2 flex items-center gap-1 text-xs font-semibold text-muted">
              관련 검색어 <InfoTip text={TIPS.relatedQueries} />
            </p>
            <div className="flex flex-wrap gap-1.5">
              {relatedQueries.map((q, i) => (
                <span key={i} className="rounded-full border border-border bg-background px-2.5 py-1 text-xs text-foreground">
                  {q}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* 관련 보도 */}
        {relatedNews.length > 0 && (
          <div>
            <p className="mb-2 flex items-center gap-1 text-xs font-semibold text-muted">
              관련 보도 <InfoTip text={TIPS.relatedNews} />
            </p>
            <ul className="space-y-2">
              {relatedNews.map((news, idx) => (
                <li key={idx}>
                  <a
                    href={news.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-start gap-2 rounded-lg border border-border bg-background p-3 hover:border-primary-500/40 hover:bg-blue-50/30"
                  >
                    <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" />
                    <div className="min-w-0">
                      <p className="text-sm leading-snug text-foreground">{news.title}</p>
                      <p className="mt-0.5 text-[10px] text-muted">
                        {news.source}{news.published_ago ? ` · ${news.published_ago}` : ""}
                      </p>
                    </div>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 자사 기사 */}
        <div className={`rounded-lg border-2 p-3 ${item.covered ? "border-success/40 bg-green-50/40" : "border-error/30 bg-red-50/30"}`}>
          <p className="mb-1 flex items-center gap-1 text-xs font-semibold text-muted">
            세계일보 보도 <InfoTip text={TIPS.coverage} />
          </p>
          {item.covered ? (
            <a
              href={item.our_article_url ?? "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-sm text-foreground hover:text-primary-500 hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5 shrink-0" />
              {item.our_article_title}
            </a>
          ) : (
            <p className="text-sm font-semibold text-error">아직 세계일보 미보도</p>
          )}
        </div>

        {/* 외부 바로가기 */}
        <div className="flex gap-2">
          <a
            href={`https://trends.google.com/trends/explore?q=${encKeyword}&geo=KR`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 rounded-lg border border-border bg-background py-2 text-center text-xs font-semibold text-foreground hover:border-primary-500/40 hover:text-primary-500"
          >
            구글 탐색
          </a>
          <a
            href={`https://www.google.com/search?q=${encKeyword}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 rounded-lg border border-border bg-background py-2 text-center text-xs font-semibold text-foreground hover:border-primary-500/40 hover:text-primary-500"
          >
            구글 검색
          </a>
          <a
            href={`https://search.naver.com/search.naver?query=${encKeyword}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 rounded-lg border border-border bg-background py-2 text-center text-xs font-semibold text-foreground hover:border-primary-500/40 hover:text-primary-500"
          >
            네이버 검색
          </a>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 메인 클라이언트 컴포넌트
// ---------------------------------------------------------------------------

interface TrendingClientProps {
  items: TrendingWithCoverage[];
  fetchedAt: string;
  isReporter: boolean;
  userId: string;
  reporterId: string;
}

export function TrendingClient({ items, fetchedAt, isReporter, userId, reporterId }: TrendingClientProps) {
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [onlyMissed, setOnlyMissed] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [history, setHistory] = useState<{ fetched_at: string; search_volume: number | null }[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const selectedItem = items.find((i) => i.trending_id === selectedId) ?? null;

  const sorted = useMemo(() => {
    let list = onlyMissed ? items.filter((i) => !i.covered) : [...items];
    if (sortKey === "freshness") {
      list.sort((a, b) => {
        if (!a.started_at) return 1;
        if (!b.started_at) return -1;
        return new Date(b.started_at).getTime() - new Date(a.started_at).getTime();
      });
    } else if (sortKey === "growth") {
      list.sort((a, b) => (b.growth_rate ?? 0) - (a.growth_rate ?? 0));
    } else if (sortKey === "volume") {
      list.sort((a, b) => (b.search_volume ?? 0) - (a.search_volume ?? 0));
    } else {
      list.sort((a, b) => a.traffic_rank - b.traffic_rank);
    }
    return list;
  }, [items, sortKey, onlyMissed]);

  const handleSelect = async (item: TrendingWithCoverage) => {
    if (selectedId === item.trending_id) {
      setSelectedId(null);
      return;
    }
    setSelectedId(item.trending_id);
    setHistory([]);
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/trending/history?keyword=${encodeURIComponent(item.keyword)}&hours=6`);
      if (res.ok) setHistory(await res.json());
    } catch {
      // 그래프 없이 패널 표시
    } finally {
      setHistoryLoading(false);
    }
  };

  const missed = items.filter((i) => !i.covered).length;
  const covered = items.filter((i) => i.covered).length;

  const kstTime = (() => {
    const d = new Date(fetchedAt);
    const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
    return `${String(kst.getUTCHours()).padStart(2, "0")}:${String(kst.getUTCMinutes()).padStart(2, "0")}`;
  })();

  return (
    <div className="flex h-full flex-col gap-4">
      {/* 헤더 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">실시간 트렌드</h1>
          <p className="caption mt-0.5">{kstTime} 기준 · 3분마다 갱신</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setOnlyMissed((v) => !v)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
              onlyMissed
                ? "border-error bg-red-50 text-error"
                : "border-border bg-white text-muted hover:border-error/40 hover:text-error"
            }`}
          >
            미보도만
          </button>
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-semibold text-foreground"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}순
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 스탯 카드 */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card py-3 text-center">
          <p className="text-2xl font-bold">{items.length}</p>
          <p className="caption mt-0.5">전체</p>
        </div>
        <div className="card py-3 text-center">
          <p className="text-2xl font-bold text-error">{missed}</p>
          <p className="caption mt-0.5">미보도</p>
        </div>
        <div className="card py-3 text-center">
          <p className="text-2xl font-bold text-success">{covered}</p>
          <p className="caption mt-0.5">보도됨</p>
        </div>
      </div>

      {/* 테이블 + 패널 2분할 */}
      <div className="flex min-h-0 flex-1 gap-4">
        {/* 테이블 */}
        <div className={`flex-1 overflow-auto rounded-xl border border-border bg-white transition-all ${selectedItem ? "min-w-0" : ""}`}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-background text-xs text-muted">
                <th className="w-6 py-3" />
                <th className="px-4 py-3 text-center font-semibold">
                  <span className="flex items-center justify-center gap-1">
                    순위 <InfoTip text={TIPS.rank} />
                  </span>
                </th>
                <th className="px-4 py-3 text-left font-semibold">키워드</th>
                <th className="px-4 py-3 text-right font-semibold">
                  <span className="flex items-center justify-end gap-1">
                    검색량 <InfoTip text={TIPS.volume} />
                  </span>
                </th>
                <th className="px-4 py-3 text-right font-semibold">
                  <span className="flex items-center justify-end gap-1">
                    증가율 <InfoTip text={TIPS.growth} />
                  </span>
                </th>
                <th className="px-4 py-3 text-center font-semibold">
                  <span className="flex items-center justify-center gap-1">
                    신선도 <InfoTip text={TIPS.freshness} />
                  </span>
                </th>
                <th className="px-4 py-3 text-center font-semibold">
                  <span className="flex items-center justify-center gap-1">
                    보도 <InfoTip text={TIPS.coverage} />
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((item) => {
                const freshness = freshnessSignal(item.started_at);
                const isSelected = selectedId === item.trending_id;
                const isHigh = (item.growth_rate ?? 0) >= 500;
                const isMissed = !item.covered;
                return (
                  <tr
                    key={item.trending_id}
                    onClick={() => handleSelect(item)}
                    className={`cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-blue-50/40 ${
                      isSelected ? "bg-blue-50" : ""
                    }`}
                  >
                    <td className="w-6 py-4 pl-2 pr-0">
                      {isMissed && <div className="h-8 w-1 rounded-full bg-error" />}
                    </td>
                    <td className="px-4 py-4 text-center text-sm font-bold text-muted">
                      {item.traffic_rank}
                    </td>
                    <td className="px-4 py-4 text-base font-semibold">{item.keyword}</td>
                    <td className="px-4 py-4 text-right text-sm">{item.approx_traffic}</td>
                    <td className={`px-4 py-4 text-right text-sm font-semibold ${isHigh ? "text-error" : ""}`}>
                      {formatGrowth(item.growth_rate)}
                    </td>
                    <td className="px-4 py-4 text-center text-sm">
                      <span title={freshness.label}>{freshness.emoji}</span>{" "}
                      <span className="text-muted">{item.started_ago_text ?? "-"}</span>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className={item.covered ? "badge badge-success" : "badge badge-error"}>
                        {item.covered ? "보도됨" : "미보도"}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted">
                    조건에 맞는 트렌드가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* 우측 상세 패널 */}
        {selectedItem && (
          <div className="w-1/3 shrink-0 overflow-hidden rounded-xl border border-border bg-white shadow-md">
            <DetailPanel
              item={selectedItem}
              history={historyLoading ? [] : history}
              onClose={() => setSelectedId(null)}
              isReporter={isReporter}
              userId={userId}
              reporterId={reporterId}
            />
          </div>
        )}
      </div>
    </div>
  );
}
