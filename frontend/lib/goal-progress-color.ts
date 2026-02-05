import { RED, GREEN, ORANGE } from "@/lib/colors";

/**
 * Цвет прогресс-бара (и текста суммы) по соотношению к цели.
 * Цель на расход: перерасход = красный, близко к лимиту = оранжевый, в пределах = зелёный.
 * Цель на доход: достигнута/перевыполнена (≥100%) и близко (≥75%) = зелёный, 50–75% = оранжевый, <50% = красный.
 */
export function getGoalProgressColor(ratio: number, isIncomeGoal: boolean): string {
  if (isIncomeGoal) {
    if (ratio >= 1) return GREEN;
    if (ratio >= 0.75) return GREEN;
    if (ratio >= 0.5) return ORANGE;
    return RED;
  }
  if (ratio >= 1) return RED;
  if (ratio >= 0.75) return ORANGE;
  return GREEN;
}
