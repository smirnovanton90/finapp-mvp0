"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Wallet, ArrowLeftRight, ChevronLeft, ChevronRight, Layers3 } from "lucide-react";
import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSidebar } from "./sidebar-context";

const nav = [
  { href: "/assets", label: "Активы и обязательства", icon: Wallet },
  { href: "/transactions", label: "Транзакции", icon: ArrowLeftRight },
  { href: "/categories", label: "Категории", icon: Layers3 },
];

export function Sidebar() {
  const pathname = usePathname();
  const { isCollapsed, toggleSidebar } = useSidebar();

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 flex h-screen flex-col border-r bg-white transition-all duration-300",
        isCollapsed ? "w-16" : "w-72"
      )}
    >
      <div className="flex h-16 items-center justify-between px-6">
        {!isCollapsed && <div className="text-sm font-semibold">FinApp</div>}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleSidebar}
          className="ml-auto h-8 w-8"
        >
          {isCollapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </Button>
      </div>

      <nav className="flex-1 px-3">
        {nav.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "mb-1 flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                isCollapsed ? "justify-center" : "",
                active
                  ? "bg-violet-50 text-violet-700"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              )}
              title={isCollapsed ? item.label : undefined}
            >
              <Icon className={cn("h-4 w-4 flex-shrink-0", active ? "text-violet-700" : "")} />
              {!isCollapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>
      <div className="border-t p-3">
        <Button
          variant="outline"
          className={cn(
            "w-full gap-2",
            isCollapsed ? "justify-center px-0" : "justify-start"
          )}
          onClick={() => signOut()}
          title={isCollapsed ? "Выйти" : undefined}
        >
          <LogOut className="h-4 w-4 flex-shrink-0" />
          {!isCollapsed && <span>Выйти</span>}
        </Button>
      </div>
    </aside>
  );
}
