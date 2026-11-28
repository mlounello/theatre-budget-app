export function sanitizeNextPath(rawNext: string | null | undefined, fallback = "/"): string {
  if (!rawNext) return fallback;
  const next = rawNext.trim();
  if (!next.startsWith("/")) return fallback;
  if (next.startsWith("//")) return fallback;
  // Browsers normalize "\" to "/" and drop tabs/newlines, so "/\host" and "/\t/host" become protocol-relative URLs.
  if (/[\\\u0000-\u001f]/.test(next)) return fallback;
  return next;
}

