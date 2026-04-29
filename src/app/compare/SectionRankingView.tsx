"use client";

import { useState } from "react";
import type { MediaSectionRanking } from "@/lib/naver-section";
import { SECTION_ORDER } from "@/lib/naver-section";

export function SectionRankingView({
  rankings,
}: {
  rankings: MediaSectionRanking[];
}) {
  const [active, setActive] = useState(SECTION_ORDER[0]);

  return (
    <div>
      {/* 섹션 탭 */}
      <div className="mb-4 flex flex-wrap gap-1">
        {SECTION_ORDER.map((s) => (
          <button
            key={s}
            onClick={() => setActive(s)}
            className={`rounded-md border px-3 py-1 text-xs font-medium transition-colors ${
              active === s
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
        {rankings.map((m) => {
          const section = m.sections.find((s) => s.name === active);
          return (
            <div
              key={m.normalizedName}
              className="card flex flex-col"
              style={{ borderTop: "3px solid #1E40AF" }}
            >
              <div className="mb-3 flex items-center gap-2 border-b border-border pb-2">
                <span className="text-sm font-semibold text-primary-500">{m.mediaName}</span>
                {m.normalizedName === "segye" && (
                  <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
                    style={{ background: "#EFF6FF", color: "#1E40AF" }}>
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
    </div>
  );
}
