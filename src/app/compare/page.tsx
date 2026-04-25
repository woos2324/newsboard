import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import { getCompareMatrix } from "@/lib/queries";

export const dynamic = "force-dynamic";

const DEFAULT_MEDIA = ["chosun", "joongang", "hani", "mk"];

const PRESETS: { label: string; ids: string[] }[] = [
  { label: "종합지", ids: ["chosun", "joongang", "hani", "donga"] },
  { label: "경제지", ids: ["mk", "hankyung", "mt", "edaily"] },
  { label: "방송", ids: ["kbs", "sbs", "mbc", "jtbc"] },
  { label: "통신", ids: ["yna", "newsis", "news1", "nocut"] },
];

type Props = {
  searchParams: Promise<{ media?: string }>;
};

export default async function ComparePage({ searchParams }: Props) {
  const { media: mediaParam } = await searchParams;
  const mediaIds = mediaParam
    ? mediaParam
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : DEFAULT_MEDIA;

  const { media, rows } = await getCompareMatrix(mediaIds, 5);

  return (
    <PageShell
      title="경쟁사 비교"
      description="매체별 랭킹 뉴스를 나란히 비교해 포지셔닝을 확인하세요."
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="caption">프리셋:</span>
        {PRESETS.map((p) => {
          const active = p.ids.join(",") === mediaIds.join(",");
          return (
            <Link
              key={p.label}
              href={`/compare?media=${p.ids.join(",")}`}
              className={`rounded-full border px-3 py-1 text-xs ${
                active
                  ? "border-primary-500 bg-primary-500/10 text-primary-500"
                  : "border-border bg-white hover:bg-background"
              }`}
            >
              {p.label}
            </Link>
          );
        })}
      </div>

      {media.length === 0 ? (
        <div className="card">
          <p className="caption">
            선택된 매체가 없거나 해당 normalized_name 매체를 찾지 못했습니다.
            <br />
            URL 예시: <code>?media=chosun,joongang,hani,mk</code>
          </p>
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
                <tr
                  key={row.rank}
                  className="border-b border-border last:border-0"
                >
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
