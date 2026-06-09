"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAccessContext } from "@/lib/access";
import { getSupabaseServerClient } from "@/lib/supabase-server";

function asNumber(value: string | number | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
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

export async function createVarianceFromBucketAction(formData: FormData): Promise<void> {
  try {
    const access = await getAccessContext();
    if (!access.userId) throw new Error("You must be signed in.");
    if (!["admin", "project_manager"].includes(access.role)) throw new Error("Only Admin or Project Manager can create variance drafts.");

    const budgetPlanMonthId = String(formData.get("budgetPlanMonthId") ?? "").trim();
    if (!budgetPlanMonthId) throw new Error("Budget month is required.");

    const supabase = await getSupabaseServerClient();
    const { data: bucket, error: bucketError } = await supabase
      .from("v_institutional_monthly_budget_availability")
      .select(
        "fiscal_year_id, fiscal_year_name, organization_id, org_code, account_code, account_name, month_start, official_available_amount, projected_available_amount"
      )
      .eq("budget_plan_month_id", budgetPlanMonthId)
      .maybeSingle();
    if (bucketError) throw new Error(bucketError.message);
    if (!bucket) throw new Error("Institutional budget bucket was not found.");

    const officialAvailable = asNumber(bucket.official_available_amount as string | number | null);
    const projectedAvailable = asNumber(bucket.projected_available_amount as string | number | null);
    const shortageAmount = Math.abs(Math.min(officialAvailable, projectedAvailable, 0));
    if (shortageAmount <= 0) throw new Error("This bucket does not currently need a variance.");

    const { data: commitment } = await supabase
      .from("institutional_budget_commitments")
      .select("purchase_id, committed_amount, purchases(title)")
      .eq("budget_plan_month_id", budgetPlanMonthId)
      .neq("commitment_status", "cancelled")
      .order("committed_amount", { ascending: false })
      .limit(1)
      .maybeSingle();

    const triggeringPurchaseId = (commitment?.purchase_id as string | null) ?? null;
    let existingQuery = supabase
      .from("variance_requests")
      .select("id")
      .eq("target_budget_plan_month_id", budgetPlanMonthId)
      .in("status", ["draft", "ready_for_review", "submitted", "approved"])
      .order("created_at", { ascending: false })
      .limit(1);
    if (triggeringPurchaseId) existingQuery = existingQuery.eq("triggering_purchase_id", triggeringPurchaseId);
    const { data: existing, error: existingError } = await existingQuery.maybeSingle();
    if (existingError) throw new Error(existingError.message);

    const label = [
      bucket.fiscal_year_name,
      bucket.org_code,
      bucket.account_code,
      bucket.account_name,
      bucket.month_start ? String(bucket.month_start).slice(0, 7) : null
    ]
      .filter(Boolean)
      .join(" / ");
    const reason = `Institutional monthly budget shortage for ${label}. Shortage amount: ${shortageAmount.toFixed(2)}.`;

    if (existing?.id) {
      const { error: updateError } = await supabase
        .from("variance_requests")
        .update({
          fiscal_year_id: bucket.fiscal_year_id as string,
          target_budget_plan_month_id: budgetPlanMonthId,
          triggering_purchase_id: triggeringPurchaseId,
          total_transfer_amount: shortageAmount.toFixed(2),
          reason
        })
        .eq("id", existing.id as string);
      if (updateError) throw new Error(updateError.message);
    } else {
      const { data: inserted, error: insertError } = await supabase
        .from("variance_requests")
        .insert({
          fiscal_year_id: bucket.fiscal_year_id as string,
          target_budget_plan_month_id: budgetPlanMonthId,
          triggering_purchase_id: triggeringPurchaseId,
          status: "draft",
          reason,
          total_transfer_amount: shortageAmount.toFixed(2),
          created_by_user_id: access.userId
        })
        .select("id")
        .single();
      if (insertError || !inserted) throw new Error(insertError?.message ?? "Could not create variance draft.");

      const { error: eventError } = await supabase.from("variance_events").insert({
        variance_request_id: inserted.id as string,
        from_status: null,
        to_status: "draft",
        changed_by_user_id: access.userId,
        note: "Variance draft created from institutional budget grid"
      });
      if (eventError) throw new Error(eventError.message);
    }

    revalidatePath("/institutional-budget");
    revalidatePath("/variance");
  } catch (error) {
    rethrowIfRedirect(error);
    throw error;
  }

  redirect("/variance");
}
