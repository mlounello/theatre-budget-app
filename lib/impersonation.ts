import { createHmac, timingSafeEqual } from "node:crypto";

export const IMPERSONATION_COOKIE = "tba_view_as";
export const IMPERSONATION_MAX_AGE_SECONDS = 60 * 60;

export type ImpersonationPayload = {
  actorUserId: string;
  targetUserId: string;
  targetName: string;
  targetRole: "viewer" | "procurement_tracker";
  expiresAt: number;
};

function signingSecret(): string {
  const secret = process.env.CHECK_REQUEST_TAX_ID_KEY;
  if (!secret || secret.trim().length < 16) {
    throw new Error("CHECK_REQUEST_TAX_ID_KEY is required for secure View as User sessions.");
  }
  return secret;
}

function signature(encodedPayload: string): string {
  return createHmac("sha256", signingSecret()).update(encodedPayload).digest("base64url");
}

export function createImpersonationToken(payload: ImpersonationPayload): string {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encoded}.${signature(encoded)}`;
}

export function verifyImpersonationToken(value: string | null | undefined): ImpersonationPayload | null {
  if (!value) return null;
  const [encoded, suppliedSignature] = value.split(".");
  if (!encoded || !suppliedSignature) return null;
  const expected = signature(encoded);
  const suppliedBuffer = Buffer.from(suppliedSignature);
  const expectedBuffer = Buffer.from(expected);
  if (suppliedBuffer.length !== expectedBuffer.length || !timingSafeEqual(suppliedBuffer, expectedBuffer)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as ImpersonationPayload;
    if (
      !payload.actorUserId ||
      !payload.targetUserId ||
      !payload.targetName ||
      !["viewer", "procurement_tracker"].includes(payload.targetRole) ||
      payload.expiresAt <= Date.now()
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}
