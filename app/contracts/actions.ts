"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import type { PurchaseStatus } from "@/lib/types";

type ContractWorkflowStatus = "w9_requested" | "contract_sent" | "contract_signed_returned" | "siena_signed";
type InstallmentStatus = "planned" | "check_request_submitted" | "check_paid";
type BulkContractLine = {
  contractorName: string;
  contractValue: string;
  installmentCount?: string;
};

function parseMoney(value: FormDataEntryValue | null): number {
  if (typeof value !== "string" || value.trim() === "") return 0;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseInstallmentCount(value: FormDataEntryValue | null): number {
  const parsed = Number.parseInt(String(value ?? "1"), 10);
  if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 4) return parsed;
  return 1;
}

function parseWorkflowStatus(value: FormDataEntryValue | null): ContractWorkflowStatus {
  const raw = String(value ?? "w9_requested").trim().toLowerCase();
  if (raw === "contract_sent" || raw === "contract_signed_returned" || raw === "siena_signed") return raw;
  return "w9_requested";
}

function parseInstallmentStatus(value: FormDataEntryValue | null): InstallmentStatus {
  const raw = String(value ?? "planned").trim().toLowerCase();
  if (raw === "check_request_submitted" || raw === "check_paid") return raw;
  return "planned";
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
  if (message.includes("NEXT_REDIRECT") || digest.includes("NEXT_REDIRECT")) throw error;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) return error.message;
  return fallback;
}

function splitAmounts(total: number, count: number): number[] {
  const cents = Math.round(total * 100);
  const base = Math.trunc(cents / count);
  let remainder = cents - base * count;
  const parts: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const bump = remainder > 0 ? 1 : remainder < 0 ? -1 : 0;
    if (remainder !== 0) remainder -= bump;
    parts.push((base + bump) / 100);
  }
  return parts;
}

function parseBulkContractLines(value: FormDataEntryValue | null): BulkContractLine[] {
  if (typeof value !== "string" || value.trim().length === 0) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((item) => {
      const row = item as Record<string, unknown>;
      return {
        contractorName: String(row.contractorName ?? "").trim(),
        contractValue: String(row.contractValue ?? "").trim(),
        installmentCount: String(row.installmentCount ?? "1").trim()
      };
    })
    .filter((row) => row.contractorName.length > 0 && row.contractValue.length > 0);
}

async function ensurePmOrAdmin(projectId: string, userId: string): Promise<void> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("project_memberships")
    .select("role")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .single();
  if (error || !data) throw new Error("Project membership not found.");
  const role = data.role as string;
  if (role !== "admin" && role !== "project_manager") {
    throw new Error("Only Admin or Project Manager can manage contracts.");
  }
}

export async function createContractAction(formData: FormData): Promise<void> {
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) throw new Error("You must be signed in.");

    const projectId = String(formData.get("projectId") ?? "").trim();
    const fiscalYearId = String(formData.get("fiscalYearId") ?? "").trim();
    const organizationId = String(formData.get("organizationId") ?? "").trim();
    const bannerAccountCodeId = String(formData.get("bannerAccountCodeId") ?? "").trim();
    const contractorName = String(formData.get("contractorName") ?? "").trim();
    const contractorEmployeeId = String(formData.get("contractorEmployeeId") ?? "").trim();
    const contractorEmail = String(formData.get("contractorEmail") ?? "").trim();
    const contractorPhone = String(formData.get("contractorPhone") ?? "").trim();
    const contractValue = parseMoney(formData.get("contractValue"));
    const installmentCount = parseInstallmentCount(formData.get("installmentCount"));
    const notes = String(formData.get("notes") ?? "").trim();

    if (!projectId) throw new Error("Project is required.");
    if (!bannerAccountCodeId) throw new Error("Banner account code is required.");
    if (!contractorName) throw new Error("Contracted employee name is required.");
    if (contractValue === 0) throw new Error("Contract value must be non-zero.");

    await ensurePmOrAdmin(projectId, user.id);

    const { data: projectRow, error: projectError } = await supabase
      .from("projects")
      .select("id, organization_id, fiscal_year_id")
      .eq("id", projectId)
      .single();
    if (projectError || !projectRow) throw new Error("Project not found.");

    const resolvedOrganizationId = organizationId || ((projectRow.organization_id as string | null) ?? null);
    const resolvedFiscalYearId = fiscalYearId || ((projectRow.fiscal_year_id as string | null) ?? null);

    const { data: miscCategory, error: miscCategoryError } = await supabase
      .from("production_categories")
      .select("id")
      .ilike("name", "Miscellaneous")
      .order("active", { ascending: false })
      .order("sort_order", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (miscCategoryError) throw new Error(miscCategoryError.message);
    if (!miscCategory?.id) throw new Error("Production category 'Miscellaneous' is required for contract reporting.");
    const miscCategoryId = miscCategory.id as string;

    const { data: reportingBudgetLineId, error: lineError } = await supabase.rpc("ensure_project_category_line", {
      p_project_id: projectId,
      p_production_category_id: miscCategoryId
    });
    if (lineError || !reportingBudgetLineId) throw new Error(lineError?.message ?? "Could not resolve reporting line.");

    const { data: contract, error: contractError } = await supabase
      .from("contracts")
      .insert({
        fiscal_year_id: resolvedFiscalYearId,
        organization_id: resolvedOrganizationId,
        project_id: projectId,
        banner_account_code_id: bannerAccountCodeId,
        production_category_id: miscCategoryId,
        entered_by_user_id: user.id,
        contractor_name: contractorName,
        contractor_employee_id: contractorEmployeeId || null,
        contractor_email: contractorEmail || null,
        contractor_phone: contractorPhone || null,
        contract_value: contractValue,
        installment_count: installmentCount,
        workflow_status: "w9_requested",
        notes: notes || null
      })
      .select("id")
      .single();
    if (contractError || !contract) throw new Error(contractError?.message ?? "Could not create contract.");

    const installmentAmounts = splitAmounts(contractValue, installmentCount);
    for (let index = 0; index < installmentAmounts.length; index += 1) {
      const installmentNumber = index + 1;
      const installmentAmount = installmentAmounts[index];
      const installmentTitle = `${contractorName} Contract Payment ${installmentNumber}/${installmentCount}`;

      const { data: purchase, error: purchaseError } = await supabase
        .from("purchases")
        .insert({
          project_id: projectId,
          organization_id: resolvedOrganizationId,
          budget_line_id: reportingBudgetLineId as string,
          production_category_id: miscCategoryId,
          banner_account_code_id: bannerAccountCodeId,
          budget_tracked: true,
          entered_by_user_id: user.id,
          title: installmentTitle,
          estimated_amount: installmentAmount,
          requested_amount: 0,
          encumbered_amount: 0,
          pending_cc_amount: 0,
          posted_amount: 0,
          status: "requested",
          request_type: "contract_payment",
          is_credit_card: false,
          procurement_status: "requested",
          notes: `Contract installment ${installmentNumber}/${installmentCount}`
        })
        .select("id")
        .single();
      if (purchaseError || !purchase) throw new Error(purchaseError?.message ?? "Could not create linked payment row.");

      const { error: allocationError } = await supabase.from("purchase_allocations").insert({
        purchase_id: purchase.id,
        reporting_budget_line_id: reportingBudgetLineId as string,
        account_code_id: bannerAccountCodeId,
        production_category_id: miscCategoryId,
        amount: installmentAmount,
        reporting_bucket: "direct",
        note: "Contract installment allocation"
      });
      if (allocationError) throw new Error(allocationError.message);

      const { error: installmentError } = await supabase.from("contract_installments").insert({
        contract_id: contract.id,
        purchase_id: purchase.id,
        installment_number: installmentNumber,
        installment_amount: installmentAmount,
        status: "planned"
      });
      if (installmentError) throw new Error(installmentError.message);
    }

    revalidatePath("/contracts");
    revalidatePath("/");
    revalidatePath("/overview");
    revalidatePath(`/projects/${projectId}`);
    redirect("/contracts?ok=Contract%20saved.");
  } catch (error) {
    rethrowIfRedirect(error);
    redirect(`/contracts?error=${encodeURIComponent(getErrorMessage(error, "Could not save contract."))}`);
  }
}

export async function createContractsBulkAction(formData: FormData): Promise<void> {
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) throw new Error("You must be signed in.");

    const projectId = String(formData.get("projectId") ?? "").trim();
    const fiscalYearId = String(formData.get("fiscalYearId") ?? "").trim();
    const organizationId = String(formData.get("organizationId") ?? "").trim();
    const bannerAccountCodeId = String(formData.get("bannerAccountCodeId") ?? "").trim();
    const rows = parseBulkContractLines(formData.get("linesJson"));

    if (!projectId) throw new Error("Project is required.");
    if (!bannerAccountCodeId) throw new Error("Banner account code is required.");
    if (rows.length === 0) throw new Error("Add at least one contract row.");

    await ensurePmOrAdmin(projectId, user.id);
    const rpcRows = rows.map((row) => ({
      contractorName: row.contractorName,
      contractValue: String(row.contractValue),
      installmentCount: String(row.installmentCount ?? "1")
    }));

    const { data: createdCount, error: createError } = await supabase.rpc("create_contracts_bulk", {
      p_project_id: projectId,
      p_fiscal_year_id: fiscalYearId || null,
      p_organization_id: organizationId || null,
      p_banner_account_code_id: bannerAccountCodeId,
      p_rows: rpcRows
    });
    if (createError) throw new Error(createError.message);

    revalidatePath("/contracts");
    revalidatePath("/");
    revalidatePath("/overview");
    revalidatePath(`/projects/${projectId}`);
    redirect(`/contracts?ok=${encodeURIComponent(`Saved ${Number(createdCount ?? rows.length)} contracts.`)}`);
  } catch (error) {
    rethrowIfRedirect(error);
    redirect(`/contracts?error=${encodeURIComponent(getErrorMessage(error, "Could not save bulk contracts."))}`);
  }
}

export async function updateContractDetailsAction(formData: FormData): Promise<void> {
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) throw new Error("You must be signed in.");

    const contractId = String(formData.get("contractId") ?? "").trim();
    const projectId = String(formData.get("projectId") ?? "").trim();
    const fiscalYearId = String(formData.get("fiscalYearId") ?? "").trim();
    const organizationId = String(formData.get("organizationId") ?? "").trim();
    const bannerAccountCodeId = String(formData.get("bannerAccountCodeId") ?? "").trim();
    const contractorName = String(formData.get("contractorName") ?? "").trim();
    const contractorEmployeeId = String(formData.get("contractorEmployeeId") ?? "").trim();
    const contractorEmail = String(formData.get("contractorEmail") ?? "").trim();
    const contractorPhone = String(formData.get("contractorPhone") ?? "").trim();
    const contractValue = parseMoney(formData.get("contractValue"));
    const notes = String(formData.get("notes") ?? "").trim();

    if (!contractId) throw new Error("Contract id is required.");
    if (!projectId) throw new Error("Project is required.");
    if (!bannerAccountCodeId) throw new Error("Banner account code is required.");
    if (!contractorName) throw new Error("Contracted employee name is required.");
    if (contractValue === 0) throw new Error("Contract value must be non-zero.");

    const { data: existing, error: existingError } = await supabase
      .from("contracts")
      .select("id, project_id, installment_count, production_category_id")
      .eq("id", contractId)
      .single();
    if (existingError || !existing) throw new Error("Contract not found.");

    await ensurePmOrAdmin(existing.project_id as string, user.id);
    if ((existing.project_id as string) !== projectId) {
      await ensurePmOrAdmin(projectId, user.id);
    }

    const { data: projectRow, error: projectError } = await supabase
      .from("projects")
      .select("id, organization_id, fiscal_year_id")
      .eq("id", projectId)
      .single();
    if (projectError || !projectRow) throw new Error("Project not found.");

    const resolvedOrganizationId = organizationId || ((projectRow.organization_id as string | null) ?? null);
    const resolvedFiscalYearId = fiscalYearId || ((projectRow.fiscal_year_id as string | null) ?? null);
    const productionCategoryId = (existing.production_category_id as string | null) ?? null;
    if (!productionCategoryId) throw new Error("Contract production category is missing.");

    const { data: reportingBudgetLineId, error: lineError } = await supabase.rpc("ensure_project_category_line", {
      p_project_id: projectId,
      p_production_category_id: productionCategoryId
    });
    if (lineError || !reportingBudgetLineId) throw new Error(lineError?.message ?? "Could not resolve reporting line.");

    const { error: contractUpdateError } = await supabase
      .from("contracts")
      .update({
        fiscal_year_id: resolvedFiscalYearId,
        organization_id: resolvedOrganizationId,
        project_id: projectId,
        banner_account_code_id: bannerAccountCodeId,
        contractor_name: contractorName,
        contractor_employee_id: contractorEmployeeId || null,
        contractor_email: contractorEmail || null,
        contractor_phone: contractorPhone || null,
        contract_value: contractValue,
        notes: notes || null
      })
      .eq("id", contractId);
    if (contractUpdateError) throw new Error(contractUpdateError.message);

    const { data: installments, error: installmentsError } = await supabase
      .from("contract_installments")
      .select("id, purchase_id, installment_number, status")
      .eq("contract_id", contractId)
      .order("installment_number", { ascending: true });
    if (installmentsError) throw new Error(installmentsError.message);

    const count = Number(existing.installment_count ?? 1);
    const parts = splitAmounts(contractValue, count);

    for (const installment of installments ?? []) {
      const index = Number(installment.installment_number ?? 1) - 1;
      const installmentAmount = parts[index] ?? 0;
      const installmentStatus = ((installment.status as string | null) ?? "planned") as InstallmentStatus;

      const { error: installmentUpdateError } = await supabase
        .from("contract_installments")
        .update({ installment_amount: installmentAmount })
        .eq("id", installment.id as string);
      if (installmentUpdateError) throw new Error(installmentUpdateError.message);

      if (!installment.purchase_id) continue;

      const purchaseId = installment.purchase_id as string;
      const nextStatus: PurchaseStatus =
        installmentStatus === "check_paid" ? "posted" : installmentStatus === "check_request_submitted" ? "encumbered" : "requested";
      const requestedAmount = 0;
      const encumberedAmount = nextStatus === "encumbered" ? installmentAmount : 0;
      const postedAmount = nextStatus === "posted" ? installmentAmount : 0;

      const { error: purchaseUpdateError } = await supabase
        .from("purchases")
        .update({
          project_id: projectId,
          organization_id: resolvedOrganizationId,
          budget_line_id: reportingBudgetLineId as string,
          production_category_id: productionCategoryId,
          banner_account_code_id: bannerAccountCodeId,
          title: `${contractorName} Contract Payment ${installment.installment_number as number}/${count}`,
          estimated_amount: installmentAmount,
          requested_amount: requestedAmount,
          encumbered_amount: encumberedAmount,
          pending_cc_amount: 0,
          posted_amount: postedAmount,
          status: nextStatus,
          procurement_status: nextStatus === "posted" ? "paid" : nextStatus === "encumbered" ? "ordered" : "requested",
          posted_date: nextStatus === "posted" ? new Date().toISOString().slice(0, 10) : null
        })
        .eq("id", purchaseId);
      if (purchaseUpdateError) throw new Error(purchaseUpdateError.message);

      const { error: allocationUpdateError } = await supabase
        .from("purchase_allocations")
        .update({
          reporting_budget_line_id: reportingBudgetLineId as string,
          account_code_id: bannerAccountCodeId,
          production_category_id: productionCategoryId,
          amount: installmentAmount
        })
        .eq("purchase_id", purchaseId);
      if (allocationUpdateError) throw new Error(allocationUpdateError.message);
    }

    revalidatePath("/contracts");
    revalidatePath("/");
    revalidatePath("/overview");
    revalidatePath(`/projects/${projectId}`);
    redirect("/contracts?ok=Contract%20updated.");
  } catch (error) {
    rethrowIfRedirect(error);
    redirect(`/contracts?error=${encodeURIComponent(getErrorMessage(error, "Could not update contract."))}`);
  }
}

export async function updateContractWorkflowAction(formData: FormData): Promise<void> {
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) throw new Error("You must be signed in.");

    const contractId = String(formData.get("contractId") ?? "").trim();
    const workflowStatus = parseWorkflowStatus(formData.get("workflowStatus"));
    if (!contractId) throw new Error("Contract id is required.");

    const { data: contract, error: contractError } = await supabase
      .from("contracts")
      .select("id, project_id")
      .eq("id", contractId)
      .single();
    if (contractError || !contract) throw new Error("Contract not found.");
    const projectId = contract.project_id as string;

    await ensurePmOrAdmin(projectId, user.id);

    const { error: updateError } = await supabase
      .from("contracts")
      .update({ workflow_status: workflowStatus })
      .eq("id", contractId);
    if (updateError) throw new Error(updateError.message);

    revalidatePath("/contracts");
    redirect("/contracts?ok=Contract%20workflow%20updated.");
  } catch (error) {
    rethrowIfRedirect(error);
    redirect(`/contracts?error=${encodeURIComponent(getErrorMessage(error, "Could not update contract workflow."))}`);
  }
}

export async function updateContractInstallmentStatusAction(formData: FormData): Promise<void> {
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) throw new Error("You must be signed in.");

    const installmentId = String(formData.get("installmentId") ?? "").trim();
    const nextStatus = parseInstallmentStatus(formData.get("status"));
    if (!installmentId) throw new Error("Installment id is required.");

    const { data: installment, error: installmentError } = await supabase
      .from("contract_installments")
      .select("id, contract_id, purchase_id, installment_amount, status, contracts!inner(project_id)")
      .eq("id", installmentId)
      .single();
    if (installmentError || !installment) throw new Error("Installment not found.");
    const contractJoin = installment.contracts as { project_id?: string } | Array<{ project_id?: string }> | null;
    const contractRow = Array.isArray(contractJoin) ? contractJoin[0] : contractJoin;
    const projectId = contractRow?.project_id;
    if (!projectId) throw new Error("Project could not be resolved.");

    await ensurePmOrAdmin(projectId, user.id);

    const amount = parseMoney(String(installment.installment_amount ?? "0"));
    if (amount === 0) throw new Error("Installment amount must be non-zero.");

    let purchaseStatus: PurchaseStatus = "requested";
    let requestedAmount = 0;
    let encumberedAmount = 0;
    let postedAmount = 0;
    let procurementStatus = "requested";
    let postedDate: string | null = null;

    if (nextStatus === "check_request_submitted") {
      purchaseStatus = "encumbered";
      encumberedAmount = amount;
      procurementStatus = "ordered";
    } else if (nextStatus === "check_paid") {
      purchaseStatus = "posted";
      postedAmount = amount;
      procurementStatus = "paid";
      postedDate = new Date().toISOString().slice(0, 10);
    } else {
      requestedAmount = 0;
    }

    if (installment.purchase_id) {
      const { error: purchaseUpdateError } = await supabase
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
        .eq("id", installment.purchase_id as string);
      if (purchaseUpdateError) throw new Error(purchaseUpdateError.message);

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
      if (eventError) throw new Error(eventError.message);
    }

    const today = new Date().toISOString().slice(0, 10);
    const { error: installmentUpdateError } = await supabase
      .from("contract_installments")
      .update({
        status: nextStatus,
        check_request_submitted_on: nextStatus === "check_request_submitted" || nextStatus === "check_paid" ? today : null,
        check_paid_on: nextStatus === "check_paid" ? today : null
      })
      .eq("id", installmentId);
    if (installmentUpdateError) throw new Error(installmentUpdateError.message);

    revalidatePath("/contracts");
    revalidatePath("/");
    revalidatePath("/overview");
    revalidatePath(`/projects/${projectId}`);
    redirect("/contracts?ok=Installment%20status%20updated.");
  } catch (error) {
    rethrowIfRedirect(error);
    redirect(`/contracts?error=${encodeURIComponent(getErrorMessage(error, "Could not update installment status."))}`);
  }
}

export async function deleteContractAction(formData: FormData): Promise<void> {
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) throw new Error("You must be signed in.");

    const contractId = String(formData.get("contractId") ?? "").trim();
    if (!contractId) throw new Error("Contract id is required.");

    const { data: contract, error: contractError } = await supabase
      .from("contracts")
      .select("id, project_id")
      .eq("id", contractId)
      .single();
    if (contractError || !contract) throw new Error("Contract not found.");
    const projectId = contract.project_id as string;

    await ensurePmOrAdmin(projectId, user.id);

    const { error: deleteError } = await supabase.rpc("delete_contract_with_links", {
      p_contract_id: contractId
    });
    if (deleteError) throw new Error(deleteError.message);

    revalidatePath("/contracts");
    revalidatePath("/");
    revalidatePath("/overview");
    revalidatePath(`/projects/${projectId}`);
    redirect("/contracts?ok=Contract%20deleted.");
  } catch (error) {
    rethrowIfRedirect(error);
    redirect(`/contracts?error=${encodeURIComponent(getErrorMessage(error, "Could not delete contract."))}`);
  }
}
