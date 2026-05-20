"use client";

import { useState } from "react";
import { X } from "lucide-react";
import type { ArticlePvItem } from "@/lib/queries";

type Props = {
  articles: ArticlePvItem[];
  totalPv: number;
  topArticlePv: number;
  date: string;
};

function fmtKST(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function rankBadge(rank: number) {
  if (rank === 1) return "bg-amber-100 text-amber-700";
  if (rank === 2) return "bg-purple-100 text-purple-700";
  if (rank === 3) return "bg-blue-100 text-blue-700";
  return "bg-gray-100 text-gray-500";
}

export function ArticleListModal({ articles, totalPv, topArticlePv, date }: Props) {
  const [open, setOpen] = useState(false);
  const avgPv = articles.length ? Math.round(totalPv / articles.length) : 0;
  const lastPv = articles[articles.length - 1]?.pv ?? 0;

  const dateLabel = new Date(date + "T00:00:00+09:00").toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  });

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-blue-700 hover:text-blue-900 whitespace-nowrap shrink-0"
      >
        전체 {articles.length}건 보기 →
      </button>

      {open && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-6"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-[980px] max-h-[88vh] flex flex-col shadow-2xl overflow-hidden"
            role="dialog"
            aria-modal="true"
          >
            {/* Head */}
            <div className="px-6 pt-5 pb-4 border-b border-gray-100">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold">인기 기사 전체 {articles.length}건</h2>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {dateLabel} · 네이버 파트너센터 PV 기준
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="w-8 h-8 rounded-lg border border-gray-200 grid place-items-center text-gray-400 hover:bg-gray-50 hover:text-gray-700 shrink-0"
                >
                  <X size={14} />
                </button>
              </div>
              <div className="flex gap-5 mt-3 px-3.5 py-2.5 bg-gray-50 rounded-lg text-xs">
                <div className="flex-1">
                  <strong className="block text-base font-bold text-gray-900">
                    {totalPv.toLocaleString()}
                  </strong>
                  <span className="text-gray-400">Top {articles.length} 총 PV</span>
                </div>
                <div className="flex-1">
                  <strong className="block text-base font-bold text-gray-900">
                    {avgPv.toLocaleString()}
                  </strong>
                  <span className="text-gray-400">기사당 평균</span>
                </div>
                <div className="flex-1">
                  <strong className="block text-base font-bold text-gray-900">
                    {topArticlePv.toLocaleString()}
                  </strong>
                  <span className="text-gray-400">1위 PV</span>
                </div>
                <div className="flex-1">
                  <strong className="block text-base font-bold text-gray-900">
                    {lastPv.toLocaleString()}
                  </strong>
                  <span className="text-gray-400">{articles.length}위 PV</span>
                </div>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="sticky top-0 bg-gray-50 z-10 text-center px-4 py-2.5 border-b border-gray-100 text-[11px] font-medium text-gray-400 uppercase tracking-wide w-12">
                      순위
                    </th>
                    <th className="sticky top-0 bg-gray-50 z-10 text-left px-4 py-2.5 border-b border-gray-100 text-[11px] font-medium text-gray-400 uppercase tracking-wide">
                      기사 / 기자 / 발행 시각
                    </th>
                    <th className="sticky top-0 bg-gray-50 z-10 text-right px-4 py-2.5 border-b border-gray-100 text-[11px] font-medium text-gray-400 uppercase tracking-wide w-20">
                      PV
                    </th>
                    <th className="sticky top-0 bg-gray-50 z-10 px-4 py-2.5 border-b border-gray-100 w-28">
                      분포
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {articles.map((a) => (
                    <tr key={a.rank} className="hover:bg-gray-50">
                      <td className="text-center px-4 py-3 border-b border-gray-50">
                        <span
                          className={`inline-grid place-items-center w-6 h-6 rounded-md text-xs font-semibold ${rankBadge(a.rank)}`}
                        >
                          {a.rank}
                        </span>
                      </td>
                      <td className="px-4 py-3 border-b border-gray-50">
                        {a.article_url ? (
                          <a
                            href={a.article_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium text-gray-900 leading-snug hover:text-blue-700 line-clamp-2"
                          >
                            {a.title}
                          </a>
                        ) : (
                          <span className="font-medium text-gray-900 leading-snug line-clamp-2">
                            {a.title}
                          </span>
                        )}
                        <div className="text-[11px] text-gray-400 mt-0.5">
                          {a.reporter_name ?? "—"}
                          {a.article_published_at
                            ? ` · ${fmtKST(a.article_published_at)}`
                            : ""}
                          {a.category && a.category !== "all"
                            ? ` · ${a.category}`
                            : ""}
                        </div>
                      </td>
                      <td className="text-right px-4 py-3 border-b border-gray-50 tabular-nums font-semibold">
                        {a.pv.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 border-b border-gray-50">
                        <div className="h-[5px] bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-700 rounded-full"
                            style={{
                              width: `${topArticlePv ? (a.pv / topArticlePv) * 100 : 0}%`,
                            }}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div className="px-6 py-3 border-t border-gray-100 text-xs text-gray-400">
              총 <strong className="text-gray-700">{articles.length}건</strong>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
