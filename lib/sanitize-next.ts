export function sanitizeNextPath(rawNext: string | null | undefined, fallback = "/"): string {
  if (!rawNext) return fallback;
  const next = rawNext.trim();
  if (!next.startsWith("/")) return fallback;
  if (next.startsWith("//")) return fallback;
  return next;
}

