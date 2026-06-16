import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  ExternalLink,
  HelpCircle,
  Layers,
  Search,
} from "lucide-react";
import { PageShell } from "@/components/PageShell";
import { getIssueBoard, type IssueBoardItem } from "@/lib/queries";
import { IssueDateNav } from "./IssueDateNav";
import { IssueReviewButton } from "./IssueReviewButton";

export const revalidate = 300;

function todayKST(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60_000);
  return kst.toISOString().slice(0, 10);
}

type Filter = "all" | "missed" | "reviewing";

type Props = {
  searchParams: Promise<{ date?: string; filter?: string }>;
};

// 카드별 커버리지 배지
function CoverageBadge({ item }: { item: IssueBoardItem }) {
  if (!item.alert_id) {
    if (item.hasSegye) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success">
          <CheckCircle className="h-3 w-3" />
          보도함
        </span>
      );
    }
    return null;
  }

  if (item.alert_status === "reviewing") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-primary-500/10 px-2 py-0.5 text-[11px] font-medium text-primary-500">
        <Search className="h-3 w-3" />
        검토중
      </span>
    );
  }

  if (item.verdict === "유사보도있음") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-muted/10 px-2 py-0.5 text-[11px] font-medium text-muted">
        <CheckCircle className="h-3 w-3" />
        유사보도있음
      </span>
    );
  }

  if (item.verdict === "확인필요") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-2 py-0.5 text-[11px] font-medium text-warning">
        <HelpCircle className="h-3 w-3" />
        확인필요
      </span>
    );
  }

  // 미보도 (기본)
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-error/10 px-2 py-0.5 text-[11px] font-medium text-error">
      <AlertTriangle className="h-3 w-3" />
      미보도
    </span>
  );
}

const priorityBadge = {
  high: { cls: "badge-error", label: "높음" },
  medium: { cls: "badge-warning", label: "보통" },
  low: { cls: "badge-muted", label: "낮음" },
};

function gapText(detectedAt: string): string {
  const mins = Math.max(
    0,
    Math.round((Date.now() - new Date(detectedAt).getTime()) / 60_000)
  );
  if (mins < 60) return `${mins}분 전 탐지`;
  return `${Math.round(mins / 60)}시간 전 탐지`;
}

export default async function IssuePage({ searchParams }: Props) {
  const { date: dateParam, filter: filterParam } = await searchParams;
  const today = todayKST();
  const date = dateParam ?? today;
  const filter = (["all", "missed", "reviewing"].includes(filterParam ?? "")
    ? filterParam
    : "all") as Filter;

  const items = await getIssueBoard(date, filter);

  const filterTabs: { key: Filter; label: string }[] = [
    { key: "all", label: "전체" },
    { key: "missed", label: "미보도만" },
    { key: "reviewing", label: "검토중" },
  ];

  return (
    <PageShell>
      {/* 헤더 */}
      <div className="mb-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              이슈 모니터링
            </h1>
            <p className="mt-0.5 text-sm text-muted">
              오늘의 주요 이슈 클러스터와 자사 미보도 현황
            </p>
          </div>
          <IssueDateNav date={date} filter={filter} />
        </div>

        {/* 필터 탭 */}
        <div className="mt-4 flex gap-1.5">
          {filterTabs.map((tab) => {
            const params = new URLSearchParams({ date });
            if (tab.key !== "all") params.set("filter", tab.key);
            return (
              <Link
                key={tab.key}
                href={`/issue?${params.toString()}`}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  filter === tab.key
                    ? "bg-primary-500 text-white"
                    : "border border-border text-muted hover:text-foreground"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>
      </div>

      {/* 이슈 목록 */}
      {items.length === 0 ? (
        <div className="card">
          <p className="caption">
            {filter === "missed"
              ? "해당 날짜에 미보도 탐지 이슈가 없습니다."
              : filter === "reviewing"
              ? "검토 중인 이슈가 없습니다."
              : "해당 날짜에 이슈 데이터가 없습니다."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => {
            const hasMissedAlert =
              item.alert_id !== null && item.verdict !== "유사보도있음";
            const isHighPriority =
              hasMissedAlert &&
              item.priority === "high" &&
              item.alert_status !== "reviewing";

            return (
              <article
                key={item.cluster_id}
                className={`card flex flex-col gap-3 ${
                  isHighPriority ? "card-alert" : ""
                } ${item.alert_status === "reviewing" ? "opacity-80" : ""}`}
              >
                {/* 상단 배지 행 */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-primary-500">
                    <Layers className="h-3.5 w-3.5" />
                    이슈
                  </span>
                  <CoverageBadge item={item} />
                  {item.priority && hasMissedAlert && (
                    <span
                      className={`badge ${priorityBadge[item.priority].cls}`}
                    >
                      {priorityBadge[item.priority].label}
                    </span>
                  )}
                  <span className="ml-auto badge badge-muted">
                    신뢰도 {(item.confidence * 100).toFixed(0)}%
                  </span>
                </div>

                {/* 제목 + 요약 */}
                <div>
                  <h3 className="text-sm font-semibold">{item.title}</h3>
                  {item.summary && (
                    <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-muted">
                      {item.summary}
                    </p>
                  )}
                </div>

                {/* 키워드 */}
                {item.keywords.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {item.keywords.slice(0, 4).map((k) => (
                      <span key={k} className="badge badge-muted">
                        #{k}
                      </span>
                    ))}
                  </div>
                )}

                {/* 미보도 알림 정보 */}
                {item.alert_id && (
                  <div className="rounded-lg bg-background px-3 py-2 text-[12px]">
                    {item.detected_at && (
                      <p className="mb-1 inline-flex items-center gap-1 text-muted">
                        <Clock className="h-3 w-3" />
                        {gapText(item.detected_at)}
                      </p>
                    )}
                    {item.competitors.length > 0 && (
                      <p className="text-muted">
                        경쟁사{" "}
                        {item.competitors.slice(0, 3).map((c, idx) => (
                          <span key={c.name}>
                            {c.url ? (
                              <a
                                href={c.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-0.5 text-primary-500 hover:underline"
                              >
                                {c.name}
                                <ExternalLink className="h-2.5 w-2.5" />
                              </a>
                            ) : (
                              c.name
                            )}
                            {idx < Math.min(item.competitors.length, 3) - 1 &&
                              ", "}
                          </span>
                        ))}
                        {item.competitors.length > 3 &&
                          ` 외 ${item.competitors.length - 3}곳`}{" "}
                        보도
                      </p>
                    )}
                    {item.similar_article && (
                      <a
                        href={item.similar_article.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 inline-flex items-center gap-1 text-primary-500 hover:underline"
                      >
                        <ExternalLink className="h-3 w-3 shrink-0" />
                        <span className="line-clamp-1">
                          자사 유사 기사:{" "}
                          {item.similar_article.title.length > 30
                            ? item.similar_article.title.slice(0, 30) + "…"
                            : item.similar_article.title}
                        </span>
                      </a>
                    )}
                  </div>
                )}

                {/* 하단: 메타 + 버튼 */}
                <div className="mt-auto flex flex-col gap-2 border-t border-border pt-3">
                  <p className="text-xs text-muted">
                    관련 기사 {item.articles}건 · 매체 {item.mediaCount}곳 ·{" "}
                    {item.cluster_date}
                  </p>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap gap-1">
                      {item.mediaNames.slice(0, 3).map((m) => (
                        <span
                          key={m}
                          className={`badge ${
                            m === "세계일보"
                              ? "border-primary-500/30 bg-primary-500/10 text-primary-500"
                              : "badge-muted"
                          }`}
                        >
                          {m}
                        </span>
                      ))}
                      {item.mediaNames.length > 3 && (
                        <span className="badge badge-muted">
                          +{item.mediaNames.length - 3}
                        </span>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {item.alert_id && (
                        <IssueReviewButton
                          alertId={item.alert_id}
                          status={item.alert_status ?? "open"}
                        />
                      )}
                      <Link
                        href={`/issue/${item.cluster_id}?date=${date}`}
                        className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-background"
                      >
                        상세보기
                      </Link>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
