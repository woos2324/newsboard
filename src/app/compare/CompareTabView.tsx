"use client";

import { useState } from "react";
import { MessageSquare } from "lucide-react";
import type { CompareMatrix, CompareCommentCard } from "@/lib/queries";
import type { MediaSectionRanking } from "@/lib/naver-section";
import { SECTION_ORDER } from "@/lib/naver-section";

// 댓글 수 기준 참여도 배지 (독자 반응에서 이관)
function engagementBadge(comments: number): { cls: string; label: string } {
  if (comments >= 500) return { cls: "badge-error", label: "매우 활발" };
  if (comments >= 200) return { cls: "badge-warning", label: "활발" };
  return { cls: "badge-muted", label: "보통" };
}

function MediaCard({
  mediaName,
  normalizedName,
  children,
}: {
  mediaName: string;
  normalizedName: string;
  children: React.ReactNode;
}) {
  const isSegye = normalizedName === "segye";
  return (
    <div
      className="card flex flex-col"
      style={isSegye ? { borderTop: "3px solid #1E40AF" } : undefined}
    >
      <div className="mb-3 flex items-center gap-2 border-b border-border pb-2">
        <span className="text-sm font-semibold text-primary-500">{mediaName}</span>
        {isSegye && (
          <span
            className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
            style={{ background: "#EFF6FF", color: "#1E40AF" }}
          >
            자사
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

export function CompareTabView({
  popularData,
  sectionRankings,
  commentRanking,
}: {
  popularData: CompareMatrix;
  sectionRankings: MediaSectionRanking[];
  commentRanking: CompareCommentCard[];
}) {
  const [activeTab, setActiveTab] = useState<"popular" | "section" | "comment">("popular");
  const [activeSection, setActiveSection] = useState(SECTION_ORDER[0]);

  const tabBtn = (tab: "popular" | "section" | "comment", label: string) => (
    <button
      onClick={() => setActiveTab(tab)}
      className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
        activeTab === tab
          ? "bg-white text-primary-500 shadow-sm"
          : "text-muted hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );

  return (
    <>
      {/* 랭킹 유형 탭 */}
      <div className="mb-5 flex w-fit gap-0.5 rounded-lg border border-border bg-background p-1">
        {tabBtn("popular", "인기 랭킹")}
        {tabBtn("section", "섹션별 랭킹")}
        {tabBtn("comment", "댓글 랭킹")}
      </div>

      {/* 인기 랭킹 — 카드 그리드 */}
      <div className={activeTab === "popular" ? "" : "hidden"}>
        {popularData.cards.length === 0 ? (
          <div className="card">
            <p className="caption">선택된 매체 데이터가 없습니다.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {popularData.cards.map((m) => (
              <MediaCard
                key={m.normalizedName}
                mediaName={m.mediaName}
                normalizedName={m.normalizedName}
              >
                {m.articles.length === 0 ? (
                  <p className="caption">데이터 없음</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {m.articles.map((a, i) => (
                      <li key={i} className="flex items-start gap-2 py-2">
                        <span
                          className={`mt-0.5 w-4 shrink-0 text-center text-xs font-semibold ${
                            i < 2 ? "text-primary-500" : "text-muted"
                          }`}
                        >
                          {i + 1}
                        </span>
                        <a
                          href={a.url ?? "#"}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="line-clamp-2 text-sm leading-snug hover:text-primary-500 hover:underline"
                        >
                          {a.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </MediaCard>
            ))}
          </div>
        )}
      </div>

      {/* 섹션별 랭킹 */}
      <div className={activeTab === "section" ? "" : "hidden"}>
        {sectionRankings.length === 0 ? (
          <div className="card">
            <p className="caption">섹션별 랭킹 데이터가 없습니다. 수집 후 표시됩니다.</p>
          </div>
        ) : (
          <>
            <div className="mb-4 flex flex-wrap gap-1">
              {SECTION_ORDER.map((s) => (
                <button
                  key={s}
                  onClick={() => setActiveSection(s)}
                  className={`rounded-md border px-3 py-1 text-xs font-medium transition-colors ${
                    activeSection === s
                      ? "border-primary-500 bg-primary-500/10 text-primary-500"
                      : "border-border bg-white text-muted hover:bg-background"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              {sectionRankings.map((m) => {
                const section = m.sections.find((s) => s.name === activeSection);
                return (
                  <MediaCard
                    key={m.normalizedName}
                    mediaName={m.mediaName}
                    normalizedName={m.normalizedName}
                  >
                    {!section || section.articles.length === 0 ? (
                      <p className="caption">데이터 없음</p>
                    ) : (
                      <ul className="divide-y divide-border">
                        {section.articles.map((a) => (
                          <li key={a.url} className="flex items-start gap-2 py-2">
                            <span
                              className={`mt-0.5 w-4 shrink-0 text-center text-xs font-semibold ${
                                a.rank <= 2 ? "text-primary-500" : "text-muted"
                              }`}
                            >
                              {a.rank}
                            </span>
                            <a
                              href={a.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="line-clamp-2 text-sm leading-snug hover:text-primary-500 hover:underline"
                            >
                              {a.title}
                            </a>
                          </li>
                        ))}
                      </ul>
                    )}
                  </MediaCard>
                );
              })}
            </div>
            <p className="caption mt-3 text-right">
              ※ 네이버 섹션별 랭킹 기준, 매체별 TOP 3
            </p>
          </>
        )}
      </div>

      {/* 댓글 랭킹 — 카드 그리드 + 댓글수·상태 배지 */}
      <div className={activeTab === "comment" ? "" : "hidden"}>
        {commentRanking.every((m) => m.articles.length === 0) ? (
          <div className="card">
            <p className="caption">선택된 매체의 댓글 데이터가 없습니다. 수집 후 표시됩니다.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              {commentRanking.map((m) => (
                <MediaCard
                  key={m.normalizedName}
                  mediaName={m.mediaName}
                  normalizedName={m.normalizedName}
                >
                  {m.articles.length === 0 ? (
                    <p className="caption">댓글 데이터 없음</p>
                  ) : (
                    <ul className="divide-y divide-border">
                      {m.articles.map((a, i) => {
                        const badge = engagementBadge(a.comments);
                        return (
                          <li key={a.article_id} className="flex items-start gap-2 py-2">
                            <span
                              className={`mt-0.5 w-4 shrink-0 text-center text-xs font-semibold ${
                                i < 2 ? "text-primary-500" : "text-muted"
                              }`}
                            >
                              {i + 1}
                            </span>
                            <div className="min-w-0 flex-1">
                              <a
                                href={a.url ?? "#"}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="line-clamp-2 text-sm leading-snug hover:text-primary-500 hover:underline"
                              >
                                {a.title}
                              </a>
                              <div className="mt-1 flex items-center gap-2">
                                <span className="flex items-center gap-1 text-xs text-muted">
                                  <MessageSquare className="h-3 w-3" />
                                  {a.comments.toLocaleString()}
                                </span>
                                <span className={`badge ${badge.cls}`}>{badge.label}</span>
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </MediaCard>
              ))}
            </div>
            <p className="caption mt-3 text-right">
              ※ 네이버 댓글 수 기준(최근 24시간), 매체별 TOP 5
            </p>
          </>
        )}
      </div>
    </>
  );
}
