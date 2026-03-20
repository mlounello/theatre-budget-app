const configuredSchema = process.env.APP_SCHEMA?.trim() ?? process.env.NEXT_PUBLIC_SUPABASE_DB_SCHEMA?.trim();
const configuredAppId = process.env.APP_ID?.trim() ?? process.env.THEATRE_BUDGET_CORE_APP_ID?.trim();

const isLocalDevelopment = process.env.NODE_ENV === "development";

if ((!configuredSchema || configuredSchema.length === 0) && !isLocalDevelopment) {
  throw new Error("Missing APP_SCHEMA. Set APP_SCHEMA for staging/production deployments.");
}

// Local development can still default to public if no schema has been configured yet.
export const APP_SCHEMA = configuredSchema && configuredSchema.length > 0 ? configuredSchema : "public";
export const APP_ID = configuredAppId && configuredAppId.length > 0 ? configuredAppId : "theatre_budget";

// Backwards-compatible aliases.
export const THEATRE_BUDGET_SCHEMA = APP_SCHEMA;
export const THEATRE_BUDGET_CORE_APP_ID = APP_ID;
