"use client";

import * as React from "react";
import {
  ACCENT,
  ACTIVE_TEXT_DARK,
  BACKGROUND_DT,
} from "@/lib/colors";
import { Link, Unlink } from "lucide-react";
import { SegmentedSelector } from "@/components/ui/segmented-selector";
import { TextField } from "@/components/ui/form-field";
import { ChipsInput } from "@/components/ui/chips-input";
import { CounterpartySelector } from "@/components/counterparty-selector";
import type { DzenParsedCounterparty } from "@/lib/dzen-csv-parser";
import type { CounterpartyOut } from "@/lib/api";

export type CounterpartyEntityType = "LEGAL" | "PERSON";

const MAX_SYNONYMS = 50;
const MAX_SYNONYM_LENGTH = 300;

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
  /** Синонимы (при создании нового контрагента) */
  synonyms: string[];
  linkedCounterpartyId: number | null;
};

const defaultState: ImportCounterpartyCardState = {
  linkEnabled: false,
  entityType: "LEGAL",
  name: "",
  lastName: "",
  firstName: "",
  middleName: "",
  synonyms: [],
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
      className="flex flex-row items-stretch rounded-[10px] overflow-hidden"
      style={{ backgroundColor: BACKGROUND_DT }}
    >
      <div
        className="w-[10px] shrink-0 self-stretch"
        style={{ backgroundColor: stripeColor }}
      />

      <div className="flex flex-col flex-1 min-w-0 py-6 pr-6 pl-4 gap-4">
        {/* Первая строка: название (18px) | IconButton (link), по центру */}
        <div className="flex flex-row items-center flex-wrap justify-center gap-2 min-w-0">
          <span
            className="shrink-0"
            style={{ color: ACTIVE_TEXT_DARK, fontSize: 18, fontWeight: 400 }}
          >
            {counterparty.name}
          </span>
          <IconButton
            onClick={() => update({ linkEnabled: !state.linkEnabled })}
            aria-label={state.linkEnabled ? "Выключить связь с контрагентом" : "Связать с контрагентом"}
          >
            {state.linkEnabled ? (
              <Unlink className="h-4 w-4" />
            ) : (
              <Link className="h-4 w-4" />
            )}
          </IconButton>
        </div>

        {/* Вторая строка: блок с полями */}
        <div className="flex flex-col min-w-0">
          {state.linkEnabled ? (
            <div className="flex flex-row items-center gap-2 w-full min-w-0">
              <span
                className="font-normal min-w-0 flex-1 break-words"
                style={{ color: ACTIVE_TEXT_DARK, fontSize: 14, fontWeight: 400 }}
              >
                Выберите имеющегося контрагента, к которому будут привязаны операции по этой строке
              </span>
              <div className="w-[400px] shrink-0">
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
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 w-full">
              {/* Строка 1: Тип контрагента | Название или Фамилия */}
              <div className="min-w-0 flex flex-row items-center gap-2">
                <div className="flex-1 min-w-0">
                  <span
                    className="font-normal break-words"
                    style={{ color: ACTIVE_TEXT_DARK, fontSize: 14, fontWeight: 400 }}
                  >
                    Тип контрагента
                  </span>
                </div>
                <div className="w-[300px] shrink-0">
                  <SegmentedSelector
                    options={[
                      { value: "LEGAL", label: "ЮЛ/ИП", colorScheme: "purple" },
                      { value: "PERSON", label: "ФЛ", colorScheme: "purple" },
                    ]}
                    value={state.entityType}
                    onChange={(v) =>
                      update({ entityType: v as CounterpartyEntityType })
                    }
                  />
                </div>
              </div>
              <div className="min-w-0 flex flex-row items-center gap-2">
                <div className="flex-1 min-w-0">
                  <span
                    className="font-normal break-words"
                    style={{ color: ACTIVE_TEXT_DARK, fontSize: 14, fontWeight: 400 }}
                  >
                    {state.entityType === "LEGAL" ? "Название" : "Фамилия"}
                  </span>
                </div>
                <div className="w-[300px] shrink-0">
                  {state.entityType === "LEGAL" ? (
                    <TextField
                      value={displayName}
                      onChange={(e) => update({ name: e.target.value })}
                      placeholder="Название"
                    />
                  ) : (
                    <TextField
                      value={state.lastName}
                      onChange={(e) => update({ lastName: e.target.value })}
                      placeholder="Фамилия"
                    />
                  )}
                </div>
              </div>
              {/* Строка 2: для ФЛ — Имя | Отчество, для ЮЛ/ИП — пусто */}
              {state.entityType === "PERSON" ? (
                <>
                  <div className="min-w-0 flex flex-row items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <span
                        className="font-normal break-words"
                        style={{ color: ACTIVE_TEXT_DARK, fontSize: 14, fontWeight: 400 }}
                      >
                        Имя
                      </span>
                    </div>
                    <div className="w-[300px] shrink-0">
                      <TextField
                        value={state.firstName}
                        onChange={(e) => update({ firstName: e.target.value })}
                        placeholder="Имя"
                      />
                    </div>
                  </div>
                  <div className="min-w-0 flex flex-row items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <span
                        className="font-normal break-words"
                        style={{ color: ACTIVE_TEXT_DARK, fontSize: 14, fontWeight: 400 }}
                      >
                        Отчество
                      </span>
                    </div>
                    <div className="w-[300px] shrink-0">
                      <TextField
                        value={state.middleName}
                        onChange={(e) => update({ middleName: e.target.value })}
                        placeholder="Отчество"
                      />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="min-w-0 flex flex-row items-center gap-2" />
                  <div className="min-w-0 flex flex-row items-center gap-2" />
                </>
              )}
              {/* Синонимы (при создании нового контрагента) */}
              <div className="col-span-2 space-y-2">
                <ChipsInput
                  label="Синонимы"
                  labelHint="Добавьте альтернативные названия контрагента. При импорте транзакций из банков контрагент будет подбираться не только по основному названию или ФИО, но и по указанным в этом поле синонимам."
                  value={state.synonyms}
                  onChange={(synonyms) => update({ synonyms })}
                  placeholder="Введите синоним и нажмите Enter"
                  maxItems={MAX_SYNONYMS}
                  maxLengthPerItem={MAX_SYNONYM_LENGTH}
                />
              </div>
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
    synonyms: [],
  };
}
