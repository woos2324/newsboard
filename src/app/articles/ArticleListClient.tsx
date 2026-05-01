"use client";

import { useState } from "react";
import { ArticlePagination } from "./ArticlePagination";
import { sectionLabel, type OurArticleItem } from "@/lib/queries";

const PER_PAGE = 10;

const SECTION_COLORS: Record<string, string> = {
  politics: "bg-violet-100 text-violet-700",
  economy: "bg-red-100 text-red-700",
  society: "bg-amber-100 text-amber-700",
  culture: "bg-pink-100 text-pink-700",
  it: "bg-emerald-100 text-emerald-700",
  world: "bg-blue-100 text-blue-700",
  entertainment: "bg-fuchsia-100 text-fuchsia-700",
  sports: "bg-orange-100 text-orange-700",
};

function formatTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

type ArticleRowProps = {
  num: number;
  article: OurArticleItem;
  isLeft: boolean;
};

function ArticleRow({ num, article, isLeft }: ArticleRowProps) {
  const secCls = SECTION_COLORS[article.category ?? ""] ?? "bg-gray-100 text-gray-500";
  return (
    <div
      className={`flex min-h-[4rem] items-start gap-2.5 px-4 py-3 border-b border-border ${
        isLeft ? "md:border-r md:border-border" : ""
      }`}
    >
      <span className="mt-0.5 w-5 shrink-0 text-xs font-semibold text-muted/60">{num}</span>
      <div className="min-w-0 flex-1">
        {article.url ? (
          <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-[13px] font-medium leading-snug text-foreground hover:text-primary-500 hover:underline"
          >
            {article.title}
          </a>
        ) : (
          <p className="text-[13px] font-medium leading-snug">{article.title}</p>
        )}
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {article.published_at && (
            <span className="text-[11px] text-muted">{formatTime(article.published_at)}</span>
          )}
          {article.author_name && (
            <span className="text-[11px] text-muted">{article.author_name} 기자</span>
          )}
          {article.category && (
            <span className={`badge text-[10px] ${secCls}`}>{sectionLabel(article.category)}</span>
          )}
          {article.cluster_id && (
            <span className="badge badge-muted text-[10px] text-primary-500">
              이슈 #{article.cluster_id}
            </span>
          )}
          {article.url && (
            <a
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-muted hover:text-primary-500"
            >
              ↗
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

type Props = {
  date: string;
  initialArticles: OurArticleItem[];
  total: number;
};

export function ArticleListClient({ date, initialArticles, total }: Props) {
  const [articles, setArticles] = useState(initialArticles);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  const totalPages = Math.ceil(total / PER_PAGE);

  async function goToPage(newPage: number) {
    if (newPage === page || loading) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/articles?date=${date}&page=${newPage}`);
      const json = await res.json();
      setArticles(json.articles);
      setPage(newPage);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <p className="caption mb-4">총 {total}건 · {page}/{totalPages}페이지</p>

      <div
        className={`transition-opacity duration-150 ${loading ? "opacity-40 pointer-events-none" : ""}`}
      >
        {articles.length === 0 ? (
          <p className="caption">해당 날짜의 기사가 없습니다.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2">
            {articles.map((a, i) => (
              <ArticleRow
                key={a.article_id}
                num={(page - 1) * PER_PAGE + i + 1}
                article={a}
                isLeft={i % 2 === 0}
              />
            ))}
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex justify-center border-t border-border pt-5 mt-2">
          <ArticlePagination page={page} totalPages={totalPages} onPageChange={goToPage} />
        </div>
      )}
    </div>
  );
}
