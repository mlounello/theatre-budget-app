"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase-server";

function parseMoney(value: FormDataEntryValue | null): number {
  if (typeof value !== "string" || value.trim() === "") return 0;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function createPlanningRequestAction(formData: FormData): Promise<void> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error("You must be signed in.");

  const projectId = String(formData.get("projectId") ?? "").trim();
  const productionCategoryId = String(formData.get("productionCategoryId") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const vendorName = String(formData.get("vendorName") ?? "").trim();
  const requisitionNumber = String(formData.get("requisitionNumber") ?? "").trim();
  const amount = parseMoney(formData.get("amount"));

  if (!projectId || !productionCategoryId || !title) {
    throw new Error("Project, department, and title are required.");
  }
  if (amount === 0) {
    throw new Error("Amount cannot be zero.");
  }

  const {
    data: membership,
    error: membershipError
  } = await supabase
    .from("project_memberships")
    .select("role")
    .eq("project_id", projectId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (membershipError) throw new Error(membershipError.message);
  const role = (membership?.role as string | undefined) ?? "";
  if (!["admin", "project_manager", "buyer"].includes(role)) {
    throw new Error("Only Buyer, Project Manager, or Admin can add planning requests.");
  }

  const { data: budgetLineId, error: ensureError } = await supabase.rpc("ensure_project_category_line", {
    p_project_id: projectId,
    p_production_category_id: productionCategoryId
  });
  if (ensureError || !budgetLineId) {
    throw new Error(ensureError?.message ?? "Unable to resolve category line.");
  }

  let vendorId: string | null = null;
  if (vendorName) {
    const { data: vendor, error: vendorError } = await supabase
      .from("vendors")
      .upsert({ name: vendorName }, { onConflict: "name" })
      .select("id")
      .single();
    if (vendorError) throw new Error(vendorError.message);
    vendorId = vendor.id as string;
  }

  const { data: inserted, error: insertError } = await supabase
    .from("purchases")
    .insert({
      project_id: projectId,
      budget_line_id: budgetLineId as string,
      production_category_id: productionCategoryId,
      vendor_id: vendorId,
      entered_by_user_id: user.id,
      title,
      requisition_number: requisitionNumber || null,
      estimated_amount: amount,
      requested_amount: amount,
      encumbered_amount: 0,
      pending_cc_amount: 0,
      posted_amount: 0,
      request_type: "request",
      status: "requested",
      budget_tracked: true
    })
    .select("id")
    .single();
  if (insertError || !inserted) {
    throw new Error(insertError?.message ?? "Unable to create planning request.");
  }

  const { error: allocationError } = await supabase.from("purchase_allocations").insert({
    purchase_id: inserted.id as string,
    reporting_budget_line_id: budgetLineId as string,
    production_category_id: productionCategoryId,
    reporting_bucket: "direct",
    amount
  });
  if (allocationError) throw new Error(allocationError.message);

  const { error: eventError } = await supabase.from("purchase_events").insert({
    purchase_id: inserted.id as string,
    from_status: null,
    to_status: "requested",
    estimated_amount_snapshot: amount,
    requested_amount_snapshot: amount,
    encumbered_amount_snapshot: 0,
    pending_cc_amount_snapshot: 0,
    posted_amount_snapshot: 0,
    changed_by_user_id: user.id,
    note: "Planning request created"
  });
  if (eventError) throw new Error(eventError.message);

  revalidatePath("/my-budget");
  revalidatePath("/requests");
  revalidatePath("/");
}
