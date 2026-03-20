"use client";

import * as React from "react";
import {
  ACTIVE_TEXT_DARK,
  BACKGROUND_DT,
  GREEN_TRANSACTION,
  PLACEHOLDER_COLOR_DARK,
  RED,
} from "@/lib/colors";
import { Pencil, PencilOff, Link, Unlink, ArrowLeftRight } from "lucide-react";
import { SegmentedSelector } from "@/components/ui/segmented-selector";
import { TextField, SelectField } from "@/components/ui/form-field";
import { IconButton } from "@/components/ui/icon-button";
import { CategorySelector } from "@/components/category-selector";
import { ItemSelector } from "@/components/item-selector";
import { getItemTypeLabel } from "@/lib/item-types";
import type { ItemOut, CounterpartyOut } from "@/lib/api";
import { CurrencyChip } from "@/components/currency-chip";
import {
  buildTransferFlowMap,
  type TransferRowSpec,
} from "@/lib/import-transfer-category";
import { CATEGORY_ICON_OPTIONS } from "@/lib/category-icons";
import {
  buildCategoryLookup,
  makeCategoryPathKey,
  type CategoryNode,
  type CategoryScope,
} from "@/lib/categories";
import type { DzenParsedCategory } from "@/lib/dzen-csv-parser";

function getScopeStripeColor(scope: CategoryScope): string {
  if (scope === "INCOME") return GREEN_TRANSACTION;
  if (scope === "EXPENSE") return RED;
  return "#7F5CFF"; // ACCENT для BOTH
}

export type CategoryPath = { l1: string; l2: string; l3: string };

export type ImportCategoryCardState = {
  linkEnabled: boolean;
  scope: CategoryScope;
  parentPath: CategoryPath | null;
  name: string;
  iconName: string;
  /** Путь выбранной категории для связи (режим Связать) */
  linkedPath: CategoryPath | null;
  /** Режим «перевод между счетами» (взаимоисключающий с привязкой/созданием категории) */
  transferModeEnabled: boolean;
  /** Поступление / списание по ключу счёта выписки */
  transferFlowByAccountKey: Record<
    string,
    { inboundSourceItemId: number | null; outboundDestItemId: number | null }
  >;
};

const defaultState: ImportCategoryCardState = {
  linkEnabled: false,
  scope: "EXPENSE",
  parentPath: null,
  name: "",
  iconName: "",
  linkedPath: null,
  transferModeEnabled: false,
  transferFlowByAccountKey: {},
};

export type ImportCategoryCardProps = {
  category: DzenParsedCategory;
  categoryNodes: CategoryNode[];
  state: ImportCategoryCardState;
  onChange: (state: ImportCategoryCardState) => void;
  /** When set, shows "Добавить" in parent category selector; on click calls this. */
  onAddCategory?: () => void;
  /** Подстрока «перевод» в названии — показываем режим настройки перевода */
  showTransferMode?: boolean;
  /** Строки настройки перевода (направления по данным выписки) */
  transferRows?: TransferRowSpec[];
  /** Подпись привязанного актива по ключу счёта (шаг 2) */
  linkedItemLabelByAccountKey?: Record<string, string>;
  items?: ItemOut[];
  getCounterpartyForItemId?: (id: number) => CounterpartyOut | null;
  apiBase?: string;
};

function accountKeyToLabel(accountKey: string): { title: string; currency: string } {
  const pipe = accountKey.lastIndexOf("|");
  if (pipe < 0) return { title: accountKey, currency: "" };
  return {
    title: accountKey.slice(0, pipe).trim(),
    currency: accountKey.slice(pipe + 1).trim(),
  };
}

function StatementAccountHalf({
  title,
  currency,
  linkedLabel,
}: {
  title: string;
  currency: string;
  linkedLabel?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5 min-w-0 justify-center">
      <span className="text-xs font-normal" style={{ color: PLACEHOLDER_COLOR_DARK }}>
        Счёт выписки
      </span>
      <div className="flex flex-row items-center gap-2 flex-wrap">
        <span
          className="font-normal break-words"
          style={{ color: ACTIVE_TEXT_DARK, fontSize: 14 }}
        >
          {title}
        </span>
        {currency ? <CurrencyChip code={currency} /> : null}
      </div>
      {linkedLabel ? (
        <span className="text-sm break-words" style={{ color: PLACEHOLDER_COLOR_DARK }}>
          Актив: {linkedLabel}
        </span>
      ) : null}
    </div>
  );
}

export function ImportCategoryCard({
  category,
  categoryNodes,
  state,
  onChange,
  onAddCategory,
  showTransferMode = false,
  transferRows = [],
  linkedItemLabelByAccountKey = {},
  items = [],
  getCounterpartyForItemId,
  apiBase,
}: ImportCategoryCardProps) {
  const effectiveScope = (() => {
    if (state.transferModeEnabled) return "BOTH" as CategoryScope;
    if (!state.linkEnabled || !state.linkedPath) return state.scope;
    const lookup = buildCategoryLookup(categoryNodes);
    const key = makeCategoryPathKey(
      state.linkedPath.l1,
      state.linkedPath.l2,
      state.linkedPath.l3
    );
    const id = lookup.pathToId.get(key);
    const scope = id != null ? lookup.idToScope.get(id) : undefined;
    return scope ?? state.scope;
  })();
  const stripeColor = getScopeStripeColor(effectiveScope);
  const [isEditingName, setIsEditingName] = React.useState(false);

  const update = (patch: Partial<ImportCategoryCardState>) => {
    onChange({ ...state, ...patch });
  };

  const toggleTransferMode = () => {
    if (state.transferModeEnabled) {
      update({
        transferModeEnabled: false,
        transferFlowByAccountKey: {},
      });
      return;
    }
    update({
      transferModeEnabled: true,
      linkEnabled: false,
      linkedPath: null,
      transferFlowByAccountKey: buildTransferFlowMap(
        state.transferFlowByAccountKey,
        transferRows
      ),
    });
  };

  const toggleLinkEnabled = () => {
    const next = !state.linkEnabled;
    if (next) {
      update({
        linkEnabled: true,
        transferModeEnabled: false,
        transferFlowByAccountKey: {},
      });
    } else {
      update({ linkEnabled: false });
    }
  };

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
        {/* Первая строка: название (18px) | IconButton (pencil) | [поле названия] | IconButton (link), по центру */}
        <div className="flex flex-row items-center flex-wrap justify-center gap-2 min-w-0">
          <span
            className="shrink-0"
            style={{ color: ACTIVE_TEXT_DARK, fontSize: 18, fontWeight: 400 }}
          >
            {category.name}
          </span>
          <IconButton
            onClick={() => setIsEditingName((v) => !v)}
            aria-label={isEditingName ? "Закончить редактирование названия" : "Изменить название"}
          >
            {isEditingName ? (
              <PencilOff className="h-4 w-4" />
            ) : (
              <Pencil className="h-4 w-4" />
            )}
          </IconButton>
          {isEditingName && (
            <div className="min-w-[200px] flex-1 max-w-md">
              <TextField
                value={state.name}
                onChange={(e) => update({ name: e.target.value })}
                placeholder="Начните вводить название"
                onBlur={() => setIsEditingName(false)}
                autoFocus
              />
            </div>
          )}
          <IconButton
            onClick={toggleLinkEnabled}
            aria-label={state.linkEnabled ? "Выключить связь с категорией" : "Связать с категорией"}
          >
            {state.linkEnabled ? (
              <Unlink className="h-4 w-4" />
            ) : (
              <Link className="h-4 w-4" />
            )}
          </IconButton>
          {showTransferMode && (
            <IconButton
              onClick={toggleTransferMode}
              aria-label={
                state.transferModeEnabled
                  ? "Выключить настройку перевода между счетами"
                  : "Настроить как перевод между счетами"
              }
            >
              <ArrowLeftRight
                className="h-4 w-4"
                style={{
                  opacity: state.transferModeEnabled ? 1 : 0.65,
                }}
              />
            </IconButton>
          )}
        </div>

        {/* Вторая строка: блок с полями */}
        <div className="flex flex-col min-w-0">
          {state.transferModeEnabled ? (
            <div className="flex flex-col gap-3 w-full min-w-0">
              <span
                className="font-normal break-words"
                style={{ color: ACTIVE_TEXT_DARK, fontSize: 14, fontWeight: 400 }}
              >
                Укажите второй счёт перевода: при поступлении на счёт выписки — откуда списать; при
                списании со счёта выписки — куда зачислить. Операции импортируются как переводы без
                категории.
              </span>
              {transferRows.length === 0 ? (
                <span style={{ color: PLACEHOLDER_COLOR_DARK, fontSize: 14 }}>
                  Нет счетов выписки с привязкой к активу и операциями в этой категории. Настройте
                  счета на шаге 2.
                </span>
              ) : (
                transferRows.map((row) => {
                  const { accountKey, hasInbound, hasOutbound } = row;
                  const { title, currency } = accountKeyToLabel(accountKey);
                  const flow = state.transferFlowByAccountKey[accountKey] ?? {
                    inboundSourceItemId: null,
                    outboundDestItemId: null,
                  };
                  const linkedLabel = linkedItemLabelByAccountKey[accountKey]?.trim();
                  const patchFlow = (
    patch: Partial<{
      inboundSourceItemId: number | null;
      outboundDestItemId: number | null;
    }>
  ) =>
                    update({
                      transferFlowByAccountKey: {
                        ...state.transferFlowByAccountKey,
                        [accountKey]: { ...flow, ...patch },
                      },
                    });
                  return (
                    <div
                      key={accountKey}
                      className="flex flex-col gap-4 w-full min-w-0 rounded-lg px-3 py-3"
                      style={{ backgroundColor: "rgba(255,255,255,0.04)" }}
                    >
                      {hasInbound ? (
                        <div className="flex flex-col gap-2 min-w-0">
                          <span
                            className="text-sm font-normal"
                            style={{ color: ACTIVE_TEXT_DARK }}
                          >
                            Поступление на счёт выписки: выберите счёт списания
                          </span>
                          <div className="grid grid-cols-1 min-[560px]:grid-cols-2 gap-4 w-full min-w-0 items-stretch">
                            <div className="flex flex-col gap-1.5 min-w-0">
                              <span
                                className="text-xs font-normal"
                                style={{ color: PLACEHOLDER_COLOR_DARK }}
                              >
                                Корреспондирующий счёт
                              </span>
                              <ItemSelector
                                items={items}
                                selectedIds={
                                  flow.inboundSourceItemId != null
                                    ? [flow.inboundSourceItemId]
                                    : []
                                }
                                onChange={(ids) =>
                                  patchFlow({
                                    inboundSourceItemId: ids[0] ?? null,
                                  })
                                }
                                selectionMode="single"
                                placeholder="Счёт списания (источник)"
                                showChips={false}
                                getItemTypeLabel={getItemTypeLabel}
                                getCounterpartyForItemId={getCounterpartyForItemId}
                                apiBase={apiBase}
                                ariaLabel={`Счёт списания для поступления на ${title}`}
                              />
                            </div>
                            <div
                              className="min-w-0 min-[560px]:border-l min-[560px]:border-white/10 min-[560px]:pl-4 flex items-center"
                            >
                              <StatementAccountHalf
                                title={title}
                                currency={currency}
                                linkedLabel={linkedLabel}
                              />
                            </div>
                          </div>
                        </div>
                      ) : null}
                      {hasOutbound ? (
                        <div className="flex flex-col gap-2 min-w-0">
                          <span
                            className="text-sm font-normal"
                            style={{ color: ACTIVE_TEXT_DARK }}
                          >
                            Списание со счёта выписки: выберите счёт зачисления
                          </span>
                          <div className="grid grid-cols-1 min-[560px]:grid-cols-2 gap-4 w-full min-w-0 items-stretch">
                            <div
                              className="min-w-0 min-[560px]:border-r min-[560px]:border-white/10 min-[560px]:pr-4 flex items-center"
                            >
                              <StatementAccountHalf
                                title={title}
                                currency={currency}
                                linkedLabel={linkedLabel}
                              />
                            </div>
                            <div className="flex flex-col gap-1.5 min-w-0">
                              <span
                                className="text-xs font-normal"
                                style={{ color: PLACEHOLDER_COLOR_DARK }}
                              >
                                Корреспондирующий счёт
                              </span>
                              <ItemSelector
                                items={items}
                                selectedIds={
                                  flow.outboundDestItemId != null
                                    ? [flow.outboundDestItemId]
                                    : []
                                }
                                onChange={(ids) =>
                                  patchFlow({
                                    outboundDestItemId: ids[0] ?? null,
                                  })
                                }
                                selectionMode="single"
                                placeholder="Счёт зачисления (получатель)"
                                showChips={false}
                                getItemTypeLabel={getItemTypeLabel}
                                getCounterpartyForItemId={getCounterpartyForItemId}
                                apiBase={apiBase}
                                ariaLabel={`Счёт зачисления при списании с ${title}`}
                              />
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>
          ) : state.linkEnabled ? (
            <div className="flex flex-row items-center gap-2 w-full min-w-0">
              <span
                className="font-normal min-w-0 flex-1 break-words"
                style={{ color: ACTIVE_TEXT_DARK, fontSize: 14, fontWeight: 400 }}
              >
                Выберите имеющуюся категорию, к которой будут привязаны операции по этой строке
              </span>
              <div className="w-[400px] shrink-0">
                <CategorySelector
                  categoryNodes={categoryNodes}
                  selectedPath={state.linkedPath}
                  onChange={(path) => update({ linkedPath: path })}
                  selectionMode="single"
                  placeholder="Начните вводить категорию"
                  emptyMessage="Нет категорий."
                  showChips={false}
                />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 w-full">
              {/* Строка 1: Тип | Родительская категория */}
              <div className="min-w-0 flex flex-row items-center gap-2">
                <div className="flex-1 min-w-0">
                  <span
                    className="font-normal break-words"
                    style={{ color: ACTIVE_TEXT_DARK, fontSize: 14, fontWeight: 400 }}
                  >
                    Тип
                  </span>
                </div>
                <div className="w-[300px] shrink-0">
                  <SegmentedSelector
                    options={[
                      { value: "INCOME", label: "Доход", colorScheme: "green" },
                      { value: "EXPENSE", label: "Расход", colorScheme: "red" },
                      { value: "BOTH", label: "Доходы и расходы", colorScheme: "purple" },
                    ]}
                    value={state.scope}
                    onChange={(v) => update({ scope: v as CategoryScope })}
                  />
                </div>
              </div>
              <div className="min-w-0 flex flex-row items-center gap-2">
                <div className="flex-1 min-w-0">
                  <span
                    className="font-normal break-words"
                    style={{ color: ACTIVE_TEXT_DARK, fontSize: 14, fontWeight: 400 }}
                  >
                    Родительская категория
                  </span>
                </div>
                <div className="w-[300px] shrink-0">
                  <CategorySelector
                    categoryNodes={categoryNodes}
                    selectedPath={state.parentPath}
                    onChange={(path) => update({ parentPath: path })}
                    selectionMode="single"
                    placeholder="Выберите родителя или оставьте пустым (1-й уровень)"
                    emptyMessage="Нет категорий."
                    maxDepth={2}
                    showChips={false}
                    onAddCategory={onAddCategory}
                  />
                </div>
              </div>
              {/* Строка 2: Иконка */}
              <div className="min-w-0 flex flex-row items-center gap-2">
                <div className="flex-1 min-w-0">
                  <span
                    className="font-normal break-words"
                    style={{ color: ACTIVE_TEXT_DARK, fontSize: 14, fontWeight: 400 }}
                  >
                    Иконка
                  </span>
                </div>
                <div className="w-[300px] shrink-0">
                  <SelectField
                    value={state.iconName || "none"}
                    onValueChange={(v) =>
                      update({ iconName: v === "none" ? "" : v })
                    }
                    options={[
                      { value: "none", label: "Без иконки" },
                      ...CATEGORY_ICON_OPTIONS.map((option) => ({
                        value: option.value,
                        label: (
                          <span className="flex items-center gap-2">
                            <option.Icon
                              className="h-4 w-4"
                              style={{ color: PLACEHOLDER_COLOR_DARK }}
                            />
                            <span>{option.label}</span>
                          </span>
                        ),
                      }))]}
                    placeholder="Без иконки"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function getInitialCategoryCardState(
  category: DzenParsedCategory,
  options?: { defaultTransferMode?: boolean }
): ImportCategoryCardState {
  return {
    ...defaultState,
    name: category.name,
    transferModeEnabled: options?.defaultTransferMode ?? false,
  };
}
