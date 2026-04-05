/**
 * Извлекает pathname из абсолютного URL или нормализует относительный путь.
 */
function imageUrlToPathname(urlOrPath: string): string {
  const trimmed = urlOrPath.trim();
  if (trimmed.startsWith("http")) {
    try {
      return new URL(trimmed).pathname;
    } catch {
      return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
    }
  }
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

/**
 * Склеивает публичный базовый URL API с путём к ресурсу так, чтобы не дублировать
 * префикс пути (например /api), когда бэкенд отдаёт URL с тем же префиксом, что и apiBase
 * (типично: reverse proxy и PUBLIC_BASE_URL=https://домен/api).
 */
export function joinApiBasePath(apiBase: string, urlOrPathFromApi: string): string {
  const pathname = imageUrlToPathname(urlOrPathFromApi);
  let basePath = "";
  try {
    const normalizedBase = apiBase.includes("://")
      ? apiBase
      : `https://${apiBase.replace(/^\/+/, "")}`;
    const u = new URL(normalizedBase.endsWith("/") ? normalizedBase : `${normalizedBase}/`);
    basePath = u.pathname.replace(/\/$/, "") || "";
  } catch {
    basePath = "";
  }

  let resourcePath = pathname;
  if (basePath && resourcePath.startsWith(`${basePath}/`)) {
    resourcePath = resourcePath.slice(basePath.length);
    if (!resourcePath.startsWith("/")) {
      resourcePath = `/${resourcePath}`;
    }
  }

  const baseNorm = apiBase.replace(/\/$/, "");
  return `${baseNorm}${resourcePath}`;
}

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
  return joinApiBasePath(apiBase, trimmed);
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
  return joinApiBasePath(apiBase, url.trim());
}
