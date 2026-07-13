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

    const budgetPlanMonthId = String(formData.get("singleBudgetPlanMonthId") ?? formData.get("budgetPlanMonthId") ?? "").trim();
    if (!budgetPlanMonthId) throw new Error("Budget month is required.");

    const supabase = await getSupabaseServerClient();
    const { data: bucket, error: bucketError } = await supabase
      .from("v_institutional_monthly_budget_availability")
      .select(
        "fiscal_year_id, fiscal_year_name, organization_id, org_code, account_code_id, account_code, account_name, month_start, official_available_amount, projected_available_amount"
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

      const { error: targetError } = await supabase.from("variance_request_targets").upsert(
        {
          variance_request_id: existing.id as string,
          budget_plan_month_id: budgetPlanMonthId,
          organization_id: bucket.organization_id as string,
          account_code_id: bucket.account_code_id as string,
          month_start: bucket.month_start as string,
          shortage_amount: shortageAmount.toFixed(2)
        },
        { onConflict: "variance_request_id,budget_plan_month_id" }
      );
      if (targetError) throw new Error(targetError.message);
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

      const { error: targetError } = await supabase.from("variance_request_targets").insert({
        variance_request_id: inserted.id as string,
        budget_plan_month_id: budgetPlanMonthId,
        organization_id: bucket.organization_id as string,
        account_code_id: bucket.account_code_id as string,
        month_start: bucket.month_start as string,
        shortage_amount: shortageAmount.toFixed(2)
      });
      if (targetError) throw new Error(targetError.message);

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

export async function createBulkVarianceFromBucketsAction(formData: FormData): Promise<void> {
  try {
    const access = await getAccessContext();
    if (!access.userId) throw new Error("You must be signed in.");
    if (!["admin", "project_manager"].includes(access.role)) throw new Error("Only Admin or Project Manager can create variance drafts.");

    const selectedBucketIds = Array.from(new Set(formData.getAll("budgetPlanMonthId").map((value) => String(value).trim()).filter(Boolean)));
    if (selectedBucketIds.length === 0) throw new Error("Select at least one negative budget month.");

    const supabase = await getSupabaseServerClient();
    const { data: bucketData, error: bucketError } = await supabase
      .from("v_institutional_monthly_budget_availability")
      .select(
        "budget_plan_month_id, fiscal_year_id, fiscal_year_name, organization_id, org_code, account_code_id, account_code, account_name, month_start, official_available_amount, projected_available_amount"
      )
      .in("budget_plan_month_id", selectedBucketIds);
    if (bucketError) throw new Error(bucketError.message);

    const buckets = ((bucketData ?? []) as Array<{
      budget_plan_month_id?: string | null;
      fiscal_year_id?: string | null;
      fiscal_year_name?: string | null;
      organization_id?: string | null;
      org_code?: string | null;
      account_code_id?: string | null;
      account_code?: string | null;
      account_name?: string | null;
      month_start?: string | null;
      official_available_amount?: string | number | null;
      projected_available_amount?: string | number | null;
    }>)
      .map((bucket) => {
        const officialAvailable = asNumber(bucket.official_available_amount);
        const projectedAvailable = asNumber(bucket.projected_available_amount);
        return {
          ...bucket,
          shortageAmount: Math.abs(Math.min(officialAvailable, projectedAvailable, 0))
        };
      })
      .filter((bucket) => bucket.budget_plan_month_id && bucket.fiscal_year_id && bucket.organization_id && bucket.account_code_id && bucket.month_start && bucket.shortageAmount > 0);

    if (buckets.length === 0) throw new Error("Selected buckets do not currently need a variance.");

    const fiscalYearIds = new Set(buckets.map((bucket) => bucket.fiscal_year_id));
    if (fiscalYearIds.size > 1) throw new Error("Create one bulk variance per fiscal year.");

    const totalShortage = buckets.reduce((sum, bucket) => sum + bucket.shortageAmount, 0);
    const reason = `Bulk institutional variance for ${buckets.length} budget ${buckets.length === 1 ? "bucket" : "buckets"}. Total shortage: ${totalShortage.toFixed(2)}.`;

    const { data: inserted, error: insertError } = await supabase
      .from("variance_requests")
      .insert({
        fiscal_year_id: buckets[0].fiscal_year_id as string,
        target_budget_plan_month_id: buckets.length === 1 ? (buckets[0].budget_plan_month_id as string) : null,
        status: "draft",
        reason,
        total_transfer_amount: totalShortage.toFixed(2),
        created_by_user_id: access.userId
      })
      .select("id")
      .single();
    if (insertError || !inserted) throw new Error(insertError?.message ?? "Could not create bulk variance draft.");

    const { error: targetsError } = await supabase.from("variance_request_targets").insert(
      buckets.map((bucket) => ({
        variance_request_id: inserted.id as string,
        budget_plan_month_id: bucket.budget_plan_month_id as string,
        organization_id: bucket.organization_id as string,
        account_code_id: bucket.account_code_id as string,
        month_start: bucket.month_start as string,
        shortage_amount: bucket.shortageAmount.toFixed(2)
      }))
    );
    if (targetsError) throw new Error(targetsError.message);

    const { error: eventError } = await supabase.from("variance_events").insert({
      variance_request_id: inserted.id as string,
      from_status: null,
      to_status: "draft",
      changed_by_user_id: access.userId,
      note: "Bulk variance draft created from institutional budget grid"
    });
    if (eventError) throw new Error(eventError.message);

    revalidatePath("/institutional-budget");
    revalidatePath("/variance");
  } catch (error) {
    rethrowIfRedirect(error);
    throw error;
  }

  redirect("/variance");
}
