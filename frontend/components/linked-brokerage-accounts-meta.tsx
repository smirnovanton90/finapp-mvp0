"use client";

import { User, Building2 } from "lucide-react";
import { CardIcon } from "@/components/card-icon";
import { cn } from "@/lib/utils";
import { PLACEHOLDER_COLOR_DARK } from "@/lib/colors";
import { API_BASE, type CounterpartyOut, type LinkedBrokerageAccountOut } from "@/lib/api";
import { buildCounterpartyDisplayName } from "@/lib/counterparty-utils";
import { useCounterpartyImage } from "@/hooks/use-counterparty-image";

function LinkedBrokerageLinkLine({
  accountName,
  bankCounterparty,
  bankName,
}: {
  accountName: string;
  bankCounterparty: CounterpartyOut | null;
  bankName: string | null | undefined;
}) {
  const bankLabel = bankCounterparty
    ? buildCounterpartyDisplayName(bankCounterparty)
    : (bankName ?? "").trim();
  const showBankIcon = Boolean(bankCounterparty || bankLabel);

  const { currentSrc, onError, showFallbackIcon } = useCounterpartyImage(
    bankCounterparty,
    API_BASE
  );
  const FallbackIcon =
    bankCounterparty?.entity_type === "PERSON" ? User : Building2;

  const lineText =
    showBankIcon && bankLabel ? `${bankLabel} · ${accountName}` : accountName;

  return (
    <div className="flex w-full max-w-full min-w-0 items-center gap-2">
      {showBankIcon && bankLabel ? (
        <div className="relative h-5 w-5 shrink-0 flex items-center justify-center">
          <CardIcon
            src={currentSrc && !showFallbackIcon ? currentSrc : null}
            alt={bankLabel}
            fallbackIcon={FallbackIcon}
            size={20}
            shadow={false}
            objectFit="contain"
            fallbackIconColor={PLACEHOLDER_COLOR_DARK}
            onError={onError}
          />
        </div>
      ) : null}
      <span
        className="min-w-0 flex-1 truncate text-sm font-normal"
        style={{ color: PLACEHOLDER_COLOR_DARK }}
        title={lineText}
      >
        {lineText}
      </span>
    </div>
  );
}

type Props = {
  links: LinkedBrokerageAccountOut[] | undefined | null;
  /** Для логотипа банка (как у карточки актива с counterparty). */
  counterpartiesById?: ReadonlyMap<number, CounterpartyOut>;
  className?: string;
  align?: "center" | "left";
};

/** Позиции с привязкой к брокерскому счёту: банк и счёт в одной строке (иконка + «Банк · счёт»). */
export function LinkedBrokerageAccountsMeta({
  links,
  counterpartiesById,
  className,
  align = "center",
}: Props) {
  if (!links?.length) return null;

  return (
    <div
      className={cn(
        "flex flex-col gap-2 max-w-full min-w-0",
        align === "center" && "items-center",
        align === "left" && "items-stretch",
        className
      )}
    >
      {links.map((l, i) => {
        const bankCp =
          l.bank_counterparty_id != null
            ? counterpartiesById?.get(l.bank_counterparty_id) ?? null
            : null;
        return (
          <LinkedBrokerageLinkLine
            key={`${l.account_name}-${l.bank_counterparty_id ?? i}`}
            accountName={l.account_name}
            bankCounterparty={bankCp}
            bankName={l.bank_name}
          />
        );
      })}
    </div>
  );
}
