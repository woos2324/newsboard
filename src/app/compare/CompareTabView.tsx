"use client";

import { useState } from "react";
import type { MediaSectionRanking } from "@/lib/naver-section";
import { SECTION_ORDER } from "@/lib/naver-section";

type PopularData = {
  media: string[];
  rows: { rank: number; cells: Record<string, string | null> }[];
};

export function CompareTabView({
  popularData,
  sectionRankings,
}: {
  popularData: PopularData;
  sectionRankings: MediaSectionRanking[];
}) {
  const [activeTab, setActiveTab] = useState<"popular" | "section">("popular");
  const [activeSection, setActiveSection] = useState(SECTION_ORDER[0]);

  const tabBtn = (tab: "popular" | "section", label: string) => (
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
      </div>

      {/* 인기 랭킹 */}
      <div className={activeTab === "popular" ? "" : "hidden"}>
        {popularData.media.length === 0 ? (
          <div className="card">
            <p className="caption">선택된 매체 데이터가 없습니다.</p>
          </div>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted">
                  <th className="py-2 pr-4 font-medium">순위</th>
                  {popularData.media.map((m) => (
                    <th key={m} className="py-2 pr-4 font-medium">
                      {m}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {popularData.rows.map((row) => (
                  <tr key={row.rank} className="border-b border-border last:border-0">
                    <td className="py-3 pr-4 align-top text-xs font-semibold text-primary-500">
                      #{row.rank}
                    </td>
                    {popularData.media.map((m) => (
                      <td key={m} className="py-3 pr-4 align-top leading-snug">
                        {row.cells[m] ?? <span className="text-muted">-</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
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
            {/* 섹션 탭 */}
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

            {/* 매체 카드 그리드 */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              {sectionRankings.map((m) => {
                const section = m.sections.find((s) => s.name === activeSection);
                return (
                  <div
                    key={m.normalizedName}
                    className="card flex flex-col"
                    style={{ borderTop: "3px solid #1E40AF" }}
                  >
                    <div className="mb-3 flex items-center gap-2 border-b border-border pb-2">
                      <span className="text-sm font-semibold text-primary-500">
                        {m.mediaName}
                      </span>
                      {m.normalizedName === "segye" && (
                        <span
                          className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
                          style={{ background: "#EFF6FF", color: "#1E40AF" }}
                        >
                          자사
                        </span>
                      )}
                    </div>
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
                  </div>
                );
              })}
            </div>
            <p className="caption mt-3 text-right">
              ※ 네이버 섹션별 랭킹 기준, 매체별 TOP 3
            </p>
          </>
        )}
      </div>
    </>
  );
}
