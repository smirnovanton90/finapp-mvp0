"use client";

import * as React from "react";
import { SelectField } from "@/components/ui/form-field";
import {
  COLUMN_MAPPING_OPTIONS,
  type ColumnMapping,
  type ColumnMappingKey,
  validateColumnMapping,
} from "@/lib/own-statement-parser";
import { ACTIVE_TEXT_DARK, BACKGROUND_DT, PLACEHOLDER_COLOR_DARK } from "@/lib/colors";

export type ImportOwnColumnMappingProps = {
  headers: string[];
  mapping: ColumnMapping;
  onChange: (mapping: ColumnMapping) => void;
  error: string | null;
};

export function ImportOwnColumnMapping({
  headers,
  mapping,
  onChange,
  error,
}: ImportOwnColumnMappingProps) {
  const handleMappingChange = (colIndex: number, value: ColumnMappingKey) => {
    onChange({ ...mapping, [colIndex]: value });
  };

  const validation = validateColumnMapping(headers, mapping);

  return (
    <div className="flex flex-col gap-6">
      <p
        className="text-base"
        style={{ color: ACTIVE_TEXT_DARK, lineHeight: 1.4 }}
      >
        Укажите назначение каждого столбца вашей выписки. Обязательны: дата
        транзакции, хотя бы один столбец с суммой и столбец «Счет».
      </p>
      {error && (
        <p className="text-base shrink-0" style={{ color: "#FB4C4F" }}>
          {error}
        </p>
      )}
      <div
        className="flex flex-col gap-3 overflow-auto min-h-0"
        style={{
          backgroundColor: BACKGROUND_DT,
          borderRadius: 9,
          padding: 24,
        }}
      >
        <div
          className="grid gap-3 items-center"
          style={{ gridTemplateColumns: "1fr 400px" }}
        >
          <span
            className="text-sm font-medium"
            style={{ color: PLACEHOLDER_COLOR_DARK }}
          >
            Столбец в файле
          </span>
          <span
            className="text-sm font-medium"
            style={{ color: PLACEHOLDER_COLOR_DARK }}
          >
            Назначение
          </span>
        </div>
        {headers.map((header, colIndex) => (
          <div
            key={colIndex}
            className="grid gap-3 items-center"
            style={{ gridTemplateColumns: "1fr 400px" }}
          >
            <span
              className="text-base truncate py-2"
              style={{ color: ACTIVE_TEXT_DARK }}
              title={header}
            >
              {header || `Столбец ${colIndex + 1}`}
            </span>
            <div style={{ width: 400 }}>
              <SelectField
                label=""
                value={(mapping[colIndex] ?? "") || "__none__"}
                onValueChange={(v) =>
                  handleMappingChange(
                    colIndex,
                    (v === "__none__" ? "" : v) as ColumnMappingKey
                  )
                }
                options={COLUMN_MAPPING_OPTIONS.map((opt) => ({
                  value: opt.value || "__none__",
                  label: opt.label,
                }))}
                placeholder="Не использовать"
              />
            </div>
          </div>
        ))}
      </div>
      {!validation.valid && (
        <p className="text-sm" style={{ color: "#FB4C4F" }}>
          {validation.error}
        </p>
      )}
    </div>
  );
}
