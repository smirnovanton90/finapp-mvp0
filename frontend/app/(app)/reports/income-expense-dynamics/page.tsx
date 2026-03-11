"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Маршрут сохранён для совместимости со сборкой (typed routes).
 * Редирект на отчёт «Доходы/расходы по периодам».
 */
export default function IncomeExpenseDynamicsPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/reports/income-expense-by-period");
  }, [router]);
  return null;
}
