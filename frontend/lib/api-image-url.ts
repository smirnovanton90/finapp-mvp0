/**
 * Разрешение полного URL для изображений, отдаваемых API (относительные или абсолютные).
 */
export function resolveApiImageUrl(
  url: string | null | undefined,
  apiBase: string
): string | null {
  if (!url || !url.trim()) return null;
  const trimmed = url.trim();
  if (trimmed.startsWith("http")) return trimmed;
  return trimmed.startsWith("/")
    ? `${apiBase}${trimmed}`
    : `${apiBase}/${trimmed}`;
}

/**
 * Всегда строит URL изображения через apiBase, чтобы запрос шёл к тому же бэкенду, что и API.
 * Использовать для фото/логотипов контрагентов и т.п., когда бэкенд может вернуть полный URL
 * (public_base_url), недоступный из браузера.
 */
export function resolveApiImageUrlToBase(
  url: string | null | undefined,
  apiBase: string
): string | null {
  if (!url || !url.trim()) return null;
  const trimmed = url.trim();
  let path: string;
  if (trimmed.startsWith("http")) {
    try {
      path = new URL(trimmed).pathname;
    } catch {
      path = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
    }
  } else {
    path = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  }
  return `${apiBase.replace(/\/$/, "")}${path}`;
}
