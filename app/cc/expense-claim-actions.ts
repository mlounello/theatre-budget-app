"use server";

import { revalidatePath } from "next/cache";
import { getAccessContext, requireProjectRole } from "@/lib/access";
import { createInstitutionalCommitmentForPurchase } from "@/lib/institutional-budget";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { expenseClaimInputSchema } from "@/lib/validation/financial";

export type ExpenseClaimActionState = { ok: boolean; message: string; timestamp: number };

type ClaimType = "funding_request" | "monthly_reconciliation" | "reimbursement";
type ExpenseLineInput = {
  expenseNumber: string;
  title: string;
  amount: number;
  expenseDate: string | null;
  note: string | null;
  projectId: string | null;
  organizationId: string | null;
  productionCategoryId: string | null;
  bannerAccountCodeId: string;
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
    note: String(row.note ?? "").trim() || null,
    projectId: String(row.projectId ?? "").trim() || null,
    organizationId: String(row.organizationId ?? "").trim() || null,
    productionCategoryId: String(row.productionCategoryId ?? "").trim() || null,
    bannerAccountCodeId: String(row.bannerAccountCodeId ?? "").trim()
  }));
}

async function uploadReceipt(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  file: FormDataEntryValue | null,
  scopeId: string,
  purchaseId: string
): Promise<{ url: string; path: string } | null> {
  if (!(file instanceof File) || file.size === 0) return null;
  if (file.size > MAX_RECEIPT_UPLOAD_BYTES) throw new Error("Each receipt must be under 10 MB.");
  if (file.type && !ALLOWED_RECEIPT_MIME_TYPES.has(file.type.toLowerCase())) {
    throw new Error("Receipts must be PDF, PNG, JPG, WEBP, or HEIC files.");
  }
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${scopeId}/expense-claims/${purchaseId}/${Date.now()}-${safeName}`;
  const { error } = await supabase.storage.from(RECEIPT_STORAGE_BUCKET).upload(path, file, { upsert: false });
  if (error) throw new Error(`Receipt upload failed: ${error.message}`);
  return { url: `storage:${RECEIPT_STORAGE_BUCKET}/${path}`, path };
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

    const parsedInput = expenseClaimInputSchema.safeParse({
      claimType: claimType(formData.get("claimType")),
      fiscalYearId: String(formData.get("fiscalYearId") ?? "").trim(),
      creditCardId: String(formData.get("creditCardId") ?? "").trim(),
      claimNumber: String(formData.get("claimNumber") ?? "").trim().toUpperCase(),
      claimMonth: String(formData.get("claimMonth") ?? "").trim(),
      authorizationClaimId: String(formData.get("authorizationClaimId") ?? "").trim(),
      overageExplanation: String(formData.get("overageExplanation") ?? "").trim(),
      notes: String(formData.get("notes") ?? "").trim(),
      lines: parseExpenseLines(formData.get("linesJson"))
    });
    if (!parsedInput.success) return err(parsedInput.error.issues[0]?.message ?? "Review the Expense Claim fields.");
    const {
      claimType: type,
      fiscalYearId,
      creditCardId,
      claimNumber,
      claimMonth: claimMonthRaw,
      authorizationClaimId,
      overageExplanation,
      notes,
      lines
    } = parsedInput.data;
    if (type !== "funding_request" && lines.some((_, index) => {
      const receipt = formData.get(`receiptFile_${index}`);
      return !(receipt instanceof File) || receipt.size === 0;
    })) {
      return err("Upload a receipt for every reconciled or reimbursed Expense.");
    }
    const resolvedLines: Array<ExpenseLineInput & { organizationId: string; budgetLineId: string | null }> = [];
    for (const line of lines) {
      if (line.projectId) {
        await requireProjectRole(line.projectId, ["admin", "project_manager"], {
          productionCategoryId: line.productionCategoryId,
          errorMessage: `You do not have permission to charge ${line.expenseNumber} to that project or category.`
        });
        const { data: project, error } = await supabase
          .from("projects").select("organization_id, fiscal_year_id").eq("id", line.projectId).single();
        if (error || !project?.organization_id) return err(`The project for ${line.expenseNumber} could not be found.`);
        if (project.fiscal_year_id !== fiscalYearId) return err(`${line.expenseNumber} uses a project outside the selected fiscal year.`);
        const { data: resolvedLine, error: lineError } = await supabase.rpc("ensure_project_category_line", {
          p_project_id: line.projectId,
          p_production_category_id: line.productionCategoryId
        });
        if (lineError || !resolvedLine) return err(lineError?.message ?? `Could not resolve the project budget line for ${line.expenseNumber}.`);
        resolvedLines.push({ ...line, organizationId: String(project.organization_id), budgetLineId: resolvedLine as string });
      } else {
        const organizationId = line.organizationId as string;
        const { data: membership, error } = await supabase.from("fiscal_year_organizations")
          .select("id, project_tracking_required").eq("fiscal_year_id", fiscalYearId)
          .eq("organization_id", organizationId).eq("active", true).maybeSingle();
        if (error || !membership?.id) return err(`The organization for ${line.expenseNumber} is not active in the selected fiscal year.`);
        if (membership.project_tracking_required) return err(`${line.expenseNumber} must be charged through a theatre project.`);
        resolvedLines.push({ ...line, organizationId, budgetLineId: null });
      }
    }

    let authorization: {
      id: string;
      fiscal_year_id: string;
      project_id: string | null;
      organization_id: string | null;
      credit_card_id: string | null;
      authorized_amount: number | string | null;
    } | null = null;
    let authorizationPurchaseIds: string[] = [];
    if (type === "monthly_reconciliation") {
      const requiredAuthorizationClaimId = authorizationClaimId as string;
      const { data, error } = await supabase.from("expense_claims")
        .select("id, fiscal_year_id, project_id, organization_id, credit_card_id, authorized_amount")
        .eq("id", requiredAuthorizationClaimId).eq("claim_type", "funding_request").single();
      if (error || !data) return err("The original funding request could not be found.");
      authorization = data;
      if (data.fiscal_year_id !== fiscalYearId || data.credit_card_id !== creditCardId) {
        return err("The reconciliation must use the same fiscal year and card as its funding request.");
      }
      const { data: authorizationPurchases } = await supabase.from("purchases").select("id")
        .eq("expense_claim_id", requiredAuthorizationClaimId).eq("expense_stage", "authorization");
      authorizationPurchaseIds = (authorizationPurchases ?? []).map((purchase) => purchase.id as string);
    }

    const total = Math.round(lines.reduce((sum, line) => sum + line.amount, 0) * 100) / 100;
    const authorizedAmount = type === "funding_request" ? total : authorization ? money(authorization.authorized_amount) : null;
    if (authorizedAmount !== null && total > authorizedAmount && !overageExplanation) {
      return err("This claim exceeds the authorized amount. Add an overage explanation before saving.");
    }

    const uploadedPaths: string[] = [];
    const expensePayload: Array<Record<string, unknown>> = [];
    try {
      for (let index = 0; index < resolvedLines.length; index += 1) {
        const line = resolvedLines[index];
        const purchaseId = crypto.randomUUID();
        const upload = type === "funding_request"
          ? null
          : await uploadReceipt(supabase, formData.get(`receiptFile_${index}`), line.projectId || line.organizationId, purchaseId);
        if (upload) uploadedPaths.push(upload.path);
        const status = type === "monthly_reconciliation" ? "pending_cc" : "requested";
        expensePayload.push({
          id: purchaseId,
          expense_number: line.expenseNumber,
          title: line.title,
          amount: line.amount,
          expense_date: line.expenseDate,
          note: line.note,
          requested_amount: status === "requested" ? line.amount : 0,
          pending_cc_amount: status === "pending_cc" ? line.amount : 0,
          status,
          cc_workflow_status: type === "monthly_reconciliation" ? "receipts_uploaded" : type === "funding_request" ? "requested" : null,
          procurement_status: type === "monthly_reconciliation" ? "receipts_uploaded" : "requested",
          expense_stage: type === "funding_request" ? "authorization" : type === "reimbursement" ? "reimbursement" : "actual",
          attachment_url: upload?.url ?? null,
          project_id: line.projectId,
          organization_id: line.organizationId,
          budget_line_id: line.budgetLineId,
          production_category_id: line.productionCategoryId,
          banner_account_code_id: line.bannerAccountCodeId
        });
      }

      const { data: transactionResult, error: transactionError } = await supabase.rpc("create_expense_claim_transaction", {
        p_claim: {
          id: crypto.randomUUID(),
          fiscal_year_id: fiscalYearId,
          project_id: null,
          organization_id: null,
          credit_card_id: creditCardId,
          claim_number: claimNumber,
          claim_type: type,
          claim_month: claimMonthRaw ? `${claimMonthRaw}-01` : null,
          status: type === "funding_request" ? "submitted" : "reconciled",
          authorized_amount: authorizedAmount,
          settled_amount: type === "funding_request" ? null : total,
          authorization_claim_id: authorizationClaimId,
          authorization_purchase_id: null,
          overage_explanation: overageExplanation,
          notes,
          entered_by_user_id: user.id,
          budget_line_id: null,
          production_category_id: null,
          banner_account_code_id: null
        },
        p_expenses: expensePayload
      });
      if (transactionError) throw new Error(transactionError.message);

      const result = transactionResult as { purchase_ids?: string[] } | null;
      const purchaseIds = result?.purchase_ids ?? expensePayload.map((expense) => String(expense.id));
      let commitmentWarning = false;
      for (const purchaseId of purchaseIds) {
        try {
          await createInstitutionalCommitmentForPurchase(supabase, purchaseId, user.id);
        } catch (syncError) {
          commitmentWarning = true;
          console.error("Expense Claim commitment sync failed", { claimNumber, purchaseId, syncError });
        }
      }
      if (type === "monthly_reconciliation") {
        for (const authorizationPurchaseId of authorizationPurchaseIds) {
          try {
            await createInstitutionalCommitmentForPurchase(supabase, authorizationPurchaseId, user.id);
          } catch (syncError) {
            commitmentWarning = true;
            console.error("Expense Claim authorization commitment sync failed", { claimNumber, authorizationPurchaseId, syncError });
          }
        }
      }

      revalidatePath("/cc");
      revalidatePath("/procurement");
      revalidatePath("/");
      for (const projectId of new Set(resolvedLines.map((line) => line.projectId).filter(Boolean))) {
        revalidatePath(`/projects/${projectId}`);
      }
      return ok(
        `${claimNumber} saved with ${lines.length} Expense${lines.length === 1 ? "" : "s"}.` +
          (commitmentWarning ? " The claim is saved, but a budget-sync item needs administrator review." : "")
      );
    } catch (transactionError) {
      if (uploadedPaths.length > 0) {
        const { error: cleanupError } = await supabase.storage.from(RECEIPT_STORAGE_BUCKET).remove(uploadedPaths);
        if (cleanupError) console.error("Could not remove staged Expense Claim receipts", cleanupError);
      }
      throw transactionError;
    }

  } catch (error) {
    return err(errorMessage(error));
  }
}
