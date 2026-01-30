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
