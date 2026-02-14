"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import type { PurchaseStatus } from "@/lib/types";

const REQUISITION_PROCUREMENT_STATUSES = [
  "requested",
  "ordered",
  "partial_received",
  "fully_received",
  "invoice_sent",
  "invoice_received",
  "paid",
  "cancelled"
] as const;

type RequisitionProcurementStatus = (typeof REQUISITION_PROCUREMENT_STATUSES)[number];

function parseStatus(value: FormDataEntryValue | null): RequisitionProcurementStatus {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (REQUISITION_PROCUREMENT_STATUSES.includes(normalized as RequisitionProcurementStatus)) {
    return normalized as RequisitionProcurementStatus;
  }
  return "requested";
}

function toBudgetStatus(procurementStatus: RequisitionProcurementStatus): PurchaseStatus {
  if (procurementStatus === "requested") return "requested";
  if (procurementStatus === "paid") return "posted";
  if (procurementStatus === "cancelled") return "cancelled";
  return "encumbered";
}

function getStatusAmount(
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

function asNumber(value: string | number | null): number {
  if (value === null) return 0;
  if (typeof value === "number") return value;
  const parsed = Number.parseFloat(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) return error.message;
  return fallback;
}

function rethrowIfRedirect(error: unknown): void {
  const message =
    typeof error === "object" && error !== null && "message" in error
      ? String((error as { message?: unknown }).message)
      : "";
  const digest =
    typeof error === "object" && error !== null && "digest" in error
      ? String((error as { digest?: unknown }).digest)
      : "";

  if (message.includes("NEXT_REDIRECT") || digest.includes("NEXT_REDIRECT")) {
    throw error;
  }
}

function ok(message: string): never {
  redirect(`/?ok=${encodeURIComponent(message)}`);
}

function fail(message: string): never {
  redirect(`/?error=${encodeURIComponent(message)}`);
}

async function ensureProjectPmOrAdminAccess(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  userId: string,
  projectId: string
): Promise<void> {
  const { data, error } = await supabase
    .from("project_memberships")
    .select("role")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const role = (data?.role as string | undefined) ?? null;
  if (!role || !["admin", "project_manager"].includes(role)) {
    throw new Error("Only Admin or Project Manager can update requisition status.");
  }
}

export async function updateDashboardRequisitionStatusAction(formData: FormData): Promise<void> {
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) throw new Error("You must be signed in.");

    const purchaseId = String(formData.get("purchaseId") ?? "").trim();
    const nextProcurementStatus = parseStatus(formData.get("procurementStatus"));
    if (!purchaseId) throw new Error("Purchase id is required.");

    const { data: existing, error: existingError } = await supabase
      .from("purchases")
      .select(
        "id, project_id, request_type, is_credit_card, status, procurement_status, estimated_amount, requested_amount, encumbered_amount, pending_cc_amount, posted_amount, budget_tracked, production_category_id, banner_account_code_id"
      )
      .eq("id", purchaseId)
      .single();

    if (existingError || !existing) throw new Error("Purchase not found.");
    if ((existing.request_type as string) !== "requisition" || Boolean(existing.is_credit_card as boolean | null)) {
      throw new Error("Only requisition rows can be updated from the dashboard.");
    }

    const projectId = existing.project_id as string;
    await ensureProjectPmOrAdminAccess(supabase, user.id, projectId);

    const currentValue = getStatusAmount(existing.status as string, {
      estimated: asNumber(existing.estimated_amount as string | number | null),
      requested: asNumber(existing.requested_amount as string | number | null),
      encumbered: asNumber(existing.encumbered_amount as string | number | null),
      pendingCc: asNumber(existing.pending_cc_amount as string | number | null),
      posted: asNumber(existing.posted_amount as string | number | null)
    });

    const nextBudgetStatus = toBudgetStatus(nextProcurementStatus);
    const nextRequestedAmount = nextBudgetStatus === "requested" ? currentValue : 0;
    const nextEncumberedAmount = nextBudgetStatus === "encumbered" ? currentValue : 0;
    const nextPostedAmount = nextBudgetStatus === "posted" ? currentValue : 0;

    const { error: updateError } = await supabase
      .from("purchases")
      .update({
        procurement_status: nextProcurementStatus,
        status: nextBudgetStatus,
        estimated_amount: currentValue,
        requested_amount: nextRequestedAmount,
        encumbered_amount: nextEncumberedAmount,
        pending_cc_amount: 0,
        posted_amount: nextPostedAmount,
        posted_date: nextBudgetStatus === "posted" ? new Date().toISOString().slice(0, 10) : null
      })
      .eq("id", purchaseId);

    if (updateError) throw new Error(updateError.message);

    const { data: allocations, error: allocationsError } = await supabase
      .from("purchase_allocations")
      .select("id, amount")
      .eq("purchase_id", purchaseId)
      .order("created_at", { ascending: true });
    if (allocationsError) throw new Error(allocationsError.message);

    if (Boolean(existing.budget_tracked) && (allocations ?? []).length > 0) {
      const nextTotal =
        nextBudgetStatus === "encumbered" ? nextEncumberedAmount : nextBudgetStatus === "posted" ? nextPostedAmount : nextRequestedAmount;
      const currentTotal = (allocations ?? []).reduce((sum, row) => sum + asNumber(row.amount as string | number | null), 0);

      if ((allocations ?? []).length === 1 || currentTotal === 0) {
        const targetId = allocations?.[0]?.id as string;
        if (targetId) {
          const { error } = await supabase.from("purchase_allocations").update({ amount: nextTotal }).eq("id", targetId);
          if (error) throw new Error(error.message);
        }
      } else {
        let running = 0;
        for (let i = 0; i < allocations.length; i += 1) {
          const row = allocations[i];
          const id = row.id as string;
          let amount = 0;
          if (i === allocations.length - 1) {
            amount = Number((nextTotal - running).toFixed(2));
          } else {
            const ratio = asNumber(row.amount as string | number | null) / currentTotal;
            amount = Number((nextTotal * ratio).toFixed(2));
            running += amount;
          }
          const { error } = await supabase.from("purchase_allocations").update({ amount }).eq("id", id);
          if (error) throw new Error(error.message);
        }
      }
    }

    revalidatePath("/");
    revalidatePath("/procurement");
    revalidatePath(`/projects/${projectId}`);
    ok("Requisition status updated.");
  } catch (error) {
    rethrowIfRedirect(error);
    fail(getErrorMessage(error, "Could not update requisition status."));
  }
}
