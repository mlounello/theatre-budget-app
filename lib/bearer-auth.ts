import { timingSafeEqual } from "node:crypto";

/** Constant-time comparison of two strings; false when lengths differ. */
export function secretsMatch(received: string, expected: string): boolean {
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Extracts the token from an `Authorization: Bearer <token>` header, or "". */
export function bearerToken(request: Request): string {
  const header = request.headers.get("authorization") ?? "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

/** True when the request carries `Bearer <secret>` matching a configured, non-empty secret. */
export function hasBearerSecret(request: Request, secret: string | undefined): boolean {
  const expected = secret?.trim();
  if (!expected) return false;
  const received = bearerToken(request);
  return Boolean(received) && secretsMatch(received, expected);
}
