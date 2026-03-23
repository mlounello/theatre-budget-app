const configuredPublicSchema =
  process.env.NEXT_PUBLIC_SUPABASE_DB_SCHEMA?.trim() ?? process.env.NEXT_PUBLIC_APP_SCHEMA?.trim();
const configuredServerSchema = process.env.APP_SCHEMA?.trim();
const configuredAppId = process.env.APP_ID?.trim() ?? process.env.THEATRE_BUDGET_CORE_APP_ID?.trim();

const isLocalDevelopment = process.env.NODE_ENV === "development";

function hasValue(value: string | undefined | null): value is string {
  return Boolean(value && value.trim().length > 0);
}

export function getServerAppSchema(): string {
  if (hasValue(configuredServerSchema)) {
    return configuredServerSchema;
  }

  if (isLocalDevelopment) {
    return "public";
  }

  throw new Error("Missing APP_SCHEMA. Set APP_SCHEMA for staging/production deployments.");
}

export function getBrowserAppSchema(): string {
  if (hasValue(configuredPublicSchema)) {
    return configuredPublicSchema;
  }

  if (isLocalDevelopment) {
    return "public";
  }

  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_DB_SCHEMA. Browser schema-scoped Supabase clients need a public schema env in staging/production."
  );
}

export function getAppSchema(): string {
  return typeof window === "undefined" ? getServerAppSchema() : getBrowserAppSchema();
}

export const APP_ID = hasValue(configuredAppId) ? configuredAppId : "theatre_budget";

// Backwards-compatible aliases.
export const THEATRE_BUDGET_CORE_APP_ID = APP_ID;
