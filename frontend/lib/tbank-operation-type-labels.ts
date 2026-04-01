/**
 * Человекочитаемые подписи для operationType из T-Invest API (OPERATION_TYPE_*).
 */

const TBANK_OPERATION_TYPE_LABELS_RU: Record<string, string> = {
  OPERATION_TYPE_UNSPECIFIED: "Не указано",
  OPERATION_TYPE_INPUT: "Ввод денежных средств",
  OPERATION_TYPE_OUTPUT: "Вывод денежных средств",
  OPERATION_TYPE_BUY: "Покупка",
  OPERATION_TYPE_SELL: "Продажа",
  OPERATION_TYPE_BUY_CARD: "Покупка (карта)",
  OPERATION_TYPE_SELL_CARD: "Продажа (карта)",
  OPERATION_TYPE_BUY_MARGIN: "Покупка (маржа)",
  OPERATION_TYPE_SELL_MARGIN: "Продажа (маржа)",
  OPERATION_TYPE_DELIVERY_BUY: "Поставка (покупка)",
  OPERATION_TYPE_DELIVERY_SELL: "Поставка (продажа)",
  OPERATION_TYPE_COUPON: "Купон",
  OPERATION_TYPE_DIVIDEND: "Дивиденды",
  OPERATION_TYPE_BROKER_FEE: "Комиссия брокера",
  OPERATION_TYPE_SERVICE_FEE: "Сервисная комиссия",
  OPERATION_TYPE_TAX: "Налог",
  OPERATION_TYPE_TAX_CORRECTION: "Корректировка налога",
  OPERATION_TYPE_DIVIDEND_TAX: "Налог на дивиденды",
  OPERATION_TYPE_TAX_LUCRE: "Налог с дохода",
  OPERATION_TYPE_TAX_BACK: "Возврат налога",
  OPERATION_TYPE_REPAYMENT: "Погашение",
  OPERATION_TYPE_ACCRUED_INT: "НКД",
  OPERATION_TYPE_WRITE_OFF: "Списание",
  OPERATION_TYPE_WRITE_OFF_MARGIN: "Списание маржи",
  OPERATION_TYPE_MARGIN_FEE: "Маржинальное обеспечение",
  OPERATION_TYPE_OVERNIGHT: "Овернайт",
  OPERATION_TYPE_CONVERT: "Конвертация",
  OPERATION_TYPE_CONVERT_ACCRUED_INT: "Конвертация НКД",
  OPERATION_TYPE_TRACKING_FEE: "Комиссия за сопровождение",
  OPERATION_TYPE_TRACK_MFEE: "Комиссия за сопровождение (M)",
  OPERATION_TYPE_TRACK_PFEE: "Комиссия за сопровождение (P)",
  OPERATION_TYPE_INP_MULTI: "Ввод (мульти)",
  OPERATION_TYPE_OUT_MULTI: "Вывод (мульти)",
  OPERATION_TYPE_INP_MULTI_LIQUID: "Ввод ликвидности",
  OPERATION_TYPE_OUT_MULTI_LIQUID: "Вывод ликвидности",
  OPERATION_TYPE_INP_MULTI_COLLATERAL: "Ввод обеспечения",
  OPERATION_TYPE_OUT_MULTI_COLLATERAL: "Вывод обеспечения",
  OPERATION_TYPE_FEE_BOND: "Комиссия по облигации",
  OPERATION_TYPE_FEE_FUTURES: "Комиссия по фьючерсам",
  OPERATION_TYPE_FEE_OPTION: "Комиссия по опционам",
  OPERATION_TYPE_FEE_MARGIN: "Маржинальная комиссия",
  OPERATION_TYPE_FEE_REPO: "Комиссия РЕПО",
};

function formatUnknownOperationType(operationType: string): string {
  if (operationType.startsWith("OPERATION_TYPE_")) {
    const rest = operationType.slice("OPERATION_TYPE_".length);
    const words = rest.replace(/_/g, " ").toLowerCase();
    return words.charAt(0).toUpperCase() + words.slice(1);
  }
  return operationType;
}

export function getTbankOperationTypeLabel(operationType: string): string {
  if (!operationType || operationType.trim() === "") return "—";
  const direct = TBANK_OPERATION_TYPE_LABELS_RU[operationType];
  if (direct) return direct;
  if (/^\d+$/.test(operationType.trim())) {
    return `Тип операции (${operationType})`;
  }
  return formatUnknownOperationType(operationType);
}

export function sortedTbankTypeEntries(
  byType: Record<string, number>
): [string, number][] {
  return Object.entries(byType).sort((a, b) =>
    getTbankOperationTypeLabel(a[0]).localeCompare(getTbankOperationTypeLabel(b[0]), "ru")
  );
}
