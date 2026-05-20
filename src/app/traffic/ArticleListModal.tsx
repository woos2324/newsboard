"use client";

import { useState, useMemo, useEffect } from "react";
import { X, Download } from "lucide-react";
import type { ArticlePvItem } from "@/lib/queries";

type Props = {
  articles: ArticlePvItem[];
  date: string;
};

type SortKey = "pv-desc" | "pv-asc" | "time-desc" | "time-asc";

const PAGE_SIZE = 30;

const DEVICES = [
  { value: "all", label: "전체" },
  { value: "pc",  label: "PC" },
  { value: "mobile", label: "모바일" },
];

const SECTIONS = [
  { value: "all",   label: "전체" },
  { value: "정치",  label: "정치" },
  { value: "경제",  label: "경제" },
  { value: "사회",  label: "사회" },
  { value: "IT",    label: "IT" },
  { value: "생활",  label: "생활" },
  { value: "세계",  label: "세계" },
  { value: "연예",  label: "엔터" },
  { value: "스포츠", label: "스포츠" },
  { value: "기타",  label: "기타" },
];

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

function sortArticles(items: ArticlePvItem[], key: SortKey): ArticlePvItem[] {
  const arr = [...items];
  switch (key) {
    case "pv-desc":   return arr.sort((a, b) => b.pv - a.pv);
    case "pv-asc":    return arr.sort((a, b) => a.pv - b.pv);
    case "time-desc": return arr.sort((a, b) => (b.article_published_at ?? "").localeCompare(a.article_published_at ?? ""));
    case "time-asc":  return arr.sort((a, b) => (a.article_published_at ?? "").localeCompare(b.article_published_at ?? ""));
  }
}

function downloadCsv(items: ArticlePvItem[], date: string) {
  const header = ["순위", "제목", "기자", "발행시각", "PV", "URL"];
  const rows = items.map((a) => [
    a.rank,
    `"${a.title.replace(/"/g, '""')}"`,
    a.reporter_name ?? "",
    a.article_published_at ? fmtKST(a.article_published_at) : "",
    a.pv,
    a.article_url ?? "",
  ]);
  const csv = "﻿" + [header, ...rows].map((r) => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const el = document.createElement("a");
  el.href = url; el.download = `traffic_articles_${date}.csv`; el.click();
  URL.revokeObjectURL(url);
}

export function ArticleListModal({ articles: initialArticles, date }: Props) {
  const [open, setOpen]     = useState(false);
  const [device, setDevice] = useState("all");
  const [section, setSection] = useState("all");
  const [articles, setArticles] = useState<ArticlePvItem[]>(initialArticles);
  const [loading, setLoading]   = useState(false);
  const [query, setQuery]   = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("pv-desc");
  const [page, setPage]     = useState(1);

  // device / section 변경 시 API 재조회
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch(`/api/traffic/article-pv?date=${date}&device=${device}&section=${encodeURIComponent(section)}`)
      .then((r) => r.json())
      .then((data) => { setArticles(data); setPage(1); })
      .finally(() => setLoading(false));
  }, [open, device, section, date]);

  // 통계 (현재 articles 기준)
  const totalPv    = articles.reduce((s, a) => s + a.pv, 0);
  const topPv      = articles[0]?.pv ?? 0;
  const avgPv      = articles.length ? Math.round(totalPv / articles.length) : 0;
  const lastPv     = articles[articles.length - 1]?.pv ?? 0;

  const dateLabel = new Date(date + "T00:00:00+09:00").toLocaleDateString("ko-KR", {
    year: "numeric", month: "long", day: "numeric", weekday: "short",
  });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q ? articles.filter((a) =>
      a.title.toLowerCase().includes(q) || (a.reporter_name ?? "").toLowerCase().includes(q)
    ) : articles;
    return sortArticles(base, sortBy);
  }, [articles, query, sortBy]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function handleClose() {
    setOpen(false); setQuery(""); setSortBy("pv-desc"); setPage(1);
    setDevice("all"); setSection("all");
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className="text-xs text-blue-700 hover:text-blue-900 whitespace-nowrap shrink-0">
        전체 {initialArticles.length}건 보기 →
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-6"
          onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}>
          <div className="bg-white rounded-2xl w-full max-w-[980px] max-h-[88vh] flex flex-col shadow-2xl overflow-hidden"
            role="dialog" aria-modal="true">

            {/* Head */}
            <div className="px-6 pt-5 pb-4 border-b border-gray-100">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div>
                    <h2 className="text-lg font-bold">인기 기사 전체 {articles.length}건</h2>
                    <div className="text-xs text-gray-400 mt-0.5">{dateLabel} · 네이버 파트너센터 PV 기준</div>
                  </div>
                  {/* 디바이스 토글 */}
                  <div className="flex border border-gray-200 rounded-lg overflow-hidden h-7">
                    {DEVICES.map((d) => (
                      <button key={d.value} type="button" onClick={() => { setDevice(d.value); setSection("all"); }}
                        className={`px-3 text-xs font-medium transition-colors ${device === d.value ? "bg-primary-500 text-white" : "text-muted hover:bg-gray-50"}`}>
                        {d.label}
                      </button>
                    ))}
                  </div>
                </div>
                <button type="button" onClick={handleClose}
                  className="w-8 h-8 rounded-lg border border-gray-200 grid place-items-center text-gray-400 hover:bg-gray-50 shrink-0">
                  <X size={14} />
                </button>
              </div>

              {/* 요약 */}
              <div className="flex gap-5 mt-3 px-3.5 py-2.5 bg-gray-50 rounded-lg text-xs">
                <div className="flex-1"><strong className="block text-base font-bold text-gray-900">{totalPv.toLocaleString()}</strong><span className="text-gray-400">Top {articles.length} 총 PV</span></div>
                <div className="flex-1"><strong className="block text-base font-bold text-gray-900">{avgPv.toLocaleString()}</strong><span className="text-gray-400">기사당 평균</span></div>
                <div className="flex-1"><strong className="block text-base font-bold text-gray-900">{topPv.toLocaleString()}</strong><span className="text-gray-400">1위 PV</span></div>
                <div className="flex-1"><strong className="block text-base font-bold text-gray-900">{lastPv.toLocaleString()}</strong><span className="text-gray-400">{articles.length}위 PV</span></div>
              </div>

              {/* 섹션 탭 */}
              <div className="flex gap-1 mt-3 flex-wrap">
                {SECTIONS.map((s) => (
                  <button key={s.value} type="button" onClick={() => { setSection(s.value); setPage(1); }}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${section === s.value ? "bg-primary-500 text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Controls */}
            <div className="px-6 py-3 border-b border-gray-100 flex gap-2 items-center flex-wrap">
              <input type="search" placeholder="제목 / 기자명 검색" value={query}
                onChange={(e) => { setQuery(e.target.value); setPage(1); }}
                className="flex-1 min-w-[180px] h-[34px] px-3 border border-gray-200 rounded-lg text-sm outline-none focus:border-blue-500" />
              <select value={sortBy} onChange={(e) => { setSortBy(e.target.value as SortKey); setPage(1); }}
                className="h-[34px] px-3 border border-gray-200 rounded-lg text-sm bg-white text-gray-700 outline-none">
                <option value="pv-desc">PV 높은 순</option>
                <option value="pv-asc">PV 낮은 순</option>
                <option value="time-desc">발행 최신순</option>
                <option value="time-asc">발행 오래된 순</option>
              </select>
              <button type="button" onClick={() => downloadCsv(filtered, date)}
                className="h-[34px] px-3 border border-gray-200 rounded-lg text-sm bg-white text-gray-700 hover:bg-gray-50 flex items-center gap-1.5">
                <Download size={13} /> CSV
              </button>
            </div>

            {/* Body */}
            <div className={`flex-1 overflow-y-auto transition-opacity ${loading ? "opacity-40" : ""}`}>
              {paged.length === 0 ? (
                <div className="py-12 text-center text-sm text-gray-400">
                  {loading ? "로딩 중..." : "데이터 없음"}
                </div>
              ) : (
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr>
                      <th className="sticky top-0 bg-gray-50 z-10 text-center px-4 py-2.5 border-b border-gray-100 text-[11px] font-medium text-gray-400 uppercase tracking-wide w-12">순위</th>
                      <th className="sticky top-0 bg-gray-50 z-10 text-left px-4 py-2.5 border-b border-gray-100 text-[11px] font-medium text-gray-400 uppercase tracking-wide">기사 / 기자 / 발행 시각</th>
                      <th className="sticky top-0 bg-gray-50 z-10 text-right px-4 py-2.5 border-b border-gray-100 text-[11px] font-medium text-gray-400 uppercase tracking-wide w-20">PV</th>
                      <th className="sticky top-0 bg-gray-50 z-10 px-4 py-2.5 border-b border-gray-100 w-28">분포</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paged.map((a) => (
                      <tr key={a.rank} className="hover:bg-gray-50">
                        <td className="text-center px-4 py-3 border-b border-gray-50">
                          <span className={`inline-grid place-items-center w-6 h-6 rounded-md text-xs font-semibold ${rankBadge(a.rank)}`}>{a.rank}</span>
                        </td>
                        <td className="px-4 py-3 border-b border-gray-50">
                          {a.article_url ? (
                            <a href={a.article_url} target="_blank" rel="noopener noreferrer"
                              className="font-medium text-gray-900 leading-snug hover:text-blue-700 line-clamp-2">{a.title}</a>
                          ) : (
                            <span className="font-medium text-gray-900 leading-snug line-clamp-2">{a.title}</span>
                          )}
                          <div className="text-[11px] text-gray-400 mt-0.5">
                            {a.reporter_name ?? "—"}{a.article_published_at ? ` · ${fmtKST(a.article_published_at)}` : ""}
                          </div>
                        </td>
                        <td className="text-right px-4 py-3 border-b border-gray-50 tabular-nums font-semibold">{a.pv.toLocaleString()}</td>
                        <td className="px-4 py-3 border-b border-gray-50">
                          <div className="h-[5px] bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-700 rounded-full" style={{ width: `${topPv ? (a.pv / topPv) * 100 : 0}%` }} />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Footer + Pager */}
            <div className="px-6 py-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400">
              <span>
                {filtered.length !== articles.length
                  ? `검색 결과 ${filtered.length}건 중 ${(page-1)*PAGE_SIZE+1}~${Math.min(page*PAGE_SIZE, filtered.length)} 표시`
                  : `총 ${articles.length}건 중 ${(page-1)*PAGE_SIZE+1}~${Math.min(page*PAGE_SIZE, articles.length)} 표시`}
              </span>
              {totalPages > 1 && (
                <div className="flex items-center gap-1">
                  <button type="button" disabled={page === 1} onClick={() => setPage((p) => p - 1)}
                    className="w-7 h-7 rounded-md border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed text-sm">‹</button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                    <button key={p} type="button" onClick={() => setPage(p)}
                      className={`w-7 h-7 rounded-md border text-xs font-medium ${p === page ? "bg-blue-700 text-white border-blue-700" : "border-gray-200 bg-white hover:bg-gray-50 text-gray-600"}`}>
                      {p}
                    </button>
                  ))}
                  <button type="button" disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}
                    className="w-7 h-7 rounded-md border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed text-sm">›</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
