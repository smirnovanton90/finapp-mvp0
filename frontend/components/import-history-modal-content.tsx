"use client";

import { useState } from "react";
import { FileSpreadsheet, Wallet, FileText, FileUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ACTIVE_TEXT_DARK,
  ACCENT,
  ACCENT2,
  MODAL_BG,
} from "@/lib/colors";

/** Иконки: положить в public/illustrations/import/ — dzen-money.png, coinkeeper.png, own-statement.png */
const IMPORT_ICON_PATHS = {
  dzen: "/illustrations/import/dzen-money.png",
  coinkeeper: "/illustrations/import/coinkeeper.png",
  own: "/illustrations/import/own-statement.png",
} as const;

export type ImportSourceKey = keyof typeof IMPORT_ICON_PATHS | "file" | null;

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

function ImportCardIcon({ source }: { source: keyof typeof IMPORT_ICON_PATHS | "file" }) {
  if (source === "file") {
    return (
      <div
        className="w-[72px] h-[72px] shrink-0 rounded-[8px] overflow-hidden flex items-center justify-center"
        style={{ backgroundColor: "rgba(85, 68, 209, 0.12)" }}
      >
        <FileUp className="w-8 h-8" style={{ color: ACCENT }} aria-hidden />
      </div>
    );
  }
  const path = IMPORT_ICON_PATHS[source];
  const FallbackIcon =
    source === "dzen" ? Wallet : source === "coinkeeper" ? FileText : FileSpreadsheet;
  const [failed, setFailed] = useState(false);
  return (
    <div className="w-[72px] h-[72px] shrink-0 rounded-[8px] overflow-hidden flex items-center justify-center">
      {!failed ? (
        <img
          src={path}
          alt=""
          className="w-full h-full object-contain"
          onError={() => setFailed(true)}
        />
      ) : (
        <span style={{ color: ACTIVE_TEXT_DARK }} aria-hidden>
          <FallbackIcon className="w-8 h-8" />
        </span>
      )}
    </div>
  );
}

export function ImportHistoryModalContent({
  selectedSource,
  onSelectSource,
  onLater,
  onStartImport,
}: ImportHistoryModalContentProps) {
  const cards: {
    key: NonNullable<ImportSourceKey>;
    title: string;
    description: string;
    instructionLabel: string | null;
  }[] = [
    {
      key: "dzen",
      title: "Дзен-мани",
      description:
        "Импортируйте выписку в формате .csv, которую можно выгрузить из мобильного или WEB-приложения",
      instructionLabel: "Инструкция по выгрузке выписки",
    },
    {
      key: "coinkeeper",
      title: "CoinKeeper",
      description:
        "Импортируйте выписку в формате .csv, которую можно выгрузить из мобильного или WEB-приложения",
      instructionLabel: "Инструкция по выгрузке выписки",
    },
    {
      key: "own",
      title: "Своя выписка",
      description:
        "Если Вы ранее вели учет самостоятельно, например, в Excel или Google Sheets, то мы поможем Вам без труда импортировать их в ПРОСТОФИН, воспользовавшись несложной инструкцией",
      instructionLabel: "Инструкция по импорту собственной выписки",
    },
    {
      key: "file",
      title: "Резервная копия ПРОСТОФИН",
      description:
        "Восстановите данные из ранее экспортированного файла .csv. Будут созданы контрагенты, категории, активы и обязательства, цепочки транзакций, транзакции и цели.",
      instructionLabel: null,
    },
  ];

  return (
    <div className="flex flex-col w-full h-full min-h-0 px-4 py-4 sm:px-6 sm:py-5 animate-in fade-in duration-300">
      <div className="flex-1 min-h-0 overflow-auto flex flex-col">
        <h2
          className="leading-snug mb-1.5 max-w-2xl shrink-0 text-center mx-auto"
          style={{ ...cardStyle.text, ...cardStyle.title }}
        >
          Импорт истории
        </h2>
        <p
          className="mb-3 max-w-2xl shrink-0 text-center mx-auto"
          style={{ ...cardStyle.text, ...cardStyle.body, lineHeight: 1.35 }}
        >
          Выберите источник данных: выписка из другого приложения (Дзен-мани, CoinKeeper, своя выписка)
          или восстановление из резервной копии ПРОСТОФИН.
        </p>

        <div className="flex flex-col gap-2 sm:gap-2.5 mb-3 w-full">
          {cards.map(({ key, title, description, instructionLabel }) => {
          const isSelected = selectedSource === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelectSource(key)}
              className="w-full rounded-lg p-3 flex flex-row items-start gap-3 text-left transition-all border-0 border-b-[3px] border-solid"
              style={{
                backgroundColor: isSelected ? MODAL_BG : "transparent",
                borderBottomColor: isSelected ? ACCENT2 : "transparent",
                borderRadius: "9px",
                boxShadow: isSelected
                  ? `inset 0 -26px 41px -28px ${ACCENT2}, inset 0 -2px 0 0 ${ACCENT2}`
                  : undefined,
              }}
            >
              <ImportCardIcon source={key} />
              <div className="flex-1 min-w-0 flex flex-col items-start">
                <div
                  className="mb-0.5 w-full break-words"
                  style={{ ...cardStyle.text, fontSize: 16, fontWeight: 500 }}
                >
                  {title}
                </div>
                <p
                  className="mb-1 w-full break-words"
                  style={{ ...cardStyle.text, ...cardStyle.body, lineHeight: 1.35 }}
                >
                  {description}
                </p>
                {instructionLabel != null && (
                  <span
                    role="button"
                    tabIndex={0}
                    className="text-left font-normal underline hover:no-underline focus:outline-none focus:underline cursor-pointer"
                    style={{ ...cardStyle.body, color: ACCENT }}
                    onClick={(e) => {
                      e.stopPropagation();
                      // Заглушка: инструкции пока не открываются
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        e.stopPropagation();
                      }
                    }}
                  >
                    {instructionLabel}
                  </span>
                )}
              </div>
            </button>
          );
        })}
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
          Начать импорт истории
        </Button>
      </div>
    </div>
  );
}
