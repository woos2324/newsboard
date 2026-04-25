"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Layers,
  GitCompare,
  AlertTriangle,
  Users,
  MessageSquare,
  FileText,
  Sparkles,
} from "lucide-react";

const nav = [
  { href: "/", label: "대시보드", icon: LayoutDashboard },
  { href: "/issue", label: "이슈 분석", icon: Layers },
  { href: "/compare", label: "경쟁사 비교", icon: GitCompare },
  { href: "/gap", label: "미보도 탐지", icon: AlertTriangle },
  { href: "/analytics/subscribers", label: "구독자 분석", icon: Users },
  { href: "/analytics/comments", label: "독자 반응", icon: MessageSquare },
  { href: "/report", label: "AI 리포트", icon: FileText },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r border-border bg-white">
      <div className="flex h-14 items-center gap-2 border-b border-border px-5">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-500 text-white">
          <Sparkles className="h-4 w-4" />
        </div>
        <span className="text-sm font-semibold tracking-tight">Newsboard</span>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <p className="px-3 pb-2 text-[11px] font-medium uppercase tracking-wider text-muted">
          Workspace
        </p>
        <ul className="space-y-1">
          {nav.map((item) => {
            const Icon = item.icon;
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                    active
                      ? "bg-primary-500/10 font-medium text-primary-500"
                      : "text-foreground/80 hover:bg-background hover:text-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-border p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-500/10 text-xs font-semibold text-primary-500">
            KJ
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">김 편집자</p>
            <p className="truncate text-[11px] text-muted">디지털 뉴스룸</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
