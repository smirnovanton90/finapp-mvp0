"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ACCENT } from "@/lib/colors";
import { cn } from "@/lib/utils";

const WEEKDAY_LABELS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"] as const;

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function getMonthBounds(year: number, monthIndex: number) {
  const start = new Date(year, monthIndex, 1);
  const end = new Date(year, monthIndex + 1, 0);
  return { startKey: toDateKey(start), endKey: toDateKey(end) };
}

function formatMonthTitle(year: number, monthIndex: number) {
  const label = new Intl.DateTimeFormat("ru-RU", {
    month: "long",
    year: "numeric",
  }).format(new Date(year, monthIndex, 1));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function buildMonthCells(year: number, monthIndex: number) {
  const first = new Date(year, monthIndex, 1);
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const mondayOffset = (first.getDay() + 6) % 7;
  const cells: Array<{ dateKey: string; day: number } | null> = [];

  for (let i = 0; i < mondayOffset; i += 1) {
    cells.push(null);
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push({
      day,
      dateKey: toDateKey(new Date(year, monthIndex, day)),
    });
  }
  while (cells.length % 7 !== 0) {
    cells.push(null);
  }
  return cells;
}

function normalizeRange(startKey: string, endKey: string) {
  if (!endKey) return { startKey, endKey: "" };
  return startKey <= endKey
    ? { startKey, endKey }
    : { startKey: endKey, endKey: startKey };
}

export type PeriodRangeCalendarProps = {
  startKey: string;
  endKey: string;
  onChange: (range: { startKey: string; endKey: string }) => void;
  /** Вызывается, когда диапазон полностью выбран (вторая дата или весь месяц). */
  onComplete?: (range: { startKey: string; endKey: string }) => void;
  className?: string;
};

export function PeriodRangeCalendar({
  startKey,
  endKey,
  onChange,
  onComplete,
  className,
}: PeriodRangeCalendarProps) {
  const initialView = parseDateKey(startKey || toDateKey(new Date()));
  const [viewYear, setViewYear] = useState(initialView.getFullYear());
  const [viewMonth, setViewMonth] = useState(initialView.getMonth());
  /** Ждём клик по дате окончания. */
  const [awaitingEnd, setAwaitingEnd] = useState(false);

  const cells = useMemo(
    () => buildMonthCells(viewYear, viewMonth),
    [viewMonth, viewYear]
  );

  const { startKey: rangeStart, endKey: rangeEnd } = normalizeRange(
    startKey,
    endKey
  );

  const goPrevMonth = () => {
    const date = new Date(viewYear, viewMonth - 1, 1);
    setViewYear(date.getFullYear());
    setViewMonth(date.getMonth());
  };

  const goNextMonth = () => {
    const date = new Date(viewYear, viewMonth + 1, 1);
    setViewYear(date.getFullYear());
    setViewMonth(date.getMonth());
  };

  const commitRange = (nextStart: string, nextEnd: string) => {
    const range = normalizeRange(nextStart, nextEnd);
    onChange(range);
    onComplete?.(range);
    setAwaitingEnd(false);
  };

  const handleMonthTitleClick = () => {
    const bounds = getMonthBounds(viewYear, viewMonth);
    commitRange(bounds.startKey, bounds.endKey);
  };

  const handleDayClick = (dateKey: string) => {
    if (!awaitingEnd) {
      onChange({ startKey: dateKey, endKey: "" });
      setAwaitingEnd(true);
      return;
    }
    commitRange(startKey || dateKey, dateKey);
  };

  return (
    <div className={cn("w-full select-none", className)}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={goPrevMonth}
          className="grid h-9 w-9 place-items-center rounded-lg text-white/80 transition-colors hover:bg-white/10"
          aria-label="Предыдущий месяц"
        >
          <ChevronLeft className="h-5 w-5" strokeWidth={1.5} />
        </button>
        <button
          type="button"
          onClick={handleMonthTitleClick}
          className="min-w-0 flex-1 truncate rounded-lg px-2 py-2 text-center text-base font-semibold text-white transition-colors hover:bg-white/10"
          title="Выбрать весь месяц"
        >
          {formatMonthTitle(viewYear, viewMonth)}
        </button>
        <button
          type="button"
          onClick={goNextMonth}
          className="grid h-9 w-9 place-items-center rounded-lg text-white/80 transition-colors hover:bg-white/10"
          aria-label="Следующий месяц"
        >
          <ChevronRight className="h-5 w-5" strokeWidth={1.5} />
        </button>
      </div>

      <div className="mb-1 grid grid-cols-7 gap-0.5">
        {WEEKDAY_LABELS.map((label) => (
          <div
            key={label}
            className="py-1 text-center text-[11px] font-medium text-white/45"
          >
            {label}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((cell, index) => {
          if (!cell) {
            return <div key={`empty-${index}`} className="h-10" />;
          }

          const isStart = Boolean(rangeStart) && rangeStart === cell.dateKey;
          const isEnd = Boolean(rangeEnd) && rangeEnd === cell.dateKey;
          const inRange =
            Boolean(rangeStart) &&
            Boolean(rangeEnd) &&
            cell.dateKey > rangeStart &&
            cell.dateKey < rangeEnd;
          const isSingle =
            isStart && (!rangeEnd || rangeStart === rangeEnd);

          return (
            <button
              key={cell.dateKey}
              type="button"
              onClick={() => handleDayClick(cell.dateKey)}
              className={cn(
                "h-10 text-sm font-medium transition-colors",
                inRange && "bg-[rgba(127,92,255,0.28)] text-white",
                isStart &&
                  rangeEnd &&
                  rangeStart !== rangeEnd &&
                  "rounded-l-lg text-white",
                isEnd &&
                  rangeEnd &&
                  rangeStart !== rangeEnd &&
                  "rounded-r-lg text-white",
                isSingle && "rounded-lg text-white",
                !inRange &&
                  !isStart &&
                  !isEnd &&
                  "rounded-lg text-white/85 hover:bg-white/10"
              )}
              style={
                isStart || isEnd || isSingle
                  ? { backgroundColor: ACCENT }
                  : undefined
              }
            >
              {cell.day}
            </button>
          );
        })}
      </div>

      <p className="mt-3 text-center text-xs text-white/45">
        {awaitingEnd && startKey && !endKey
          ? "Выберите дату окончания"
          : "Дата начала и окончания — или нажмите название месяца"}
      </p>
    </div>
  );
}
