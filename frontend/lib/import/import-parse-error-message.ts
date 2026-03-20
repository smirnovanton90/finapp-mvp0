/**
 * Преобразует технические сообщения об ошибках импорта файлов в текст для пользователя.
 */

export function formatImportFileParseError(err: unknown): string {
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : "";

  const t = raw.trim();
  if (!t) return "Не удалось распознать файл.";

  if (t.includes("Promise.withResolvers")) {
    return (
      "Не удалось открыть PDF: ваша версия браузера не поддерживает нужные возможности JavaScript. " +
      "Обновите браузер или откройте приложение в актуальной версии Chrome, Edge, Firefox или Safari."
    );
  }

  return t;
}
