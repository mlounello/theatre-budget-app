import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const VERSION = "v1";

function getKey(): Buffer {
  const secret = process.env.CHECK_REQUEST_TAX_ID_KEY;
  if (!secret || secret.trim().length < 16) {
    throw new Error("CHECK_REQUEST_TAX_ID_KEY must be configured to store or export Tax ID/SSN values.");
  }
  return createHash("sha256").update(secret).digest();
}

export function taxIdLastFour(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 0) return null;
  return digits.slice(-4);
}

export function encryptSensitiveValue(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(trimmed, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(":");
}

export function decryptSensitiveValue(value: string | null | undefined): string {
  if (!value) return "";
  const [version, ivRaw, tagRaw, ciphertextRaw] = value.split(":");
  if (version !== VERSION || !ivRaw || !tagRaw || !ciphertextRaw) {
    throw new Error("Stored sensitive value is not in a supported encrypted format.");
  }
  const decipher = createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivRaw, "base64url"));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextRaw, "base64url")), decipher.final()]).toString("utf8");
}
