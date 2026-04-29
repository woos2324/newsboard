import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import { getCompareMatrix, getSectionRankings } from "@/lib/queries";
import { SectionRankingView } from "./SectionRankingView";
import { MediaSelector } from "./MediaSelector";

export const dynamic = "force-dynamic";

const DEFAULT_MEDIA = ["chosun", "joongang", "donga", "mk"];

// const PRESETS: { label: string; ids: string[] }[] = [
//   { label: "종합지", ids: ["chosun", "joongang", "hani", "donga"] },
//   { label: "경제지", ids: ["mk", "hankyung", "mt", "edaily"] },
//   { label: "방송", ids: ["kbs", "sbs", "mbc", "jtbc"] },
//   { label: "통신", ids: ["yna", "newsis", "news1", "nocut"] },
// ];

type Props = {
  searchParams: Promise<{ media?: string; tab?: string }>;
};

export default async function ComparePage({ searchParams }: Props) {
  const { media: mediaParam, tab = "popular" } = await searchParams;

  const rawIds = mediaParam
    ? mediaParam.split(",").map((s) => s.trim()).filter(Boolean)
    : DEFAULT_MEDIA;

  // 세계일보 항상 첫 번째
  const mediaIds = ["segye", ...rawIds.filter((s) => s !== "segye")];
  const mediaQuery = `media=${mediaIds.join(",")}`;

  const [{ media, rows }, sectionRankings] = await Promise.all([
    getCompareMatrix(mediaIds, 5),
    tab === "section" ? getSectionRankings(mediaIds) : Promise.resolve(null),
  ]);

  return (
    <PageShell
      title="경쟁사 비교"
      description="매체별 랭킹 뉴스를 나란히 비교해 포지셔닝을 확인하세요."
    >
      {/* 언론사 칩 선택 */}
      <MediaSelector selected={mediaIds} tab={tab} />

      {/* 랭킹 유형 탭 */}
      <div className="mb-5 flex w-fit gap-0.5 rounded-lg border border-border bg-background p-1">
        <Link
          href={`/compare?${mediaQuery}&tab=popular`}
          className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
            tab === "popular"
              ? "bg-white text-primary-500 shadow-sm"
              : "text-muted hover:text-foreground"
          }`}
        >
          인기 랭킹
        </Link>
        <Link
          href={`/compare?${mediaQuery}&tab=section`}
          className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
            tab === "section"
              ? "bg-white text-primary-500 shadow-sm"
              : "text-muted hover:text-foreground"
          }`}
        >
          섹션별 랭킹
        </Link>
      </div>

      {/* 콘텐츠 */}
      {tab === "section" ? (
        sectionRankings && sectionRankings.length > 0 ? (
          <SectionRankingView rankings={sectionRankings} />
        ) : (
          <div className="card">
            <p className="caption">섹션별 랭킹 데이터가 없습니다. 수집 후 표시됩니다.</p>
          </div>
        )
      ) : media.length === 0 ? (
        <div className="card">
          <p className="caption">선택된 매체 데이터가 없습니다.</p>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
                <th className="py-2 pr-4 font-medium">순위</th>
                {media.map((m) => (
                  <th key={m} className="py-2 pr-4 font-medium">
                    {m}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.rank} className="border-b border-border last:border-0">
                  <td className="py-3 pr-4 align-top text-xs font-semibold text-primary-500">
                    #{row.rank}
                  </td>
                  {media.map((m) => (
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
    </PageShell>
  );
}
