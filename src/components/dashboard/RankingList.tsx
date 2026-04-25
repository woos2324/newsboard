import { Minus, TrendingDown, TrendingUp } from "lucide-react";

type RankingItem = {
  rank: number;
  title: string;
  media: string;
  change: number | null;
};

type Props = {
  items: RankingItem[];
};

export function RankingList({ items }: Props) {
  return (
    <div className="card">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="section-title">매체별 랭킹 뉴스</h2>
          <p className="caption mt-0.5">실시간 TOP 10 헤드라인</p>
        </div>
        <select
          aria-label="매체 선택"
          className="h-8 rounded-md border border-border bg-white px-2 text-xs focus:border-primary-500"
          defaultValue="전체"
        >
          <option>전체</option>
          <option>조선일보</option>
          <option>중앙일보</option>
          <option>한겨레</option>
        </select>
      </div>

      <ul className="divide-y divide-border">
        {items.map((item) => (
          <li
            key={item.rank}
            className="flex items-center gap-3 py-2.5 text-sm"
          >
            <span className="w-5 text-center text-xs font-semibold text-muted">
              {item.rank}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{item.title}</p>
              <p className="caption">{item.media}</p>
            </div>
            <ChangeIndicator change={item.change} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function ChangeIndicator({ change }: { change: number | null }) {
  if (change === null) {
    return (
      <span className="inline-flex w-10 items-center justify-end gap-0.5 text-[11px] text-muted">
        <Minus className="h-3 w-3" />
      </span>
    );
  }
  if (change > 0) {
    return (
      <span className="inline-flex w-10 items-center justify-end gap-0.5 text-[11px] font-medium text-success">
        <TrendingUp className="h-3 w-3" />
        {change}
      </span>
    );
  }
  return (
    <span className="inline-flex w-10 items-center justify-end gap-0.5 text-[11px] font-medium text-error">
      <TrendingDown className="h-3 w-3" />
      {Math.abs(change)}
    </span>
  );
}
