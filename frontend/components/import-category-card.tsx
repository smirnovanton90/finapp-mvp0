"use client";

import * as React from "react";
import {
  ACTIVE_TEXT_DARK,
  BACKGROUND_DT,
  GREEN_TRANSACTION,
  PLACEHOLDER_COLOR_DARK,
  RED,
} from "@/lib/colors";
import { Pencil, PencilOff, Link, Unlink } from "lucide-react";
import { SegmentedSelector } from "@/components/ui/segmented-selector";
import { TextField, SelectField } from "@/components/ui/form-field";
import { IconButton } from "@/components/ui/icon-button";
import { CategorySelector } from "@/components/category-selector";
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
  /** When set, shows "Добавить" in parent category selector; on click calls this. */
  onAddCategory?: () => void;
};

export function ImportCategoryCard({
  category,
  categoryNodes,
  state,
  onChange,
  onAddCategory,
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
  const [isEditingName, setIsEditingName] = React.useState(false);

  const update = (patch: Partial<ImportCategoryCardState>) => {
    onChange({ ...state, ...patch });
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
            onClick={() => update({ linkEnabled: !state.linkEnabled })}
            aria-label={state.linkEnabled ? "Выключить связь с категорией" : "Связать с категорией"}
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
  category: DzenParsedCategory
): ImportCategoryCardState {
  return {
    ...defaultState,
    name: category.name,
  };
}
