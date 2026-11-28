import { getSupabaseServerClient } from "@/lib/supabase-server";
import { getAccessContext, requireProjectRole, type AccessContext } from "@/lib/access";
import { createInstitutionalCommitmentForPurchase } from "@/lib/institutional-budget";
import type { PurchaseStatus } from "@/lib/types";
import { type ActionState, err, getErrorMessage } from "@/lib/action-helpers";

export const PROCUREMENT_STATUSES = [
  "requested",
  "ordered",
  "partial_received",
  "fully_received",
  "invoice_sent",
  "invoice_received",
  "partial_paid",
  "paid",
  "cancelled"
] as const;

export const CC_PROCUREMENT_STATUSES = ["requested", "receipts_uploaded", "statement_paid", "posted_to_account", "cancelled"] as const;

export type ProcurementStatus = (typeof PROCUREMENT_STATUSES)[number] | (typeof CC_PROCUREMENT_STATUSES)[number];

export function getStatusAmount(
  status: string | null | undefined,
  amounts: {
    estimated: number;
    requested: number;
    encumbered: number;
    pendingCc: number;
    posted: number;
  }
): number {
  const normalized = (status ?? "").toLowerCase();
  if (normalized === "posted") return amounts.posted;
  if (normalized === "pending_cc") return amounts.pendingCc;
  if (normalized === "encumbered") return amounts.encumbered;
  if (normalized === "requested") return amounts.requested !== 0 ? amounts.requested : amounts.estimated;
  return amounts.estimated !== 0 ? amounts.estimated : amounts.requested !== 0 ? amounts.requested : amounts.posted;
}

export function parseDateInput(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
}

export async function syncInstitutionalBudget(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  purchaseId: string,
  userId: string
): Promise<ActionState | null> {
  try {
    await createInstitutionalCommitmentForPurchase(supabase, purchaseId, userId);
    return null;
  } catch (error) {
    return err(getErrorMessage(error, "Could not sync institutional budget commitment."));
  }
}

export function parseStatus(value: FormDataEntryValue | null, isCreditCardPurchase: boolean): ProcurementStatus {
  const normalized = String(value ?? "").trim().toLowerCase();
  const allowed = new Set<string>(isCreditCardPurchase ? CC_PROCUREMENT_STATUSES : PROCUREMENT_STATUSES);
  if (allowed.has(normalized)) {
    return normalized as ProcurementStatus;
  }
  return "requested";
}

export function toBudgetStatus(procurementStatus: ProcurementStatus, isCreditCardPurchase: boolean): PurchaseStatus {
  if (isCreditCardPurchase) {
    if (procurementStatus === "posted_to_account") return "posted";
    if (procurementStatus === "cancelled") return "cancelled";
    return "pending_cc";
  }
  if (procurementStatus === "requested") return "requested";
  if (procurementStatus === "paid") return "posted";
  if (procurementStatus === "cancelled") return "cancelled";
  return "encumbered";
}

export function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function isExternalProcurementProjectName(name: string | null | undefined): boolean {
  return String(name ?? "")
    .trim()
    .toLowerCase() === "external procurement";
}

export async function getProjectMeta(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  projectId: string
): Promise<{ id: string; name: string; fiscalYearId: string; organizationId: string | null; isExternal: boolean }> {
  const { data, error } = await supabase
    .from("projects")
    .select("id, name, fiscal_year_id, organization_id")
    .eq("id", projectId)
    .single();
  if (error || !data) throw new Error("Project not found.");
  const name = data.name as string;
  return {
    id: data.id as string,
    name,
    fiscalYearId: data.fiscal_year_id as string,
    organizationId: (data.organization_id as string | null) ?? null,
    isExternal: isExternalProcurementProjectName(name)
  };
}

export async function ensureProjectPmOrAdminAccess(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  userId: string,
  projectId: string,
  access?: AccessContext
): Promise<void> {
  void supabase;
  void userId;
  await requireProjectRole(projectId, ["admin", "project_manager"], {
    errorMessage: "Only Admin or Project Manager can edit procurement rows.",
    access
  });
}

export async function ensureOrganizationPmOrAdminAccess(organizationId: string, fiscalYearId: string): Promise<void> {
  const access = await getAccessContext();
  if (!access.userId) throw new Error("You must be signed in.");
  if (access.role === "admin") return;

  const allowed = access.scopes.some(
    (scope) =>
      (scope.scopeRole === "admin" || scope.scopeRole === "project_manager") &&
      !scope.projectId &&
      (!scope.organizationId || scope.organizationId === organizationId) &&
      (!scope.fiscalYearId || scope.fiscalYearId === fiscalYearId)
  );
  if (!allowed) throw new Error("You do not have permission to manage purchases for this organization budget.");
}

export async function getPurchaseScope(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  purchaseId: string
): Promise<{ projectId: string | null; organizationId: string | null; fiscalYearId: string }> {
  const { data, error } = await supabase
    .from("purchases")
    .select("id, fiscal_year_id, project_id, organization_id")
    .eq("id", purchaseId)
    .single();
  if (error || !data) throw new Error("Purchase not found.");
  return {
    projectId: (data.project_id as string | null) ?? null,
    organizationId: (data.organization_id as string | null) ?? null,
    fiscalYearId: data.fiscal_year_id as string
  };
}

export async function ensurePurchasePmOrAdminAccess(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  userId: string,
  purchaseId: string
): Promise<void> {
  const scope = await getPurchaseScope(supabase, purchaseId);
  if (scope.projectId) return ensureProjectPmOrAdminAccess(supabase, userId, scope.projectId);
  if (scope.organizationId) return ensureOrganizationPmOrAdminAccess(scope.organizationId, scope.fiscalYearId);
  throw new Error("Purchase has no budget scope.");
}
