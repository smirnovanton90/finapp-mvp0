"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wallet, ArrowLeftRight, Plus } from "lucide-react";
import { useSidebar } from "@/components/ui/sidebar-context";
import { cn } from "@/lib/utils";
import { ACCENT, PLACEHOLDER_COLOR_DARK } from "@/lib/colors";

const ASSETS_HREF = "/assets";
const TRANSACTIONS_HREF = "/transactions";
const ADD_ASSET_HREF = "/assets?openCreate=1";
const ADD_TRANSACTION_HREF = "/transactions?openCreate=1";

function NavButton({
  href,
  icon: Icon,
  label,
  active,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      className={cn(
        "flex flex-1 flex-col items-center justify-center gap-0.5 rounded-lg py-2 transition-colors",
        "hover:bg-sidebar-accent/50"
      )}
      style={{ color: active ? ACCENT : PLACEHOLDER_COLOR_DARK }}
    >
      <Icon className="size-6" strokeWidth={1.5} />
      <span className="text-[10px] font-medium leading-tight">{label}</span>
    </Link>
  );
}

export function MobileFloatingBar() {
  const pathname = usePathname();
  const { isDesktop } = useSidebar();

  if (isDesktop) return null;

  const isAssets =
    pathname === ASSETS_HREF || (pathname?.startsWith(ASSETS_HREF + "/") ?? false);
  const isTransactions =
    pathname === TRANSACTIONS_HREF ||
    (pathname?.startsWith(TRANSACTIONS_HREF + "/") ?? false);
  /** На экране Активы "+" добавляет актив, иначе — транзакцию. */
  const addHref = pathname === ASSETS_HREF ? ADD_ASSET_HREF : ADD_TRANSACTION_HREF;
  const addLabel = pathname === ASSETS_HREF ? "Добавить актив" : "Добавить транзакцию";

  return (
    <nav
      className={cn(
        "fixed bottom-0 left-0 right-0 z-30 flex min-h-[72px] flex-col justify-end gap-1 px-4 pb-[env(safe-area-inset-bottom)] pt-3",
        "bg-sidebar/95 backdrop-blur-sm border-t border-sidebar-border"
      )}
      aria-label="Основная навигация"
    >
      <div className="flex items-stretch rounded-xl">
        <NavButton
          href={ASSETS_HREF}
          icon={Wallet}
          label="Активы"
          active={!!isAssets}
        />
        <Link
          href={addHref}
          aria-label={addLabel}
          className={cn(
            "flex shrink-0 items-center justify-center rounded-full -my-1 mx-1",
            "h-12 w-12 shadow-md transition-colors hover:opacity-90"
          )}
          style={{ backgroundColor: ACCENT }}
        >
          <Plus className="size-6" strokeWidth={2.5} style={{ color: "white", opacity: 0.85 }} />
        </Link>
        <NavButton
          href={TRANSACTIONS_HREF}
          icon={ArrowLeftRight}
          label="Транзакции"
          active={!!isTransactions}
        />
      </div>
    </nav>
  );
}
