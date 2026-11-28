"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { createInstitutionalCommitmentForPurchase } from "@/lib/institutional-budget";
import type { PurchaseStatus } from "@/lib/types";
import { type ActionState, emptyState, ok, err, getErrorMessage, parseMoney } from "@/lib/action-helpers";
import { type InstallmentStatus, ensurePmOrAdmin, installmentScheduleValues, installmentCheckRequestValues, contractPaymentOrderDate } from "@/app/contracts/actions/_shared";

function parseInstallmentStatus(value: FormDataEntryValue | null): InstallmentStatus {
  const raw = String(value ?? "planned").trim().toLowerCase();
  if (raw === "check_request_submitted" || raw === "check_paid" || raw === "cancelled") return raw;
  return "planned";
}

export async function updateContractInstallmentStatusAction(
  prevState: ActionState = emptyState,
  formData: FormData
): Promise<ActionState> {
  void prevState;
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) return err("You must be signed in.");

    const installmentId = String(formData.get("installmentId") ?? "").trim();
    const nextStatus = parseInstallmentStatus(formData.get("status"));
    if (!installmentId) return err("Installment id is required.");

    const { data: installment, error: installmentError } = await supabase
      .from("contract_installments")
      .select("id, contract_id, purchase_id, installment_amount, status, contracts!inner(project_id)")
      .eq("id", installmentId)
      .single();
    if (installmentError || !installment) return err("Installment not found.");
    const contractJoin = installment.contracts as { project_id?: string } | Array<{ project_id?: string }> | null;
    const contractRow = Array.isArray(contractJoin) ? contractJoin[0] : contractJoin;
    const projectId = contractRow?.project_id;
    if (!projectId) return err("Project could not be resolved.");

    await ensurePmOrAdmin(projectId, user.id);

    const amount = parseMoney(String(installment.installment_amount ?? "0"));
    if (amount === 0) return err("Installment amount must be non-zero.");

    let purchaseStatus: PurchaseStatus = "requested";
    let requestedAmount = 0;
    let encumberedAmount = 0;
    let postedAmount = 0;
    let procurementStatus = "requested";
    let postedDate: string | null = null;

    if (nextStatus === "cancelled") {
      purchaseStatus = "cancelled";
      procurementStatus = "cancelled";
    } else if (nextStatus === "check_request_submitted") {
      purchaseStatus = "encumbered";
      encumberedAmount = amount;
      procurementStatus = "ordered";
    } else if (nextStatus === "check_paid") {
      purchaseStatus = "posted";
      postedAmount = amount;
      procurementStatus = "paid";
      postedDate = new Date().toISOString().slice(0, 10);
    } else {
      requestedAmount = amount;
    }

    if (installment.purchase_id) {
      const { data: purchaseUpdated, error: purchaseUpdateError } = await supabase
        .from("purchases")
        .update({
          status: purchaseStatus,
          requested_amount: requestedAmount,
          encumbered_amount: encumberedAmount,
          pending_cc_amount: 0,
          posted_amount: postedAmount,
          posted_date: postedDate,
          procurement_status: procurementStatus
        })
        .eq("id", installment.purchase_id as string)
        .select("id")
        .maybeSingle();
      if (purchaseUpdateError) return err(purchaseUpdateError.message);
      if (!purchaseUpdated?.id) return err("Installment purchase status update was not applied.");

      const { error: eventError } = await supabase.from("purchase_events").insert({
        purchase_id: installment.purchase_id as string,
        from_status: (purchaseStatus === "encumbered" ? "requested" : purchaseStatus === "posted" ? "encumbered" : "requested") as PurchaseStatus,
        to_status: purchaseStatus,
        estimated_amount_snapshot: amount,
        requested_amount_snapshot: requestedAmount,
        encumbered_amount_snapshot: encumberedAmount,
        pending_cc_amount_snapshot: 0,
        posted_amount_snapshot: postedAmount,
        changed_by_user_id: user.id,
        note: `Contract installment marked ${nextStatus}`
      });
      if (eventError) return err(eventError.message);

      await createInstitutionalCommitmentForPurchase(supabase, installment.purchase_id as string, user.id);
    }

    const today = new Date().toISOString().slice(0, 10);
    const { data: installmentUpdated, error: installmentUpdateError } = await supabase
      .from("contract_installments")
      .update({
        status: nextStatus,
        check_request_submitted_on: nextStatus === "check_request_submitted" || nextStatus === "check_paid" ? today : null,
        check_paid_on: nextStatus === "check_paid" ? today : null,
        ...(nextStatus === "cancelled"
          ? { automation_status: "not_ready", automation_ready_at: null, automation_ready_by_user_id: null }
          : {})
      })
      .eq("id", installmentId)
      .select("id")
      .maybeSingle();
    if (installmentUpdateError) return err(installmentUpdateError.message);
    if (!installmentUpdated?.id) return err("Installment status update was not applied.");

    revalidatePath("/contracts");
    revalidatePath("/");
    revalidatePath("/overview");
    revalidatePath(`/projects/${projectId}`);
    return ok("Installment status updated.");
  } catch (error) {
    return err(getErrorMessage(error, "Could not update installment status."));
  }
}

export async function updateCheckRequestAutomationAction(
  prevState: ActionState = emptyState,
  formData: FormData
): Promise<ActionState> {
  void prevState;
  try {
    const supabase = await getSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return err("You must be signed in.");
    const kind = String(formData.get("kind") ?? "");
    const itemId = String(formData.get("itemId") ?? "").trim();
    const ready = String(formData.get("ready") ?? "false") === "true";
    if (!itemId || !["installment", "union"].includes(kind)) return err("Payment item is required.");

    const table = kind === "installment" ? "contract_installments" : "contract_union_contributions";
    const { data: item, error: itemError } = await supabase
      .from(table)
      .select("id, status, mail_by, contracts!inner(id, project_id, workflow_status, union_signature_status, engagement_type, contractor_employee_id, w9_attachment_path)")
      .eq("id", itemId)
      .single();
    if (itemError || !item) return err("Payment item was not found.");
    const join = item.contracts as Record<string, unknown> | Array<Record<string, unknown>> | null;
    const contract = Array.isArray(join) ? join[0] : join;
    const projectId = String(contract?.project_id ?? "");
    if (!projectId) return err("Project could not be resolved.");
    await ensurePmOrAdmin(projectId, user.id);

    if (ready) {
      if (item.status !== "planned") return err("Only an unsubmitted check request can be marked READY.");
      const engagement = String(contract?.engagement_type ?? "independent_contractor");
      if (!["independent_contractor", "union_freelance_artist"].includes(engagement)) {
        return err("Employees are paid through payroll and cannot be sent to Accounts Payable.");
      }
      if (contract?.workflow_status !== "siena_signed") return err("The agreement must be fully executed before this can be READY.");
      if (engagement === "union_freelance_artist" && contract?.union_signature_status !== "complete") {
        return err("The union agreement must be complete before this can be READY.");
      }
      if (!String(item.mail_by ?? "").trim()) return err("Add a check-request send date before marking this READY.");
      if (!String(contract?.contractor_employee_id ?? "").trim() && !String(contract?.w9_attachment_path ?? "").trim()) {
        return err("Upload the artist's W-9 because no Banner / Vendor ID is assigned.");
      }
    }

    const { error: updateError } = await supabase.from(table).update({
      automation_status: ready ? "ready" : "not_ready",
      automation_ready_at: ready ? new Date().toISOString() : null,
      automation_ready_by_user_id: ready ? user.id : null,
      automation_last_error: null
    }).eq("id", itemId);
    if (updateError) return err(updateError.message);
    revalidatePath("/contracts");
    return ok(ready ? "Check request is READY and will send on its scheduled date." : "Automatic sending removed.");
  } catch (error) {
    return err(getErrorMessage(error, "Could not update automatic sending."));
  }
}

export async function updateUnionSignatureStatusAction(
  prevState: ActionState = emptyState,
  formData: FormData
): Promise<ActionState> {
  void prevState;
  try {
    const supabase = await getSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return err("You must be signed in.");
    const contractId = String(formData.get("contractId") ?? "").trim();
    const raw = String(formData.get("unionSignatureStatus") ?? "not_started");
    const status = ["not_started", "sent_to_union", "union_countersigned", "complete"].includes(raw)
      ? raw
      : "not_started";
    const { data: contract, error } = await supabase
      .from("contracts")
      .select("id, project_id, is_union")
      .eq("id", contractId)
      .single();
    if (error || !contract?.is_union) return err("Union contract not found.");
    await ensurePmOrAdmin(contract.project_id as string, user.id);
    const { error: updateError } = await supabase
      .from("contracts")
      .update({ union_signature_status: status })
      .eq("id", contractId);
    if (updateError) return err(updateError.message);
    if (status !== "complete") {
      await Promise.all([
        supabase.from("contract_installments").update({ automation_status: "not_ready", automation_ready_at: null, automation_ready_by_user_id: null }).eq("contract_id", contractId).eq("automation_status", "ready"),
        supabase.from("contract_union_contributions").update({ automation_status: "not_ready", automation_ready_at: null, automation_ready_by_user_id: null }).eq("contract_id", contractId).eq("automation_status", "ready")
      ]);
    }
    revalidatePath("/contracts");
    return ok("Union signature status updated.");
  } catch (error) {
    return err(getErrorMessage(error, "Could not update union signature status."));
  }
}

export async function updateUnionContributionStatusAction(
  prevState: ActionState = emptyState,
  formData: FormData
): Promise<ActionState> {
  void prevState;
  try {
    const supabase = await getSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return err("You must be signed in.");
    const contributionId = String(formData.get("contributionId") ?? "").trim();
    const nextStatus = parseInstallmentStatus(formData.get("status"));
    const { data: contribution, error } = await supabase
      .from("contract_union_contributions")
      .select("id, purchase_id, amount, contracts!inner(project_id)")
      .eq("id", contributionId)
      .single();
    if (error || !contribution) return err("Union contribution not found.");
    const contractJoin = contribution.contracts as { project_id?: string } | Array<{ project_id?: string }> | null;
    const projectId = (Array.isArray(contractJoin) ? contractJoin[0] : contractJoin)?.project_id;
    if (!projectId) return err("Project could not be resolved.");
    await ensurePmOrAdmin(projectId, user.id);

    const amount = Number(contribution.amount ?? 0);
    const purchaseStatus: PurchaseStatus =
      nextStatus === "cancelled"
        ? "cancelled"
        : nextStatus === "check_paid"
          ? "posted"
          : nextStatus === "check_request_submitted"
            ? "encumbered"
            : "requested";
    if (contribution.purchase_id) {
      const { error: purchaseError } = await supabase
        .from("purchases")
        .update({
          status: purchaseStatus,
          requested_amount: purchaseStatus === "requested" ? amount : 0,
          encumbered_amount: purchaseStatus === "encumbered" ? amount : 0,
          posted_amount: purchaseStatus === "posted" ? amount : 0,
          pending_cc_amount: 0,
          procurement_status: purchaseStatus === "cancelled" ? "cancelled" : purchaseStatus === "posted" ? "paid" : purchaseStatus === "encumbered" ? "ordered" : "requested",
          posted_date: purchaseStatus === "posted" ? new Date().toISOString().slice(0, 10) : null
        })
        .eq("id", contribution.purchase_id as string);
      if (purchaseError) return err(purchaseError.message);
      await createInstitutionalCommitmentForPurchase(supabase, contribution.purchase_id as string, user.id);
    }
    const today = new Date().toISOString().slice(0, 10);
    const { error: updateError } = await supabase
      .from("contract_union_contributions")
      .update({
        status: nextStatus,
        check_request_submitted_on: nextStatus === "check_request_submitted" || nextStatus === "check_paid" ? today : null,
        check_paid_on: nextStatus === "check_paid" ? today : null,
        ...(nextStatus === "cancelled"
          ? { automation_status: "not_ready", automation_ready_at: null, automation_ready_by_user_id: null }
          : {})
      })
      .eq("id", contributionId);
    if (updateError) return err(updateError.message);
    revalidatePath("/contracts");
    revalidatePath("/");
    revalidatePath("/overview");
    revalidatePath(`/projects/${projectId}`);
    return ok("Union fund status updated.");
  } catch (error) {
    return err(getErrorMessage(error, "Could not update union fund status."));
  }
}

export async function updateContractInstallmentCheckRequestAction(
  prevState: ActionState = emptyState,
  formData: FormData
): Promise<ActionState> {
  void prevState;
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) return err("You must be signed in.");

    const installmentId = String(formData.get("installmentId") ?? "").trim();
    const installmentNumber = Number.parseInt(String(formData.get("installmentNumber") ?? "1"), 10);
    if (!installmentId) return err("Installment id is required.");

    const { data: installment, error: installmentError } = await supabase
      .from("contract_installments")
      .select("id, contract_id, purchase_id, status, tax_id_encrypted, tax_id_last4, contracts!inner(project_id)")
      .eq("id", installmentId)
      .single();
    if (installmentError || !installment) return err("Installment not found.");

    const contractJoin = installment.contracts as { project_id?: string } | Array<{ project_id?: string }> | null;
    const contractRow = Array.isArray(contractJoin) ? contractJoin[0] : contractJoin;
    const projectId = contractRow?.project_id;
    if (!projectId) return err("Project could not be resolved.");

    await ensurePmOrAdmin(projectId, user.id);

    const updateValues = {
      ...installmentScheduleValues(formData, Number.isFinite(installmentNumber) ? installmentNumber : 1),
      ...installmentCheckRequestValues(formData, {
        encrypted: (installment.tax_id_encrypted as string | null) ?? null,
        last4: (installment.tax_id_last4 as string | null) ?? null
      }),
      ...(((installment.status as string | null) ?? "planned") === "planned"
        ? {
            automation_status: "not_ready",
            automation_ready_at: null,
            automation_ready_by_user_id: null,
            automation_last_error: null
          }
        : {})
    };

    const { data: updated, error: updateError } = await supabase
      .from("contract_installments")
      .update(updateValues)
      .eq("id", installmentId)
      .select("id")
      .maybeSingle();
    if (updateError) return err(updateError.message);
    if (!updated?.id) return err("Installment check request update was not applied.");

    const purchaseId = (installment.purchase_id as string | null) ?? null;
    if (purchaseId) {
      const { error: purchaseUpdateError } = await supabase
        .from("purchases")
        .update({ ordered_on: contractPaymentOrderDate(updateValues) })
        .eq("id", purchaseId);
      if (purchaseUpdateError) return err(purchaseUpdateError.message);
      await createInstitutionalCommitmentForPurchase(supabase, purchaseId, user.id);
    }

    revalidatePath("/contracts");
    revalidatePath("/institutional-budget");
    revalidatePath("/procurement");
    revalidatePath("/variance");
    return ok("Installment check request fields updated.");
  } catch (error) {
    return err(getErrorMessage(error, "Could not update installment check request fields."));
  }
}
