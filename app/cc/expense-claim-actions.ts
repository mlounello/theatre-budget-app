"use server";

import { revalidatePath } from "next/cache";
import { getAccessContext, requireProjectRole } from "@/lib/access";
import { createInstitutionalCommitmentForPurchase } from "@/lib/institutional-budget";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export type ExpenseClaimActionState = { ok: boolean; message: string; timestamp: number };

type ClaimType = "funding_request" | "monthly_reconciliation" | "reimbursement";
type ExpenseLineInput = {
  expenseNumber: string;
  title: string;
  amount: number;
  expenseDate: string | null;
  note: string | null;
};

const RECEIPT_STORAGE_BUCKET = "purchase-receipts";
const ALLOWED_RECEIPT_MIME_TYPES = new Set([
  "application/pdf", "image/png", "image/jpeg", "image/jpg", "image/webp", "image/heic", "image/heif"
]);
const MAX_RECEIPT_UPLOAD_BYTES = 10 * 1024 * 1024;
const emptyState: ExpenseClaimActionState = { ok: true, message: "", timestamp: 0 };

function ok(message: string): ExpenseClaimActionState {
  return { ok: true, message, timestamp: Date.now() };
}

function err(message: string): ExpenseClaimActionState {
  return { ok: false, message, timestamp: Date.now() };
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim() ? error.message : "Could not save the Expense Claim.";
}

function money(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
}

function claimType(value: FormDataEntryValue | null): ClaimType {
  const raw = String(value ?? "").trim();
  if (raw === "funding_request" || raw === "monthly_reconciliation" || raw === "reimbursement") return raw;
  throw new Error("Choose a valid Expense Claim type.");
}

function parseExpenseLines(value: FormDataEntryValue | null): ExpenseLineInput[] {
  if (typeof value !== "string") return [];
  const parsed = JSON.parse(value) as Array<Record<string, unknown>>;
  if (!Array.isArray(parsed)) return [];
  return parsed.map((row) => ({
    expenseNumber: String(row.expenseNumber ?? "").trim().toUpperCase(),
    title: String(row.title ?? "").trim(),
    amount: money(row.amount),
    expenseDate: /^\d{4}-\d{2}-\d{2}$/.test(String(row.expenseDate ?? "")) ? String(row.expenseDate) : null,
    note: String(row.note ?? "").trim() || null
  }));
}

async function uploadReceipt(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  file: FormDataEntryValue | null,
  scopeId: string,
  purchaseId: string
): Promise<string | null> {
  if (!(file instanceof File) || file.size === 0) return null;
  if (file.size > MAX_RECEIPT_UPLOAD_BYTES) throw new Error("Each receipt must be under 10 MB.");
  if (file.type && !ALLOWED_RECEIPT_MIME_TYPES.has(file.type.toLowerCase())) {
    throw new Error("Receipts must be PDF, PNG, JPG, WEBP, or HEIC files.");
  }
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${scopeId}/expense-claims/${purchaseId}/${Date.now()}-${safeName}`;
  const { error } = await supabase.storage.from(RECEIPT_STORAGE_BUCKET).upload(path, file, { upsert: false });
  if (error) throw new Error(`Receipt upload failed: ${error.message}`);
  return `storage:${RECEIPT_STORAGE_BUCKET}/${path}`;
}

export async function createExpenseClaimAction(
  previousState: ExpenseClaimActionState = emptyState,
  formData: FormData
): Promise<ExpenseClaimActionState> {
  void previousState;
  try {
    const supabase = await getSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return err("You must be signed in.");
    const access = await getAccessContext();
    if (access.role !== "admin" && access.role !== "project_manager") {
      return err("Only an Admin or Project Manager can create Expense Claims.");
    }

    const type = claimType(formData.get("claimType"));
    const fiscalYearId = String(formData.get("fiscalYearId") ?? "").trim();
    const projectId = String(formData.get("projectId") ?? "").trim();
    const selectedOrganizationId = String(formData.get("organizationId") ?? "").trim();
    const creditCardId = String(formData.get("creditCardId") ?? "").trim();
    const claimNumber = String(formData.get("claimNumber") ?? "").trim().toUpperCase();
    const claimMonthRaw = String(formData.get("claimMonth") ?? "").trim();
    const authorizationClaimId = String(formData.get("authorizationClaimId") ?? "").trim();
    const productionCategoryId = String(formData.get("productionCategoryId") ?? "").trim();
    const bannerAccountCodeId = String(formData.get("bannerAccountCodeId") ?? "").trim();
    const overageExplanation = String(formData.get("overageExplanation") ?? "").trim();
    const notes = String(formData.get("notes") ?? "").trim();
    const lines = parseExpenseLines(formData.get("linesJson"));

    if (!fiscalYearId || !/^EC\d{6}$/.test(claimNumber)) {
      return err("Fiscal year and an Expense Claim number in EC###### format are required.");
    }
    if ((!projectId && !selectedOrganizationId) || (projectId && selectedOrganizationId)) {
      return err("Choose exactly one theatre project or organization budget.");
    }
    if (lines.length === 0 || lines.some((line) => !/^EX\d{6}$/.test(line.expenseNumber) || !line.title || line.amount <= 0)) {
      return err("Every Expense needs an EX###### number, title, and positive amount.");
    }
    if (type !== "funding_request" && lines.some((_, index) => {
      const receipt = formData.get(`receiptFile_${index}`);
      return !(receipt instanceof File) || receipt.size === 0;
    })) {
      return err("Upload a receipt for every reconciled or reimbursed Expense.");
    }
    if (type !== "reimbursement" && !creditCardId) return err("Choose the physical card for this card claim.");
    if (type === "monthly_reconciliation" && !authorizationClaimId) {
      return err("Link the monthly reconciliation to its original funding request.");
    }
    if (projectId && !productionCategoryId) return err("Choose a department for a theatre project claim.");
    if (!bannerAccountCodeId) return err("Choose a Banner account code.");

    let organizationId = selectedOrganizationId;
    let budgetLineId: string | null = null;
    if (projectId) {
      await requireProjectRole(projectId, ["admin", "project_manager"], {
        productionCategoryId,
        errorMessage: "You do not have permission to create an Expense Claim for this project."
      });
      const { data: project, error } = await supabase
        .from("projects").select("organization_id, fiscal_year_id").eq("id", projectId).single();
      if (error || !project) return err("Project not found.");
      if (project.fiscal_year_id !== fiscalYearId) return err("The project is not in the selected fiscal year.");
      organizationId = String(project.organization_id ?? "");
      const { data: resolvedLine, error: lineError } = await supabase.rpc("ensure_project_category_line", {
        p_project_id: projectId,
        p_production_category_id: productionCategoryId
      });
      if (lineError || !resolvedLine) return err(lineError?.message ?? "Could not resolve the project budget line.");
      budgetLineId = resolvedLine as string;
    } else {
      const { data: membership, error } = await supabase.from("fiscal_year_organizations")
        .select("id, project_tracking_required").eq("fiscal_year_id", fiscalYearId)
        .eq("organization_id", organizationId).eq("active", true).maybeSingle();
      if (error || !membership?.id) return err("That organization is not active in the selected fiscal year.");
      if (membership.project_tracking_required) return err("That organization requires a theatre project.");
    }

    let authorization: {
      id: string;
      fiscal_year_id: string;
      project_id: string | null;
      organization_id: string;
      credit_card_id: string | null;
      authorized_amount: number | string | null;
    } | null = null;
    let authorizationPurchaseId: string | null = null;
    if (type === "monthly_reconciliation") {
      const { data, error } = await supabase.from("expense_claims")
        .select("id, fiscal_year_id, project_id, organization_id, credit_card_id, authorized_amount")
        .eq("id", authorizationClaimId).eq("claim_type", "funding_request").single();
      if (error || !data) return err("The original funding request could not be found.");
      authorization = data;
      if (data.fiscal_year_id !== fiscalYearId || (data.project_id ?? "") !== (projectId || "") ||
          data.organization_id !== organizationId || data.credit_card_id !== creditCardId) {
        return err("The reconciliation must use the same fiscal year, budget, and card as its funding request.");
      }
      const { data: authorizationPurchase } = await supabase.from("purchases").select("id")
        .eq("expense_claim_id", authorizationClaimId).eq("expense_stage", "authorization").limit(1).maybeSingle();
      authorizationPurchaseId = (authorizationPurchase?.id as string | undefined) ?? null;
    }

    const total = Math.round(lines.reduce((sum, line) => sum + line.amount, 0) * 100) / 100;
    const authorizedAmount = type === "funding_request" ? total : authorization ? money(authorization.authorized_amount) : null;
    if (authorizedAmount !== null && total > authorizedAmount && !overageExplanation) {
      return err("This claim exceeds the authorized amount. Add an overage explanation before saving.");
    }

    const { data: claim, error: claimError } = await supabase.from("expense_claims").insert({
      fiscal_year_id: fiscalYearId,
      project_id: projectId || null,
      organization_id: organizationId,
      credit_card_id: creditCardId || null,
      claim_number: claimNumber,
      claim_type: type,
      claim_month: /^\d{4}-\d{2}$/.test(claimMonthRaw) ? `${claimMonthRaw}-01` : null,
      status: type === "funding_request" ? "submitted" : "reconciled",
      authorized_amount: authorizedAmount,
      settled_amount: type === "funding_request" ? null : total,
      authorization_claim_id: authorizationClaimId || null,
      overage_explanation: overageExplanation || null,
      notes: notes || null,
      entered_by_user_id: user.id
    }).select("id").single();
    if (claimError || !claim) return err(claimError?.message ?? "Could not create the Expense Claim.");

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const stage = type === "funding_request" ? "authorization" : type === "reimbursement" ? "reimbursement" : "actual";
      const status = type === "monthly_reconciliation" ? "pending_cc" : "requested";
      const { data: purchase, error: purchaseError } = await supabase.from("purchases").insert({
        fiscal_year_id: fiscalYearId,
        project_id: projectId || null,
        organization_id: organizationId,
        budget_line_id: budgetLineId,
        production_category_id: productionCategoryId || null,
        banner_account_code_id: bannerAccountCodeId,
        budget_tracked: true,
        entered_by_user_id: user.id,
        title: line.title,
        reference_number: claimNumber,
        estimated_amount: line.amount,
        requested_amount: status === "requested" ? line.amount : 0,
        encumbered_amount: 0,
        pending_cc_amount: status === "pending_cc" ? line.amount : 0,
        posted_amount: 0,
        status,
        request_type: "expense",
        is_credit_card: type !== "reimbursement",
        credit_card_id: creditCardId || null,
        cc_workflow_status: type === "monthly_reconciliation" ? "receipts_uploaded" : type === "funding_request" ? "requested" : null,
        procurement_status: type === "monthly_reconciliation" ? "receipts_uploaded" : "requested",
        purchase_date: line.expenseDate,
        ordered_on: line.expenseDate,
        notes: line.note,
        expense_claim_id: claim.id,
        expense_number: line.expenseNumber,
        expense_stage: stage,
        authorization_purchase_id: authorizationPurchaseId,
        authorized_amount: authorizedAmount,
        overage_explanation: overageExplanation || null
      }).select("id").single();
      if (purchaseError || !purchase) throw new Error(purchaseError?.message ?? "Could not create an Expense line.");

      if (budgetLineId) {
        const { error: allocationError } = await supabase.from("purchase_allocations").insert({
          purchase_id: purchase.id,
          reporting_budget_line_id: budgetLineId,
          account_code_id: bannerAccountCodeId,
          production_category_id: productionCategoryId,
          amount: line.amount,
          reporting_bucket: "direct",
          note: `${claimNumber} / ${line.expenseNumber}`
        });
        if (allocationError) throw new Error(allocationError.message);
      }

      if (type !== "funding_request") {
        const attachmentUrl = await uploadReceipt(
          supabase, formData.get(`receiptFile_${index}`), projectId || organizationId, purchase.id as string
        );
        const { error: receiptError } = await supabase.from("purchase_receipts").insert({
          purchase_id: purchase.id,
          note: line.note,
          amount_received: line.amount,
          attachment_url: attachmentUrl,
          fully_received: false,
          created_by_user_id: user.id
        });
        if (receiptError) throw new Error(receiptError.message);
      }
      await createInstitutionalCommitmentForPurchase(supabase, purchase.id as string, user.id);
    }

    if (type === "monthly_reconciliation" && authorization && authorizationPurchaseId) {
      const { data: priorClaims, error: priorError } = await supabase.from("expense_claims")
        .select("settled_amount").eq("authorization_claim_id", authorization.id).neq("status", "cancelled");
      if (priorError) throw new Error(priorError.message);
      const settled = Math.round((priorClaims ?? []).reduce((sum, row) => sum + money(row.settled_amount), 0) * 100) / 100;
      const remainingHold = Math.max(money(authorization.authorized_amount) - settled, 0);
      const { error: claimUpdateError } = await supabase.from("expense_claims").update({
        settled_amount: settled,
        status: remainingHold === 0 ? "reconciled" : "approved",
        updated_at: new Date().toISOString()
      }).eq("id", authorization.id);
      if (claimUpdateError) throw new Error(claimUpdateError.message);
      const { error: updateError } = await supabase.from("purchases").update({
        requested_amount: remainingHold,
        estimated_amount: money(authorization.authorized_amount),
        notes: `Original authorization preserved; ${settled.toFixed(2)} reconciled, ${remainingHold.toFixed(2)} remaining hold.`
      }).eq("id", authorizationPurchaseId);
      if (updateError) throw new Error(updateError.message);
      await createInstitutionalCommitmentForPurchase(supabase, authorizationPurchaseId, user.id);
    }

    revalidatePath("/cc");
    revalidatePath("/procurement");
    revalidatePath("/");
    if (projectId) revalidatePath(`/projects/${projectId}`);
    return ok(`${claimNumber} saved with ${lines.length} Expense${lines.length === 1 ? "" : "s"}.`);
  } catch (error) {
    return err(errorMessage(error));
  }
}
