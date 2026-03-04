/**
 * Рабочие дни по ТК РФ: выходные (сб/вс), нерабочие праздничные дни (ст. 112 ТК РФ)
 * и перенесённые Правительством РФ выходные.
 * Дата платежа переносится на первый следующий рабочий день.
 */

import { parseDateKey, addDays, toDateKey } from "./asset-item-form-constants";

/** Нерабочие праздничные дни по ст. 112 ТК РФ (месяц, день). */
const FIXED_HOLIDAYS: [number, number][] = [
  [1, 1], [1, 2], [1, 3], [1, 4], [1, 5], [1, 6], [1, 7], [1, 8], // Новогодние каникулы и Рождество
  [2, 23],   // День защитника Отечества
  [3, 8],    // Международный женский день
  [5, 1],    // Праздник Весны и Труда
  [5, 9],    // День Победы
  [6, 12],   // День России
  [11, 4],   // День народного единства
];

/** Перенесённые выходные (дата становится нерабочей): YYYY-MM-DD. Постановления Правительства РФ. */
const TRANSFERRED_DAYS: Set<string> = new Set([
  "2024-12-31", // с 5 янв 2025
  "2025-05-02", // с 4 янв 2025
  "2025-05-08", // с 23 фев 2025
  "2025-06-13", // с 8 мар 2025
  "2025-11-03", // с 1 ноя 2025
  "2025-12-31", // с 4 янв 2026
  "2026-01-09", // с 3 янв 2026
  "2027-02-09", // с 8 мар 2027 (типовой перенос)
  "2027-05-31", // с 1 янв 2027 (типовой перенос)
]);

/** Является ли дата нерабочей (суббота, воскресенье, праздник или перенесённый день). */
export function isNonWorkingDay(dateKey: string): boolean {
  const d = parseDateKey(dateKey);
  const w = d.getDay(); // 0=Sun, 6=Sat
  if (w === 0 || w === 6) return true;
  const month = d.getMonth() + 1;
  const day = d.getDate();
  for (const [m, dd] of FIXED_HOLIDAYS) {
    if (month === m && day === dd) return true;
  }
  if (TRANSFERRED_DAYS.has(dateKey)) return true;
  return false;
}

/** Возвращает первый рабочий день начиная с данной даты (включительно). */
export function getNextWorkday(dateKey: string): string {
  let d = parseDateKey(dateKey);
  let key = toDateKey(d);
  while (isNonWorkingDay(key)) {
    d = addDays(d, 1);
    key = toDateKey(d);
  }
  return key;
}
