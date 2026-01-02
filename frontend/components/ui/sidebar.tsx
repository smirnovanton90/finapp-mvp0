"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import {
  Wallet,
  ArrowLeftRight,
  LineChart,
  BarChart3,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
} from "lucide-react";
import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSidebar } from "./sidebar-context";

const nav = [
  { href: "/dashboard", label: "\u0414\u044d\u0448\u0431\u043e\u0440\u0434", icon: LayoutDashboard },
  {
    href: "/assets",
    label: "\u0410\u043a\u0442\u0438\u0432\u044b \u0438 \u043e\u0431\u044f\u0437\u0430\u0442\u0435\u043b\u044c\u0441\u0442\u0432\u0430",
    icon: Wallet,
  },
  {
    href: "/transactions",
    label: "\u0422\u0440\u0430\u043d\u0437\u0430\u043a\u0446\u0438\u0438",
    icon: ArrowLeftRight,
  },
  {
    href: "/financial-planning",
    label: "\u041f\u043b\u0430\u043d\u0438\u0440\u043e\u0432\u0430\u043d\u0438\u0435",
    icon: LineChart,
  },
  {
    href: "/reports",
    label: "\u041e\u0442\u0447\u0435\u0442\u044b",
    icon: BarChart3,
    children: [
      {
        href: "/reports/assets-dynamics",
        label: "\u0414\u0438\u043d\u0430\u043c\u0438\u043a\u0430 \u0441\u0442\u043e\u0438\u043c\u043e\u0441\u0442\u0438 \u0430\u043a\u0442\u0438\u0432\u043e\u0432",
      },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const { isCollapsed, toggleSidebar } = useSidebar();
  const [isReportsOpen, setIsReportsOpen] = useState(
    pathname === "/reports" || pathname.startsWith("/reports/")
  );

  useEffect(() => {
    if (pathname === "/reports" || pathname.startsWith("/reports/")) {
      setIsReportsOpen(true);
    }
  }, [pathname]);

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 flex h-screen flex-col overflow-hidden rounded-none rounded-r-3xl border border-white/10 bg-gradient-to-b from-[#8D63FF] via-[#7A58F3] to-[#5A5FF0] text-white shadow-xl transition-all duration-300",
        isCollapsed ? "w-16" : "w-72"
      )}
    >
      <div className="relative flex h-16 items-center justify-center px-5">
        {!isCollapsed && (
          <div className="text-base font-semibold tracking-wide text-white drop-shadow-sm">
            FinApp
          </div>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleSidebar}
          className={cn(
            "h-6 w-6 rounded-full border-2 border-white/90 bg-transparent text-white shadow-sm hover:bg-white hover:text-violet-700",
            isCollapsed
              ? "absolute left-1/2 -translate-x-1/2"
              : "absolute right-4"
          )}
        >
          {isCollapsed ? (
            <ChevronRight className="h-3.5 w-3.5" strokeWidth={2} />
          ) : (
            <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2} />
          )}
        </Button>
      </div>

      <nav className="flex flex-1 flex-col gap-2 px-0 pt-2">
        {nav.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;

          if (item.children?.length) {
            const showChildren = isReportsOpen && !isCollapsed;

            return (
              <div key={item.href} className="flex flex-col">
                <button
                  type="button"
                  onClick={() => setIsReportsOpen((prev) => !prev)}
                  className={cn(
                    "relative flex w-full items-center gap-3 py-2 text-base font-semibold transition-colors",
                    isCollapsed ? "justify-center px-0" : "pl-7 pr-5",
                    active
                      ? "text-white before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1 before:bg-white before:content-['']"
                      : "text-white/80 hover:text-white"
                  )}
                  title={isCollapsed ? item.label : undefined}
                >
                  <Icon
                    className={cn(
                      "h-6 w-6 flex-shrink-0",
                      active ? "text-white" : "text-white/90"
                    )}
                  />
                  {!isCollapsed && <span>{item.label}</span>}
                  {!isCollapsed && (
                    <ChevronDown
                      className={cn(
                        "ml-auto h-4 w-4 transition-transform",
                        isReportsOpen ? "rotate-0" : "-rotate-90"
                      )}
                    />
                  )}
                </button>
                {showChildren && (
                  <div className="flex flex-col gap-1 pb-1 pl-12 pr-5">
                    {item.children.map((child) => {
                      const childActive =
                        pathname === child.href ||
                        pathname.startsWith(child.href + "/");

                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          className={cn(
                            "rounded-md py-1.5 text-sm font-medium transition-colors",
                            childActive
                              ? "text-white"
                              : "text-white/75 hover:text-white"
                          )}
                        >
                          {child.label}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "relative flex w-full items-center gap-3 py-2 text-base font-semibold transition-colors",
                isCollapsed ? "justify-center px-0" : "pl-7 pr-5",
                active
                  ? "text-white before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1 before:bg-white before:content-['']"
                  : "text-white/80 hover:text-white"
              )}
              title={isCollapsed ? item.label : undefined}
            >
              <Icon
                className={cn("h-6 w-6 flex-shrink-0", active ? "text-white" : "text-white/90")}
              />
              {!isCollapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>
      <div className="px-4 pb-4">
        <Button
          variant="ghost"
          className={cn(
            "w-full justify-center rounded-md border-2 border-white/90 bg-transparent py-2 text-sm font-semibold text-white shadow-sm hover:bg-white hover:text-violet-700",
            isCollapsed ? "px-0" : "px-4"
          )}
          onClick={() => signOut()}
          title={isCollapsed ? "\u0412\u044b\u0439\u0442\u0438" : undefined}
        >
          <LogOut className={cn("h-4 w-4 flex-shrink-0", isCollapsed ? "" : "hidden")} />
          {!isCollapsed && <span>{"\u0412\u044b\u0439\u0442\u0438"}</span>}
        </Button>
      </div>
    </aside>
  );
}
