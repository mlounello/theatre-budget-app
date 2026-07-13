"use server";

import { revalidatePath } from "next/cache";
import { getAccessContext } from "@/lib/access";
import { getSupabaseServerClient } from "@/lib/supabase-server";

type ActionState = {
  ok: boolean;
  message: string;
  timestamp: number;
};

const emptyState: ActionState = { ok: true, message: "", timestamp: 0 };

function ok(message: string): ActionState {
  return { ok: true, message, timestamp: Date.now() };
}

function err(message: string): ActionState {
  return { ok: false, message, timestamp: Date.now() };
}

function parseMoney(value: FormDataEntryValue | null): number {
  if (typeof value !== "string" || value.trim() === "") return 0;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asNumber(value: string | number | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) return error.message;
  return fallback;
}

function normalizeStatus(value: FormDataEntryValue | null): "draft" | "ready_for_review" | "submitted" | "approved" | "denied" | "posted" {
  const raw = String(value ?? "draft").trim().toLowerCase();
  if (raw === "ready_for_review" || raw === "submitted" || raw === "approved" || raw === "denied" || raw === "posted") return raw;
  return "draft";
}

async function requireVarianceAccess(targetStatus?: string): Promise<{ userId: string; role: string }> {
  const access = await getAccessContext();
  if (!access.userId) throw new Error("You must be signed in.");
  if (!["admin", "project_manager"].includes(access.role)) {
    throw new Error("Only Admin or Project Manager can manage variance drafts.");
  }
  if ((targetStatus === "approved" || targetStatus === "posted") && access.role !== "admin") {
    throw new Error("Only Admin can approve or post variances.");
  }
  return { userId: access.userId, role: access.role };
}

async function getVarianceFundingState(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  varianceRequestId: string
): Promise<{ status: string; targetShortage: number; totalSourced: number; targetBudgetPlanMonthId: string | null }> {
  const { data: variance, error: varianceError } = await supabase
    .from("variance_requests")
    .select("id, status, total_transfer_amount, target_budget_plan_month_id")
    .eq("id", varianceRequestId)
    .single();
  if (varianceError || !variance) throw new Error("Variance request not found.");

  const targetBudgetPlanMonthId = (variance.target_budget_plan_month_id as string | null) ?? null;
  let targetShortage = asNumber(variance.total_transfer_amount as string | number | null);
  const { data: targets, error: targetsError } = await supabase
    .from("variance_request_targets")
    .select("shortage_amount")
    .eq("variance_request_id", varianceRequestId);
  if (targetsError) throw new Error(targetsError.message);
  if ((targets ?? []).length > 0) {
    targetShortage = ((targets ?? []) as Array<{ shortage_amount?: string | number | null }>).reduce(
      (sum, target) => sum + asNumber(target.shortage_amount),
      0
    );
  } else if (targetBudgetPlanMonthId) {
    const { data: bucket, error: bucketError } = await supabase
      .from("v_institutional_monthly_budget_availability")
      .select("official_available_amount")
      .eq("budget_plan_month_id", targetBudgetPlanMonthId)
      .maybeSingle();
    if (bucketError) throw new Error(bucketError.message);
    const officialAvailable = asNumber(bucket?.official_available_amount as string | number | null);
    if (officialAvailable < 0) targetShortage = Math.abs(officialAvailable);
  }

  const { data: lines, error: linesError } = await supabase
    .from("variance_request_lines")
    .select("transfer_amount")
    .eq("variance_request_id", varianceRequestId);
  if (linesError) throw new Error(linesError.message);
  const totalSourced = ((lines ?? []) as Array<{ transfer_amount?: string | number | null }>).reduce(
    (sum, line) => sum + asNumber(line.transfer_amount),
    0
  );

  return {
    status: String(variance.status ?? "draft"),
    targetShortage: Number(targetShortage.toFixed(2)),
    totalSourced: Number(totalSourced.toFixed(2)),
    targetBudgetPlanMonthId
  };
}

async function updateVarianceSourceTotal(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  varianceRequestId: string
): Promise<number> {
  const state = await getVarianceFundingState(supabase, varianceRequestId);
  const { error } = await supabase
    .from("variance_requests")
    .update({ total_transfer_amount: state.targetShortage.toFixed(2) })
    .eq("id", varianceRequestId);
  if (error) throw new Error(error.message);
  return state.totalSourced;
}

export async function addVarianceSourceLineAction(
  prevState: ActionState = emptyState,
  formData: FormData
): Promise<ActionState> {
  void prevState;
  try {
    const { userId } = await requireVarianceAccess();
    const supabase = await getSupabaseServerClient();

    const varianceRequestId = String(formData.get("varianceRequestId") ?? "").trim();
    const fromBudgetPlanMonthId = String(formData.get("fromBudgetPlanMonthId") ?? "").trim();
    const requestedToBudgetPlanMonthId = String(formData.get("toBudgetPlanMonthId") ?? "").trim();
    const transferAmount = parseMoney(formData.get("transferAmount"));
    const narrative = String(formData.get("narrative") ?? "").trim();
    const crossOrgOverride = formData.get("crossOrgOverride") === "on";

    if (!varianceRequestId || !fromBudgetPlanMonthId) return err("Variance and source bucket are required.");
    if (transferAmount <= 0) return err("Transfer amount must be greater than zero.");

    const fundingState = await getVarianceFundingState(supabase, varianceRequestId);
    if (fundingState.totalSourced >= fundingState.targetShortage && fundingState.targetShortage > 0) {
      return err("This variance is already fully sourced. Remove a source line before adding another.");
    }

    const { data: variance, error: varianceError } = await supabase
      .from("variance_requests")
      .select("id, status, triggering_purchase_id, target_budget_plan_month_id, total_transfer_amount")
      .eq("id", varianceRequestId)
      .single();
    if (varianceError || !variance) return err("Variance request not found.");
    if (!["draft", "ready_for_review"].includes(String(variance.status ?? ""))) {
      return err("Source lines can only be edited while a variance is Draft or Ready for Review.");
    }

    let targetBudgetPlanMonthId = requestedToBudgetPlanMonthId || (variance.target_budget_plan_month_id as string | null) || null;
    if (!targetBudgetPlanMonthId) {
      const triggeringPurchaseId = (variance.triggering_purchase_id as string | null) ?? "";
      if (!triggeringPurchaseId) return err("This variance does not have a target bucket yet.");

      const { data: targetCommitment, error: targetError } = await supabase
        .from("institutional_budget_commitments")
        .select("budget_plan_month_id")
        .eq("purchase_id", triggeringPurchaseId)
        .neq("commitment_status", "cancelled")
        .order("committed_amount", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (targetError) return err(targetError.message);
      targetBudgetPlanMonthId = (targetCommitment?.budget_plan_month_id as string | null) ?? null;
      if (!targetBudgetPlanMonthId) return err("No institutional target bucket is linked to this variance.");
    }

    const { count: matchingTargetCount, error: matchingTargetError } = await supabase
      .from("variance_request_targets")
      .select("id", { count: "exact", head: true })
      .eq("variance_request_id", varianceRequestId)
      .eq("budget_plan_month_id", targetBudgetPlanMonthId);
    if (matchingTargetError) return err(matchingTargetError.message);
    if (requestedToBudgetPlanMonthId && (matchingTargetCount ?? 0) === 0) return err("That target bucket is not attached to this variance.");

    const { data: targetBucket, error: targetBucketError } = await supabase
      .from("v_institutional_monthly_budget_availability")
      .select("budget_plan_month_id, organization_id, account_code_id, month_start")
      .eq("budget_plan_month_id", targetBudgetPlanMonthId)
      .maybeSingle();
    if (targetBucketError) return err(targetBucketError.message);
    if (!targetBucket) return err("Target budget month not found.");

    const { data: sourceBucket, error: sourceError } = await supabase
      .from("v_institutional_monthly_budget_availability")
      .select("budget_plan_month_id, organization_id, account_code_id, month_start, official_available_amount")
      .eq("budget_plan_month_id", fromBudgetPlanMonthId)
      .maybeSingle();
    if (sourceError) return err(sourceError.message);
    if (!sourceBucket) return err("Source bucket not found.");

    const sourceOrgId = sourceBucket.organization_id as string;
    const targetOrgId = targetBucket.organization_id as string;
    if (sourceOrgId !== targetOrgId && !crossOrgOverride) {
      return err("Cross-org variance requires the manual override checkbox.");
    }

    const available = Number(sourceBucket.official_available_amount ?? 0);
    if (transferAmount > available && !crossOrgOverride) {
      return err("Transfer amount exceeds the selected source bucket's official available amount.");
    }

    const { count: duplicateCount, error: duplicateError } = await supabase
      .from("variance_request_lines")
      .select("id", { count: "exact", head: true })
      .eq("variance_request_id", varianceRequestId)
      .eq("from_budget_plan_month_id", fromBudgetPlanMonthId)
      .eq("to_budget_plan_month_id", targetBudgetPlanMonthId);
    if (duplicateError) return err(duplicateError.message);
    if ((duplicateCount ?? 0) > 0) return err("That source bucket is already attached to this variance.");

    const { error: insertError } = await supabase.from("variance_request_lines").insert({
      variance_request_id: varianceRequestId,
      from_budget_plan_month_id: fromBudgetPlanMonthId,
      to_budget_plan_month_id: targetBucket.budget_plan_month_id as string,
      from_organization_id: sourceOrgId,
      from_account_code_id: sourceBucket.account_code_id as string,
      from_month_start: sourceBucket.month_start as string,
      to_organization_id: targetOrgId,
      to_account_code_id: targetBucket.account_code_id as string,
      to_month_start: (targetBucket.month_start as string | null) ?? "",
      transfer_amount: transferAmount,
      narrative: narrative || null,
      cross_org_override: crossOrgOverride
    });
    if (insertError) return err(insertError.message);

    await updateVarianceSourceTotal(supabase, varianceRequestId);

    const { error: eventError } = await supabase.from("variance_events").insert({
      variance_request_id: varianceRequestId,
      from_status: variance.status as string,
      to_status: variance.status as string,
      changed_by_user_id: userId,
      note: "Source bucket line added"
    });
    if (eventError) return err(eventError.message);

    revalidatePath("/variance");
    return ok("Source bucket added.");
  } catch (error) {
    return err(getErrorMessage(error, "Could not add variance source."));
  }
}

export async function deleteVarianceSourceLineAction(
  prevState: ActionState = emptyState,
  formData: FormData
): Promise<ActionState> {
  void prevState;
  try {
    const { userId } = await requireVarianceAccess();
    const supabase = await getSupabaseServerClient();
    const varianceRequestId = String(formData.get("varianceRequestId") ?? "").trim();
    const lineId = String(formData.get("lineId") ?? "").trim();
    if (!varianceRequestId || !lineId) return err("Variance and source line are required.");

    const fundingState = await getVarianceFundingState(supabase, varianceRequestId);
    if (!["draft", "ready_for_review"].includes(fundingState.status)) {
      return err("Source lines can only be deleted while a variance is Draft or Ready for Review.");
    }

    const { error: deleteError } = await supabase
      .from("variance_request_lines")
      .delete()
      .eq("id", lineId)
      .eq("variance_request_id", varianceRequestId);
    if (deleteError) return err(deleteError.message);

    await updateVarianceSourceTotal(supabase, varianceRequestId);

    const { error: eventError } = await supabase.from("variance_events").insert({
      variance_request_id: varianceRequestId,
      from_status: fundingState.status,
      to_status: fundingState.status,
      changed_by_user_id: userId,
      note: "Source bucket line removed"
    });
    if (eventError) return err(eventError.message);

    revalidatePath("/variance");
    return ok("Source bucket removed.");
  } catch (error) {
    return err(getErrorMessage(error, "Could not remove variance source."));
  }
}

export async function deleteVarianceDraftAction(
  prevState: ActionState = emptyState,
  formData: FormData
): Promise<ActionState> {
  void prevState;
  try {
    await requireVarianceAccess();
    const supabase = await getSupabaseServerClient();
    const varianceRequestId = String(formData.get("varianceRequestId") ?? "").trim();
    if (!varianceRequestId) return err("Variance request is required.");

    const fundingState = await getVarianceFundingState(supabase, varianceRequestId);
    if (!["draft", "ready_for_review"].includes(fundingState.status)) {
      return err("Only Draft or Ready for Review variances can be deleted.");
    }

    const { error: deleteError } = await supabase.from("variance_requests").delete().eq("id", varianceRequestId);
    if (deleteError) return err(deleteError.message);

    revalidatePath("/variance");
    revalidatePath("/institutional-budget");
    return ok("Variance draft deleted.");
  } catch (error) {
    return err(getErrorMessage(error, "Could not delete variance draft."));
  }
}

export async function updateVarianceStatusAction(
  prevState: ActionState = emptyState,
  formData: FormData
): Promise<ActionState> {
  void prevState;
  try {
    const nextStatus = normalizeStatus(formData.get("status"));
    const { userId } = await requireVarianceAccess(nextStatus);
    const supabase = await getSupabaseServerClient();
    const varianceRequestId = String(formData.get("varianceRequestId") ?? "").trim();
    const note = String(formData.get("note") ?? "").trim();
    const allowOverSourced = formData.get("allowOverSourced") === "on";
    if (!varianceRequestId) return err("Variance request is required.");

    const fundingState = await getVarianceFundingState(supabase, varianceRequestId);
    if (nextStatus === "ready_for_review" && fundingState.totalSourced > fundingState.targetShortage && !allowOverSourced) {
      return err("Total sourced exceeds the target shortage. Check the override box to move this variance to Ready for Review.");
    }
    if (nextStatus === "ready_for_review" && fundingState.totalSourced <= 0) {
      return err("Add at least one source line before moving this variance to Ready for Review.");
    }

    const { data: existing, error: existingError } = await supabase
      .from("variance_requests")
      .select("id, status")
      .eq("id", varianceRequestId)
      .single();
    if (existingError || !existing) return err("Variance request not found.");
    const fromStatus = String(existing.status ?? "draft");
    if (fromStatus === nextStatus) return ok("Variance status is unchanged.");

    const timestampColumn =
      nextStatus === "submitted"
        ? "submitted_at"
        : nextStatus === "approved"
          ? "approved_at"
          : nextStatus === "posted"
            ? "posted_at"
            : nextStatus === "denied"
              ? "denied_at"
              : null;
    const updateValues: Record<string, string> = { status: nextStatus };
    if (timestampColumn) updateValues[timestampColumn] = new Date().toISOString();

    const { error: updateError } = await supabase.from("variance_requests").update(updateValues).eq("id", varianceRequestId);
    if (updateError) return err(updateError.message);

    const { error: eventError } = await supabase.from("variance_events").insert({
      variance_request_id: varianceRequestId,
      from_status: fromStatus,
      to_status: nextStatus,
      changed_by_user_id: userId,
      note: note || null
    });
    if (eventError) return err(eventError.message);

    revalidatePath("/variance");
    revalidatePath("/budget-planning");
    revalidatePath("/");
    return ok("Variance status updated.");
  } catch (error) {
    return err(getErrorMessage(error, "Could not update variance status."));
  }
}

export async function generateVarianceWorkbookAction(
  prevState: ActionState = emptyState,
  formData: FormData
): Promise<ActionState> {
  void prevState;
  try {
    await requireVarianceAccess();
    const supabase = await getSupabaseServerClient();
    const varianceRequestId = String(formData.get("varianceRequestId") ?? "").trim();
    if (!varianceRequestId) return err("Variance request is required.");

    const { count, error: countError } = await supabase
      .from("variance_request_lines")
      .select("id", { count: "exact", head: true })
      .eq("variance_request_id", varianceRequestId);
    if (countError) return err(countError.message);
    if ((count ?? 0) === 0) return err("Add at least one source line before generating the workbook.");

    const generatedFilePath = `variance/${varianceRequestId}.xlsx`;
    const generatedFileUrl = `/variance/${varianceRequestId}/workbook`;
    const { error: updateError } = await supabase
      .from("variance_requests")
      .update({
        generated_file_path: generatedFilePath,
        generated_file_url: generatedFileUrl
      })
      .eq("id", varianceRequestId);
    if (updateError) return err(updateError.message);

    revalidatePath("/variance");
    return ok("Variance workbook is ready.");
  } catch (error) {
    return err(getErrorMessage(error, "Could not generate variance workbook."));
  }
}

export type { ActionState };
