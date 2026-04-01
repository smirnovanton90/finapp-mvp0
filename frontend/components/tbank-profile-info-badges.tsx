"use client";

import type { TbankInfoOut } from "@/lib/api";
import { ACTIVE_TEXT_DARK, BACKGROUND_DT, MODAL_BG } from "@/lib/colors";
import { cn } from "@/lib/utils";

export type TbankProfileInfoBadgesVariant = "modal" | "cabinet" | "setup";

type RowProps = {
  label: string;
  value: string;
  variant: TbankProfileInfoBadgesVariant;
};

function ProfileBadgeRow({ label, value, variant }: RowProps) {
  const isSetup = variant === "setup";
  return (
    <div
      className="flex min-w-0 items-center justify-between gap-2 p-4"
      style={{
        backgroundColor: isSetup ? "rgba(255, 255, 255, 0.06)" : BACKGROUND_DT,
        borderRadius: 9,
      }}
    >
      <span
        className="text-base shrink min-w-0 pr-2"
        style={{ color: isSetup ? "rgba(255, 255, 255, 0.85)" : ACTIVE_TEXT_DARK }}
      >
        {label}
      </span>
      <div
        className="min-w-0 max-w-[58%] shrink-0 px-3 py-1.5 text-base text-right break-words"
        style={{
          color: isSetup ? "rgba(255, 255, 255, 0.95)" : ACTIVE_TEXT_DARK,
          backgroundColor: isSetup ? "rgba(0, 0, 0, 0.28)" : MODAL_BG,
          borderRadius: 9,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function formatYesNo(v: boolean | null | undefined): string {
  if (v == null) return "—";
  return v ? "Да" : "Нет";
}

export type TbankProfileInfoBadgesProps = {
  info: TbankInfoOut | null | undefined;
  variant?: TbankProfileInfoBadgesVariant;
  className?: string;
};

/**
 * Три плашки (Премиум, квалифицированный инвестор, тариф) в стиле
 * счётчиков сущностей при импорте банковской выписки.
 */
export function TbankProfileInfoBadges({
  info,
  variant = "modal",
  className,
}: TbankProfileInfoBadgesProps) {
  const tariffLine = info ? (info.tariff ?? info.risk_category ?? "—") : "—";

  return (
    <div className={cn("flex w-full flex-col gap-3", className)}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
        <ProfileBadgeRow
          variant={variant}
          label="Премиум"
          value={formatYesNo(info?.is_premium)}
        />
        <ProfileBadgeRow
          variant={variant}
          label="Квалифицированный инвестор"
          value={formatYesNo(info?.is_qualified)}
        />
        <ProfileBadgeRow variant={variant} label="Тариф" value={tariffLine} />
      </div>
    </div>
  );
}
