"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef } from "react";
import { LayoutDashboard, Wallet, ArrowLeftRight, Plus, LineChart } from "lucide-react";
import { useSidebar } from "@/components/ui/sidebar-context";
import { useMobileWizardOpen } from "@/components/mobile-wizard-open-context";
import { cn } from "@/lib/utils";
import { ACCENT, PLACEHOLDER_COLOR_DARK } from "@/lib/colors";
import { MobileTapScale } from "@/components/mobile-tap-scale";

const ASSETS_HREF = "/assets";
const TRANSACTIONS_HREF = "/transactions";
const DASHBOARD_HREF = "/dashboard";
const PLANNING_HREF = "/financial-planning";
const ADD_ASSET_HREF = "/assets?openCreate=1";
const ADD_TRANSACTION_HREF = "/transactions?openCreate=1";

function NavButton({
  href,
  icon: Icon,
  label,
  active,
  className,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  active: boolean;
  className?: string;
}) {
  return (
    <MobileTapScale className={cn("flex min-w-0", className)}>
      <Link
        href={href}
        aria-label={label}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex flex-1 flex-col items-center justify-center gap-0.5 rounded-lg py-2 transition-colors min-w-0",
          "hover:bg-white/8"
        )}
        style={{ color: active ? ACCENT : PLACEHOLDER_COLOR_DARK }}
      >
        <Icon className="size-5" strokeWidth={1.6} />
        <span className="text-[10px] font-medium leading-tight">{label}</span>
      </Link>
    </MobileTapScale>
  );
}

export function MobileFloatingBar() {
  const pathname = usePathname();
  const { isDesktop } = useSidebar();
  const mobileWizard = useMobileWizardOpen();
  const addButtonRef = useRef<HTMLAnchorElement | HTMLButtonElement>(null);

  if (isDesktop) return null;

  const isAssets =
    pathname === ASSETS_HREF || (pathname?.startsWith(ASSETS_HREF + "/") ?? false);
  const isDashboard =
    pathname === DASHBOARD_HREF || (pathname?.startsWith(DASHBOARD_HREF + "/") ?? false);
  const isPlanning =
    pathname === PLANNING_HREF || (pathname?.startsWith(PLANNING_HREF + "/") ?? false);
  const isTransactions =
    pathname === TRANSACTIONS_HREF ||
    (pathname?.startsWith(TRANSACTIONS_HREF + "/") ?? false);
  /** На экране Активы "+" добавляет актив, иначе — транзакцию. На экране Транзакции — анимация расширения кнопки. */
  const addHref = pathname === ASSETS_HREF ? ADD_ASSET_HREF : ADD_TRANSACTION_HREF;
  const addLabel = pathname === ASSETS_HREF ? "Добавить актив" : "Добавить транзакцию";
  const useExpandAnimation = isTransactions && mobileWizard?.setExpandOrigin;

  const handleAddClick = (e: React.MouseEvent) => {
    if (!useExpandAnimation || !mobileWizard?.setExpandOrigin) return;
    e.preventDefault();
    const target = addButtonRef.current;
    if (!target) return;
    const rect = target.getBoundingClientRect();
    mobileWizard.setExpandOrigin({
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height,
    });
  };

  const addButtonClass = cn(
    "flex h-12 w-12 shrink-0 items-center justify-center rounded-full mx-1",
    "border border-white/20 bg-[#7F5CFF]/70 text-white/90 shadow-[0_6px_18px_rgba(127,92,255,0.4),inset_0_1px_0_rgba(255,255,255,0.2)] backdrop-blur-xl",
    "transition-[transform,background-color,box-shadow] duration-150 ease-out hover:bg-[#7F5CFF]/85 hover:shadow-[0_8px_22px_rgba(127,92,255,0.52),inset_0_1px_0_rgba(255,255,255,0.28)] active:scale-90 motion-reduce:transition-none"
  );

  return (
    <>
      {/* Лёгкое затемнение к низу экрана: контент под панелью остаётся читаемым при скролле */}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-20"
        style={{
          height: "calc(5.75rem + env(safe-area-inset-bottom, 0px))",
          background:
            "linear-gradient(to top, rgba(25, 23, 50, 0.45) 0%, rgba(25, 23, 50, 0.18) 40%, transparent 100%)",
        }}
        aria-hidden
      />
      <nav
        className={cn(
          "fixed bottom-[calc(0.75rem+env(safe-area-inset-bottom))] left-[calc(0.75rem+env(safe-area-inset-left))] right-[calc(0.75rem+env(safe-area-inset-right))] z-30 flex min-h-16 flex-col justify-center px-3",
          "rounded-2xl border border-sidebar-border/70 bg-sidebar/70 shadow-[0_10px_30px_rgba(0,0,0,0.28)] backdrop-blur-xl supports-[backdrop-filter]:bg-sidebar/55"
        )}
        aria-label="Основная навигация"
      >
        <div className="relative grid grid-cols-5 items-stretch rounded-xl">
          <NavButton
            href={DASHBOARD_HREF}
            icon={LayoutDashboard}
            label="Дэшборд"
            active={!!isDashboard}
          />
          <NavButton
            href={PLANNING_HREF}
            icon={LineChart}
            label="Планирование"
            active={!!isPlanning}
          />
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <MobileTapScale>
              {useExpandAnimation ? (
                <button
                  ref={addButtonRef as React.RefObject<HTMLButtonElement>}
                  type="button"
                  aria-label={addLabel}
                  className={addButtonClass}
                  onClick={handleAddClick}
                >
                  <Plus className="size-6" strokeWidth={2.25} />
                </button>
              ) : (
                <Link
                  ref={addButtonRef as React.RefObject<HTMLAnchorElement>}
                  href={addHref}
                  aria-label={addLabel}
                  className={addButtonClass}
                >
                  <Plus className="size-6" strokeWidth={2.25} />
                </Link>
              )}
            </MobileTapScale>
          </div>
          <NavButton
            href={ASSETS_HREF}
            icon={Wallet}
            label="Активы"
            active={!!isAssets}
            className="col-start-4"
          />
          <NavButton
            href={TRANSACTIONS_HREF}
            icon={ArrowLeftRight}
            label="Транзакции"
            active={!!isTransactions}
          />
        </div>
      </nav>
    </>
  );
}
