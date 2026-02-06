"use client";

import * as React from "react";
import {
  ACCENT,
  ACCENT_FILL_LIGHT,
  ACTIVE_TEXT_DARK,
  BACKGROUND_DT,
  PLACEHOLDER_COLOR_DARK,
} from "@/lib/colors";
import { SegmentedSelector } from "@/components/ui/segmented-selector";
import { Switch } from "@/components/ui/switch";
import { TextField } from "@/components/ui/form-field";
import { CounterpartySelector } from "@/components/counterparty-selector";
import type { DzenParsedCounterparty } from "@/lib/dzen-csv-parser";
import type { CounterpartyOut } from "@/lib/api";

const NAME_BLOCK_WIDTH = 150;
const TOGGLES_BLOCK_WIDTH = 80;

export type CounterpartyEntityType = "LEGAL" | "PERSON";

export type ImportCounterpartyCardState = {
  linkEnabled: boolean;
  entityType: CounterpartyEntityType;
  /** Название (для ЮЛ/ИП) */
  name: string;
  /** Фамилия (для ФЛ) */
  lastName: string;
  /** Имя (для ФЛ) */
  firstName: string;
  /** Отчество (для ФЛ) */
  middleName: string;
  linkedCounterpartyId: number | null;
};

const defaultState: ImportCounterpartyCardState = {
  linkEnabled: false,
  entityType: "LEGAL",
  name: "",
  lastName: "",
  firstName: "",
  middleName: "",
  linkedCounterpartyId: null,
};

export type ImportCounterpartyCardProps = {
  counterparty: DzenParsedCounterparty;
  counterparties: CounterpartyOut[];
  state: ImportCounterpartyCardState;
  onChange: (state: ImportCounterpartyCardState) => void;
  apiBase: string;
};

export function ImportCounterpartyCard({
  counterparty,
  counterparties,
  state,
  onChange,
  apiBase,
}: ImportCounterpartyCardProps) {
  const stripeColor = ACCENT;
  const update = (patch: Partial<ImportCounterpartyCardState>) => {
    onChange({ ...state, ...patch });
  };

  const displayName =
    state.entityType === "LEGAL"
      ? state.name || counterparty.name
      : [state.lastName, state.firstName, state.middleName]
          .filter(Boolean)
          .join(" ") || counterparty.name;

  return (
    <div
      className="flex flex-row items-center rounded-[10px] overflow-hidden"
      style={{ backgroundColor: BACKGROUND_DT }}
    >
      <div
        className="w-[10px] shrink-0 self-stretch"
        style={{ backgroundColor: stripeColor }}
      />

      <div className="flex flex-row items-center flex-1 min-w-0 gap-3 py-6 pr-6 pl-0">
        {/* 1. Блок с названием — 150px */}
        <div
          className="flex flex-col items-center justify-center shrink-0 gap-0.5 text-center"
          style={{ width: NAME_BLOCK_WIDTH }}
        >
          <span
            className="text-base font-normal leading-[18px] break-words w-full"
            style={{ color: ACTIVE_TEXT_DARK }}
          >
            {counterparty.name}
          </span>
        </div>

        {/* 2. Туггл Связать — 80px */}
        <div
          className="flex flex-col items-center justify-center gap-1.5 shrink-0"
          style={{ width: TOGGLES_BLOCK_WIDTH, color: PLACEHOLDER_COLOR_DARK }}
        >
          <span className="text-[14px] font-normal leading-4">Связать</span>
          <Switch
            checked={state.linkEnabled}
            onCheckedChange={(v) => update({ linkEnabled: v })}
            className="h-[26px] w-[46px]"
          />
        </div>

        {/* 3. Блок с полями */}
          <div className="flex-1 min-w-0 flex flex-col">
            {state.linkEnabled ? (
              <CounterpartySelector
                counterparties={counterparties}
                selectedIds={state.linkedCounterpartyId ? [state.linkedCounterpartyId] : []}
                onChange={(ids) =>
                  update({ linkedCounterpartyId: ids[0] ?? null })
                }
                selectionMode="single"
                placeholder="Начните вводить название / ФИО контрагента"
                emptyMessage="Нет контрагентов."
                showChips={false}
                apiBase={apiBase}
              />
            ) : (
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 w-full">
                {/* Столбец 1: ЮЛ/ИП или ФЛ */}
                <div className="min-w-0">
                  <SegmentedSelector
                    options={[
                      {
                        value: "LEGAL",
                        label: "ЮЛ/ИП",
                        colorScheme: "purple",
                      },
                      {
                        value: "PERSON",
                        label: "ФЛ",
                        colorScheme: "purple",
                      },
                    ]}
                    value={state.entityType}
                    onChange={(v) =>
                      update({ entityType: v as CounterpartyEntityType })
                    }
                  />
                </div>
                {/* Столбец 2: Название (ЮЛ/ИП) или ФИО (ФЛ) — друг под другом */}
                {state.entityType === "LEGAL" ? (
                  <div className="min-w-0 flex flex-col gap-3">
                    <TextField
                      value={displayName}
                      onChange={(e) => update({ name: e.target.value })}
                      placeholder="Название"
                    />
                  </div>
                ) : (
                  <div className="min-w-0 flex flex-col gap-3">
                    <TextField
                      value={state.lastName}
                      onChange={(e) => update({ lastName: e.target.value })}
                      placeholder="Фамилия"
                    />
                    <TextField
                      value={state.firstName}
                      onChange={(e) => update({ firstName: e.target.value })}
                      placeholder="Имя"
                    />
                    <TextField
                      value={state.middleName}
                      onChange={(e) =>
                        update({ middleName: e.target.value })
                      }
                      placeholder="Отчество"
                    />
                  </div>
                )}
              </div>
            )}
          </div>
      </div>
    </div>
  );
}

export function getInitialCounterpartyCardState(
  counterparty: DzenParsedCounterparty
): ImportCounterpartyCardState {
  return {
    ...defaultState,
    name: counterparty.name,
  };
}
