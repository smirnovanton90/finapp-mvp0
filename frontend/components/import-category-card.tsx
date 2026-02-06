"use client";

import * as React from "react";
import {
  ACCENT,
  ACCENT_FILL_LIGHT,
  ACTIVE_TEXT_DARK,
  BACKGROUND_DT,
  GREEN_TRANSACTION,
  PLACEHOLDER_COLOR_DARK,
  RED,
} from "@/lib/colors";
import { SegmentedSelector } from "@/components/ui/segmented-selector";
import { Switch } from "@/components/ui/switch";
import { TextField, SelectField } from "@/components/ui/form-field";
import { CategorySelector } from "@/components/category-selector";
import { CATEGORY_ICON_OPTIONS } from "@/lib/category-icons";
import {
  buildCategoryLookup,
  makeCategoryPathKey,
  type CategoryNode,
  type CategoryScope,
} from "@/lib/categories";
import type { DzenParsedCategory } from "@/lib/dzen-csv-parser";

const NAME_BLOCK_WIDTH = 150;
const TOGGLES_BLOCK_WIDTH = 80;

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
};

const defaultState: ImportCategoryCardState = {
  linkEnabled: false,
  scope: "EXPENSE",
  parentPath: null,
  name: "",
  iconName: "",
  linkedPath: null,
};

export type ImportCategoryCardProps = {
  category: DzenParsedCategory;
  categoryNodes: CategoryNode[];
  state: ImportCategoryCardState;
  onChange: (state: ImportCategoryCardState) => void;
};

export function ImportCategoryCard({
  category,
  categoryNodes,
  state,
  onChange,
}: ImportCategoryCardProps) {
  const effectiveScope = (() => {
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
  const displayName = state.name || category.name;

  const update = (patch: Partial<ImportCategoryCardState>) => {
    onChange({ ...state, ...patch });
  };

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
        {/* 1. Блок с названием — 150px, по центру, перенос */}
        <div
          className="flex flex-col items-center justify-center shrink-0 gap-0.5 text-center"
          style={{ width: NAME_BLOCK_WIDTH }}
        >
          <span
            className="text-base font-normal leading-[18px] break-words w-full"
            style={{ color: ACTIVE_TEXT_DARK }}
          >
            {category.name}
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
              <CategorySelector
                categoryNodes={categoryNodes}
                selectedPath={state.linkedPath}
                onChange={(path) => update({ linkedPath: path })}
                selectionMode="single"
                placeholder="Начните вводить категорию"
                emptyMessage="Нет категорий."
                showChips={false}
              />
            ) : (
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 w-full">
                {/* Строка 1: Тип (Доход/Расход/Оба) | Родитель (импортируемая категория) */}
                <div className="min-w-0">
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
                <div className="min-w-0">
                  <CategorySelector
                    categoryNodes={categoryNodes}
                    selectedPath={state.parentPath}
                    onChange={(path) => update({ parentPath: path })}
                    selectionMode="single"
                    placeholder="Выберите родителя или оставьте пустым (1-й уровень)"
                    emptyMessage="Нет категорий."
                    maxDepth={2}
                    showChips={false}
                  />
                </div>
                {/* Строка 2: Название | Иконка */}
                <div className="min-w-0">
                  <TextField
                    value={displayName}
                    onChange={(e) => update({ name: e.target.value })}
                    placeholder="Например, Продукты"
                  />
                </div>
                <div className="min-w-0">
                  <SelectField
                    label=""
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
            )}
          </div>
      </div>
    </div>
  );
}

export function getInitialCategoryCardState(
  category: DzenParsedCategory
): ImportCategoryCardState {
  return {
    ...defaultState,
    name: category.name,
  };
}
