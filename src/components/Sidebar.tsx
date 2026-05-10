"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Layers,
  TrendingUp,
  GitCompare,
  AlertTriangle,
  Users,
  MessageSquare,
  FileText,
  Sparkles,
  Newspaper,
  X,
} from "lucide-react";

const nav = [
  { href: "/", label: "대시보드", icon: LayoutDashboard },
  { href: "/issue", label: "이슈 분석", icon: Layers },
  { href: "/trending", label: "실시간 트렌드", icon: TrendingUp },
  { href: "/compare", label: "경쟁사 비교", icon: GitCompare },
  { href: "/gap", label: "미보도 탐지", icon: AlertTriangle },
  { href: "/articles", label: "자사 기사 현황", icon: Newspaper },
  { href: "/analytics/subscribers", label: "구독자 분석", icon: Users },
  { href: "/analytics/comments", label: "독자 반응", icon: MessageSquare },
  { href: "/report", label: "AI 리포트", icon: FileText },
];

type SidebarProps = {
  isOpen?: boolean;
  onClose?: () => void;
};

export function Sidebar({ isOpen = false, onClose }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-40 flex h-full w-60 shrink-0 flex-col border-r border-border bg-white transition-transform duration-200 ease-in-out lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${
        isOpen ? "translate-x-0" : "-translate-x-full"
      }`}
    >
      <div className="flex h-14 items-center gap-2 border-b border-border px-5">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-500 text-white">
          <Sparkles className="h-4 w-4" />
        </div>
        <span className="text-sm font-semibold tracking-tight">Newsboard</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="메뉴 닫기"
          className="ml-auto flex h-7 w-7 items-center justify-center rounded-lg hover:bg-background lg:hidden"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
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
