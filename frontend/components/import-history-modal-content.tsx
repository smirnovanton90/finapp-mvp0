"use client";

import { useState } from "react";
import { FileSpreadsheet, Wallet, FileText, FileUp, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CardIcon } from "@/components/card-icon";
import {
  ACTIVE_TEXT_DARK,
  ACCENT,
  ACCENT2,
  MODAL_BG,
} from "@/lib/colors";
import { importBankIconPath } from "@/lib/image-paths";

/** Иконки для Дзен, CoinKeeper, своя выписка: public/illustrations/import/ */
const IMPORT_ICON_PATHS = {
  dzen: "/illustrations/import/dzen-money.png",
  coinkeeper: "/illustrations/import/coinkeeper.png",
  own: "/illustrations/import/own-statement.png",
} as const;

export type ImportSourceKey =
  | "tbank"
  | "sber"
  | "alfa"
  | "ozon"
  | "tbank_invest_api"
  | "dzen"
  | "coinkeeper"
  | "own"
  | "file"
  | null;

type ImportHistoryModalContentProps = {
  selectedSource: ImportSourceKey;
  onSelectSource: (key: ImportSourceKey) => void;
  onLater: () => void;
  onStartImport: () => void;
};

const cardStyle = {
  text: { color: ACTIVE_TEXT_DARK } as const,
  title: { fontSize: 22, fontWeight: 500 } as const,
  body: { fontSize: 14, fontWeight: 400 } as const,
};

const SECTION_HEADER_STYLE = {
  ...cardStyle.text,
  fontSize: 13,
  fontWeight: 600,
  textTransform: "uppercase" as const,
  letterSpacing: "0.02em",
  marginBottom: 8,
  marginTop: 16,
};
const SECTION_HEADER_FIRST = { ...SECTION_HEADER_STYLE, marginTop: 0 };

const CARD_ICON_SIZE = 56;

function ImportCardIcon({
  source,
  size = CARD_ICON_SIZE,
}: {
  source:
    | "dzen"
    | "coinkeeper"
    | "own"
    | "file"
    | "tbank"
    | "sber"
    | "alfa"
    | "ozon"
    | "tbank_invest_api";
  size?: number;
}) {
  const [imgError, setImgError] = useState(false);
  const boxStyle = {
    width: size,
    height: size,
    borderRadius: 8,
    overflow: "hidden" as const,
    display: "flex",
    alignItems: "center" as const,
    justifyContent: "center" as const,
    flexShrink: 0,
    backgroundColor: "rgba(85, 68, 209, 0.08)",
  };

  if (source === "file") {
    return (
      <div style={boxStyle}>
        <FileUp className="w-7 h-7" style={{ color: ACCENT }} aria-hidden />
      </div>
    );
  }

  if (
    source === "tbank" ||
    source === "sber" ||
    source === "alfa" ||
    source === "ozon" ||
    source === "tbank_invest_api"
  ) {
    const src =
      imgError
        ? null
        : importBankIconPath(source === "tbank_invest_api" ? "tbank" : source);
    return (
      <div style={boxStyle}>
        <CardIcon
          src={src}
          alt=""
          fallbackIcon={Building2}
          size={size}
          fallbackIconColor={ACTIVE_TEXT_DARK}
          objectFit="contain"
          onError={() => setImgError(true)}
        />
      </div>
    );
  }

  const path = IMPORT_ICON_PATHS[source as "dzen" | "coinkeeper" | "own"];
  const FallbackIcon =
    source === "dzen" ? Wallet : source === "coinkeeper" ? FileText : FileSpreadsheet;
  return (
    <div style={boxStyle}>
      {!imgError && path ? (
        <img
          src={path}
          alt=""
          width={size}
          height={size}
          className="object-contain w-full h-full"
          onError={() => setImgError(true)}
        />
      ) : (
        <span style={{ color: ACTIVE_TEXT_DARK }} aria-hidden>
          <FallbackIcon className="w-7 h-7" />
        </span>
      )}
    </div>
  );
}

type SourceCard = {
  key: NonNullable<ImportSourceKey>;
  title: string;
  description: string;
};

const BANKS: SourceCard[] = [
  { key: "tbank", title: "Т-Банк", description: "Выписка в формате .xlsx" },
  { key: "sber", title: "Сбер", description: "Выписка в формате .pdf" },
  { key: "alfa", title: "Альфа-Банк", description: "Выписка в формате .pdf" },
  { key: "ozon", title: "Озон Банк", description: "Выписка в формате .pdf" },
];

const OTHER_TOOLS: SourceCard[] = [
  { key: "dzen", title: "Дзен-мани", description: "Выписка в формате .csv из мобильного или WEB-приложения" },
  { key: "coinkeeper", title: "CoinKeeper", description: "Выписка в формате .csv из мобильного или WEB-приложения" },
];

const FREE_FORMAT: SourceCard[] = [
  { key: "own", title: "Своя выписка", description: "Таблица Excel или CSV с маппингом столбцов" },
];

export function ImportHistoryModalContent({
  selectedSource,
  onSelectSource,
  onLater,
  onStartImport,
}: ImportHistoryModalContentProps) {
  const renderSectionRow = (cards: SourceCard[]) => (
    <div className="flex flex-row flex-wrap gap-4 sm:gap-6 w-full justify-start">
      {cards.map(({ key, title, description }) => {
        const isSelected = selectedSource === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onSelectSource(key)}
            onDoubleClick={() => {
              onSelectSource(key);
              onStartImport();
            }}
            className="rounded-lg p-3 flex flex-col items-center gap-2 text-center transition-all border-0 border-b-[3px] border-solid min-w-0"
            style={{
              backgroundColor: isSelected ? MODAL_BG : "transparent",
              borderBottomColor: isSelected ? ACCENT2 : "transparent",
              borderRadius: "9px",
              boxShadow: isSelected
                ? `inset 0 -26px 41px -28px ${ACCENT2}, inset 0 -2px 0 0 ${ACCENT2}`
                : undefined,
            }}
          >
            <ImportCardIcon source={key} size={CARD_ICON_SIZE} />
            <div className="flex flex-col items-center min-w-0 max-w-[120px]">
              <span
                className="break-words w-full"
                style={{ ...cardStyle.text, fontSize: 14, fontWeight: 500 }}
              >
                {title}
              </span>
              <span
                className="break-words w-full mt-0.5"
                style={{ ...cardStyle.text, ...cardStyle.body, fontSize: 12, lineHeight: 1.3 }}
              >
                {description}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="flex flex-col w-full h-full min-h-0 px-4 py-4 sm:px-6 sm:py-5 animate-in fade-in duration-300">
      <div className="flex-1 min-h-0 overflow-auto flex flex-col">
        <h2
          className="leading-snug mb-1.5 max-w-2xl shrink-0 text-center mx-auto"
          style={{ ...cardStyle.text, ...cardStyle.title }}
        >
          Импорт
        </h2>
        <p
          className="mb-3 max-w-2xl shrink-0 text-center mx-auto"
          style={{ ...cardStyle.text, ...cardStyle.body, lineHeight: 1.35 }}
        >
          Выберите источник данных для импорта выписки или восстановления.
        </p>

        <p className="w-full" style={SECTION_HEADER_FIRST}>
          Импорт выписок из банков
        </p>
        <div className="w-full mb-1">
          {renderSectionRow(BANKS)}
        </div>

        <p className="w-full" style={SECTION_HEADER_STYLE}>
          Импорт из других инструментов учета
        </p>
        <div className="w-full mb-1">
          {renderSectionRow(OTHER_TOOLS)}
        </div>

        <p className="w-full" style={SECTION_HEADER_STYLE}>
          Свободный формат
        </p>
        <div className="w-full mb-3">
          {renderSectionRow(FREE_FORMAT)}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 shrink-0 pt-1">
        <Button
          variant="ghost"
          className="h-auto py-1.5 px-0 rounded-none border-0 bg-transparent font-normal hover:!bg-transparent dark:hover:!bg-transparent hover:no-underline text-sm"
          style={{ color: ACCENT }}
          onClick={onLater}
        >
          Позднее
        </Button>
        <Button
          variant="authPrimary"
          className="h-9 rounded-lg border-0 px-6 font-normal text-sm"
          style={
            {
              "--auth-primary-bg":
                "linear-gradient(135deg, #483BA6 0%, #6C5DD7 57%, #6C5DD7 79%, #9487F3 100%)",
              "--auth-primary-bg-hover":
                "linear-gradient(315deg, #9487F3 0%, #6C5DD7 57%, #6C5DD7 79%, #483BA6 100%)",
            } as React.CSSProperties
          }
          disabled={!selectedSource}
          onClick={onStartImport}
        >
          Начать импорт
        </Button>
      </div>
    </div>
  );
}
