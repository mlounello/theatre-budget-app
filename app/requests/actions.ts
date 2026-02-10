"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import type { PurchaseStatus } from "@/lib/types";

function parseMoney(value: FormDataEntryValue | null): number {
  if (typeof value !== "string" || value.trim() === "") return 0;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function createRequest(formData: FormData): Promise<void> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("You must be signed in.");
  }

  const budgetLineId = String(formData.get("budgetLineId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const referenceNumber = String(formData.get("referenceNumber") ?? "").trim();
  const estimatedAmount = parseMoney(formData.get("estimatedAmount"));
  const requestedAmount = parseMoney(formData.get("requestedAmount"));

  if (!budgetLineId || !title) {
    throw new Error("Budget line and title are required.");
  }

  const { data: budgetLine, error: budgetLineError } = await supabase
    .from("project_budget_lines")
    .select("id, project_id")
    .eq("id", budgetLineId)
    .single();

  if (budgetLineError || !budgetLine) {
    throw new Error("Invalid budget line selected.");
  }

  const { data: inserted, error } = await supabase
    .from("purchases")
    .insert({
      project_id: budgetLine.project_id,
      budget_line_id: budgetLine.id,
      entered_by_user_id: user.id,
      title,
      reference_number: referenceNumber || null,
      estimated_amount: estimatedAmount,
      requested_amount: requestedAmount,
      status: "requested"
    })
    .select("id")
    .single();

  if (error || !inserted) {
    throw new Error(error?.message ?? "Unable to create request.");
  }

  const eventError = await supabase.from("purchase_events").insert({
    purchase_id: inserted.id,
    from_status: null,
    to_status: "requested",
    estimated_amount_snapshot: estimatedAmount,
    requested_amount_snapshot: requestedAmount,
    encumbered_amount_snapshot: 0,
    pending_cc_amount_snapshot: 0,
    posted_amount_snapshot: 0,
    changed_by_user_id: user.id,
    note: "Request created"
  });

  if (eventError.error) {
    throw new Error(eventError.error.message);
  }

  revalidatePath("/requests");
  revalidatePath("/");
}

export async function updatePurchaseStatus(formData: FormData): Promise<void> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("You must be signed in.");
  }

  const purchaseId = String(formData.get("purchaseId") ?? "");
  const status = String(formData.get("status") ?? "requested") as PurchaseStatus;
  const amount = parseMoney(formData.get("statusAmount"));

  if (!purchaseId) {
    throw new Error("Purchase ID required.");
  }

  const { data: existing, error: existingError } = await supabase
    .from("purchases")
    .select("id, project_id, status, estimated_amount, requested_amount, encumbered_amount, pending_cc_amount, posted_amount")
    .eq("id", purchaseId)
    .single();

  if (existingError || !existing) {
    throw new Error("Purchase not found.");
  }

  const nextValues = {
    encumbered_amount: status === "encumbered" ? amount : 0,
    pending_cc_amount: status === "pending_cc" ? amount : 0,
    posted_amount: status === "posted" ? amount : 0,
    requested_amount: status === "requested" ? amount : existing.requested_amount,
    status,
    posted_date: status === "posted" ? new Date().toISOString().slice(0, 10) : null
  };

  const { error: updateError } = await supabase.from("purchases").update(nextValues).eq("id", purchaseId);

  if (updateError) {
    throw new Error(updateError.message);
  }

  const { error: eventError } = await supabase.from("purchase_events").insert({
    purchase_id: purchaseId,
    from_status: existing.status,
    to_status: status,
    estimated_amount_snapshot: existing.estimated_amount,
    requested_amount_snapshot: nextValues.requested_amount,
    encumbered_amount_snapshot: nextValues.encumbered_amount,
    pending_cc_amount_snapshot: nextValues.pending_cc_amount,
    posted_amount_snapshot: nextValues.posted_amount,
    changed_by_user_id: user.id,
    note: "Status updated"
  });

  if (eventError) {
    throw new Error(eventError.message);
  }

  revalidatePath("/requests");
  revalidatePath("/");
  revalidatePath(`/projects/${existing.project_id}`);
}
