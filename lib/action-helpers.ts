export type ActionState = {
  ok: boolean;
  message: string;
  timestamp: number;
};

export const emptyState: ActionState = { ok: true, message: "", timestamp: 0 };

export function ok(message: string): ActionState {
  return { ok: true, message, timestamp: Date.now() };
}

export function err(message: string): ActionState {
  return { ok: false, message, timestamp: Date.now() };
}

export function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) return error.message;
  return fallback;
}

export function parseMoney(value: FormDataEntryValue | null): number {
  if (typeof value !== "string" || value.trim() === "") return 0;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function parseIdsJson(value: FormDataEntryValue | null): string[] {
  if (typeof value !== "string" || value.trim() === "") return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => String(item)).filter(Boolean);
  } catch {
    return [];
  }
}
