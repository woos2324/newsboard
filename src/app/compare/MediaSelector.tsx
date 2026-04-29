"use client";

import { useRouter } from "next/navigation";

const CHIP_LIST = [
  { id: "segye", label: "세계일보" },
  { id: "chosun", label: "조선일보" },
  { id: "joongang", label: "중앙일보" },
  { id: "donga", label: "동아일보" },
  { id: "mk", label: "매일경제" },
  { id: "hankyung", label: "한국경제" },
  { id: "hani", label: "한겨레" },
  { id: "jtbc", label: "JTBC" },
  { id: "kbs", label: "KBS" },
  { id: "ytn", label: "YTN" },
];

export function MediaSelector({
  selected,
  tab,
}: {
  selected: string[];
  tab: string;
}) {
  const router = useRouter();

  function toggle(id: string) {
    if (id === "segye") return;
    const next = selected.includes(id)
      ? selected.filter((s) => s !== id)
      : [...selected, id];
    const ordered = ["segye", ...next.filter((s) => s !== "segye")];
    router.push(`/compare?media=${ordered.join(",")}&tab=${tab}`);
  }

  return (
    <div className="mb-5 flex flex-wrap gap-2">
      {CHIP_LIST.map(({ id, label }) => {
        const isSelected = selected.includes(id);
        const isPinned = id === "segye";
        return (
          <button
            key={id}
            onClick={() => toggle(id)}
            className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
              isPinned
                ? "cursor-default border-primary-600 bg-primary-500 text-white"
                : isSelected
                ? "border-primary-500 bg-primary-500/10 text-primary-500 hover:bg-primary-500/20"
                : "border-border bg-white text-muted hover:bg-background"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
