"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { bannerRuleRelievesEncumbrance } from "@/lib/banner-rule-class";
import { parseArgosEncControlCsv, parseArgosYtdControlCsv, parseBannerFinanceEncWorkbook } from "@/lib/banner-reconciliation-files";
import { type ActionState, emptyState, ok, err, getErrorMessage, parseMoney } from "@/lib/action-helpers";
import { parseDateInput, ensurePurchasePmOrAdminAccess, syncInstitutionalBudget, ensureOrganizationPmOrAdminAccess } from "@/app/procurement/actions/_shared";

export async function addPurchaseInvoiceTransactionAction(
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

    const purchaseId = String(formData.get("purchaseId") ?? "").trim();
    const purchaseAllocationId = String(formData.get("purchaseAllocationId") ?? "").trim();
    const documentNumber = String(formData.get("documentNumber") ?? "").trim().toUpperCase();
    const transactionDate = parseDateInput(formData.get("transactionDate"));
    const description = String(formData.get("description") ?? "").trim();
    const transactionType = String(formData.get("transactionType") ?? "debit").trim();
    const ruleClassCode = String(formData.get("ruleClassCode") ?? "").trim().toUpperCase().slice(0, 40) || null;
    const relievesEncumbrance = formData.get("relievesEncumbrance") === "true" && bannerRuleRelievesEncumbrance(ruleClassCode);
    const enteredAmount = Math.abs(parseMoney(formData.get("amount")));

    if (!purchaseId) return err("PO is required.");
    if (!purchaseAllocationId) return err("Choose the allocation this line posts against.");
    if (!documentNumber) return err("Invoice or credit document number is required.");
    if (!transactionDate) return err("Transaction date is required.");
    if (enteredAmount === 0) return err("Amount must be greater than zero.");
    if (transactionType !== "debit" && transactionType !== "credit") return err("Choose debit or credit.");

    await ensurePurchasePmOrAdminAccess(supabase, user.id, purchaseId);
    const { data: purchase, error: purchaseError } = await supabase
      .from("purchases")
      .select("id, request_type, procurement_status, project_id")
      .eq("id", purchaseId)
      .single();
    if (purchaseError || !purchase) return err("PO not found.");
    if (purchase.request_type !== "requisition") return err("Invoice lines are available only for requisition POs.");
    if (purchase.procurement_status === "cancelled") return err("Reopen this PO before adding a financial line.");

    const { data: allocation, error: allocationError } = await supabase
      .from("purchase_allocations")
      .select("id, purchase_id")
      .eq("id", purchaseAllocationId)
      .eq("purchase_id", purchaseId)
      .single();
    if (allocationError || !allocation) return err("That allocation does not belong to this PO.");

    const signedAmount = transactionType === "credit" ? -enteredAmount : enteredAmount;
    const { error } = await supabase.from("purchase_invoice_transactions").insert({
      purchase_id: purchaseId,
      purchase_allocation_id: purchaseAllocationId,
      document_number: documentNumber,
      transaction_date: transactionDate,
      description: description || null,
      amount: signedAmount,
      rule_class_code: ruleClassCode,
      relieves_encumbrance: relievesEncumbrance,
      created_by_user_id: user.id
    });
    if (error) return err(error.message);

    const institutionalSyncError = await syncInstitutionalBudget(supabase, purchaseId, user.id);
    if (institutionalSyncError) return institutionalSyncError;

    revalidatePath("/procurement");
    revalidatePath("/requests");
    revalidatePath("/");
    if (purchase.project_id) revalidatePath(`/projects/${purchase.project_id as string}`);
    return ok(`${transactionType === "credit" ? "Credit" : "Invoice line"} added.`);
  } catch (error) {
    return err(getErrorMessage(error, "Could not add the invoice line."));
  }
}

type ImportedInvoiceTransaction = {
  sourceLineKey: string;
  purchaseAllocationId: string;
  documentNumber: string;
  transactionDate: string;
  description?: string;
  amount: number;
  ruleClassCode: string | null;
  relievesEncumbrance: boolean;
};

export async function importPurchaseInvoiceTransactionsAction(
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

    const purchaseId = String(formData.get("purchaseId") ?? "").trim();
    const rowsJson = String(formData.get("rowsJson") ?? "").trim();
    if (!purchaseId) return err("PO is required.");
    if (!rowsJson) return err("Choose at least one CSV line to import.");

    let rawRows: unknown;
    try {
      rawRows = JSON.parse(rowsJson);
    } catch {
      return err("The selected CSV lines could not be read.");
    }
    if (!Array.isArray(rawRows) || rawRows.length === 0) return err("Choose at least one CSV line to import.");
    if (rawRows.length > 2000) return err("Import no more than 2,000 lines at once.");

    await ensurePurchasePmOrAdminAccess(supabase, user.id, purchaseId);
    const { data: purchase, error: purchaseError } = await supabase
      .from("purchases")
      .select("id, request_type, procurement_status, project_id")
      .eq("id", purchaseId)
      .single();
    if (purchaseError || !purchase) return err("PO not found.");
    if (purchase.request_type !== "requisition") return err("Invoice lines are available only for requisition POs.");
    if (purchase.procurement_status === "cancelled") return err("Reopen this PO before importing financial lines.");

    const rows: ImportedInvoiceTransaction[] = [];
    for (const rawRow of rawRows) {
      if (!rawRow || typeof rawRow !== "object") return err("One of the selected CSV lines is invalid.");
      const candidate = rawRow as Record<string, unknown>;
      const sourceLineKey = String(candidate.sourceLineKey ?? "").trim().slice(0, 1500);
      const purchaseAllocationId = String(candidate.purchaseAllocationId ?? "").trim();
      const documentNumber = String(candidate.documentNumber ?? "").trim().toUpperCase();
      const transactionDate = parseDateInput(String(candidate.transactionDate ?? ""));
      const description = String(candidate.description ?? "").trim();
      const amount = Number(candidate.amount);
      const ruleClassCode = String(candidate.ruleClassCode ?? "").trim().toUpperCase().slice(0, 40) || null;
      const relievesEncumbrance = candidate.relievesEncumbrance !== false && bannerRuleRelievesEncumbrance(ruleClassCode);
      if (!sourceLineKey || !purchaseAllocationId || !documentNumber || !transactionDate || !Number.isFinite(amount) || amount === 0) {
        return err("Every selected CSV line needs a document number, date, amount, and budget allocation.");
      }
      rows.push({
        sourceLineKey,
        purchaseAllocationId,
        documentNumber,
        transactionDate,
        description: description || undefined,
        amount: Math.round(amount * 100) / 100,
        ruleClassCode,
        relievesEncumbrance
      });
    }

    const allocationIds = [...new Set(rows.map((row) => row.purchaseAllocationId))];
    const { data: allocations, error: allocationsError } = await supabase
      .from("purchase_allocations")
      .select("id")
      .eq("purchase_id", purchaseId)
      .in("id", allocationIds);
    if (allocationsError) return err(allocationsError.message);
    if ((allocations ?? []).length !== allocationIds.length) return err("One or more selected allocations do not belong to this PO.");

    const existingKeys = new Set<string>();
    for (let index = 0; index < rows.length; index += 25) {
      const keys = rows.slice(index, index + 25).map((row) => row.sourceLineKey);
      const { data: existing, error: existingError } = await supabase
        .from("purchase_invoice_transactions")
        .select("source_line_key")
        .in("source_line_key", keys);
      if (existingError) return err(existingError.message);
      for (const entry of existing ?? []) {
        if (entry.source_line_key) existingKeys.add(entry.source_line_key as string);
      }
    }

    const newRows = rows.filter((row) => !existingKeys.has(row.sourceLineKey));
    let importedCount = 0;
    let duplicateCount = rows.length - newRows.length;
    for (const row of newRows) {
      const { error } = await supabase.from("purchase_invoice_transactions").insert({
        purchase_id: purchaseId,
        purchase_allocation_id: row.purchaseAllocationId,
        document_number: row.documentNumber,
        transaction_date: row.transactionDate,
        description: row.description ?? null,
        amount: row.amount,
        source_line_key: row.sourceLineKey,
        rule_class_code: row.ruleClassCode,
        relieves_encumbrance: row.relievesEncumbrance,
        created_by_user_id: user.id
      });
      if (error?.code === "23505") {
        duplicateCount += 1;
        continue;
      }
      if (error) return err(`Imported ${importedCount} line${importedCount === 1 ? "" : "s"}, then stopped: ${error.message}`);
      importedCount += 1;
    }

    if (importedCount > 0) {
      const institutionalSyncError = await syncInstitutionalBudget(supabase, purchaseId, user.id);
      if (institutionalSyncError) return institutionalSyncError;
    }

    revalidatePath("/procurement");
    revalidatePath("/requests");
    revalidatePath("/");
    if (purchase.project_id) revalidatePath(`/projects/${purchase.project_id as string}`);
    const duplicateMessage = duplicateCount > 0
      ? ` ${duplicateCount} duplicate line${duplicateCount === 1 ? " was" : "s were"} already present and skipped.`
      : "";
    return ok(`${importedCount} CSV line${importedCount === 1 ? "" : "s"} imported.${duplicateMessage}`);
  } catch (error) {
    return err(getErrorMessage(error, "Could not import the invoice CSV lines."));
  }
}

type ReconciledBannerTransaction = ImportedInvoiceTransaction & {
  purchaseId: string;
};

export async function importBannerAccountReconciliationAction(
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
    const rowsJson = String(formData.get("rowsJson") ?? "").trim();
    if (!rowsJson) return err("Choose at least one Banner line to keep.");

    let rawRows: unknown;
    try {
      rawRows = JSON.parse(rowsJson);
    } catch {
      return err("The reviewed Banner lines could not be read.");
    }
    if (!Array.isArray(rawRows) || rawRows.length === 0) return err("Choose at least one Banner line to keep.");
    if (rawRows.length > 2000) return err("Import no more than 2,000 lines at once.");

    const rows: ReconciledBannerTransaction[] = [];
    for (const rawRow of rawRows) {
      if (!rawRow || typeof rawRow !== "object") return err("One of the reviewed Banner lines is invalid.");
      const candidate = rawRow as Record<string, unknown>;
      const purchaseId = String(candidate.purchaseId ?? "").trim();
      const purchaseAllocationId = String(candidate.purchaseAllocationId ?? "").trim();
      const sourceLineKey = String(candidate.sourceLineKey ?? "").trim().slice(0, 1500);
      const documentNumber = String(candidate.documentNumber ?? "").trim().toUpperCase();
      const transactionDate = parseDateInput(String(candidate.transactionDate ?? ""));
      const description = String(candidate.description ?? "").trim();
      const amount = Number(candidate.amount);
      const ruleClassCode = String(candidate.ruleClassCode ?? "").trim().toUpperCase().slice(0, 40) || null;
      const relievesEncumbrance = candidate.relievesEncumbrance !== false && bannerRuleRelievesEncumbrance(ruleClassCode);
      if (!purchaseId || !purchaseAllocationId || !sourceLineKey || !documentNumber || !transactionDate || !Number.isFinite(amount) || amount === 0) {
        return err("Every kept line needs a matching PO, document number, date, amount, and allocation.");
      }
      rows.push({
        purchaseId,
        purchaseAllocationId,
        sourceLineKey,
        documentNumber,
        transactionDate,
        description: description || undefined,
        amount: Math.round(amount * 100) / 100,
        ruleClassCode,
        relievesEncumbrance
      });
    }

    const purchaseIds = [...new Set(rows.map((row) => row.purchaseId))];
    for (const purchaseId of purchaseIds) await ensurePurchasePmOrAdminAccess(supabase, user.id, purchaseId);
    const { data: purchases, error: purchasesError } = await supabase
      .from("purchases")
      .select("id, request_type, procurement_status, project_id")
      .in("id", purchaseIds);
    if (purchasesError) return err(purchasesError.message);
    if ((purchases ?? []).length !== purchaseIds.length) return err("One or more selected POs are unavailable.");
    for (const purchase of purchases ?? []) {
      if (purchase.request_type !== "requisition") return err("Banner account lines can only be assigned to requisition POs.");
      if (String(purchase.procurement_status) === "cancelled") return err("A selected PO is cancelled. Reopen it before importing Banner activity.");
    }

    const allocationIds = [...new Set(rows.map((row) => row.purchaseAllocationId))];
    const { data: allocations, error: allocationsError } = await supabase
      .from("purchase_allocations")
      .select("id, purchase_id")
      .in("id", allocationIds);
    if (allocationsError) return err(allocationsError.message);
    const allocationPurchase = new Map((allocations ?? []).map((allocation) => [allocation.id as string, allocation.purchase_id as string]));
    if (allocationPurchase.size !== allocationIds.length || rows.some((row) => allocationPurchase.get(row.purchaseAllocationId) !== row.purchaseId)) {
      return err("One or more selected allocations do not belong to the chosen PO.");
    }

    const existingKeys = new Set<string>();
    for (let index = 0; index < rows.length; index += 25) {
      const keys = rows.slice(index, index + 25).map((row) => row.sourceLineKey);
      const { data: existing, error: existingError } = await supabase
        .from("purchase_invoice_transactions")
        .select("source_line_key")
        .in("source_line_key", keys);
      if (existingError) return err(existingError.message);
      for (const entry of existing ?? []) if (entry.source_line_key) existingKeys.add(entry.source_line_key as string);
    }

    let importedCount = 0;
    let duplicateCount = rows.filter((row) => existingKeys.has(row.sourceLineKey)).length;
    const affectedPurchaseIds = new Set<string>();
    for (const row of rows.filter((entry) => !existingKeys.has(entry.sourceLineKey))) {
      const { error } = await supabase.from("purchase_invoice_transactions").insert({
        purchase_id: row.purchaseId,
        purchase_allocation_id: row.purchaseAllocationId,
        document_number: row.documentNumber,
        transaction_date: row.transactionDate,
        description: row.description ?? null,
        amount: row.amount,
        source_line_key: row.sourceLineKey,
        rule_class_code: row.ruleClassCode,
        relieves_encumbrance: row.relievesEncumbrance,
        created_by_user_id: user.id
      });
      if (error?.code === "23505") {
        duplicateCount += 1;
        continue;
      }
      if (error) return err(`Imported ${importedCount} line${importedCount === 1 ? "" : "s"}, then stopped: ${error.message}`);
      importedCount += 1;
      affectedPurchaseIds.add(row.purchaseId);
    }

    for (const purchaseId of affectedPurchaseIds) {
      const institutionalSyncError = await syncInstitutionalBudget(supabase, purchaseId, user.id);
      if (institutionalSyncError) return institutionalSyncError;
    }
    revalidatePath("/procurement");
    revalidatePath("/requests");
    revalidatePath("/");
    for (const purchase of purchases ?? []) if (purchase.project_id) revalidatePath(`/projects/${purchase.project_id as string}`);
    const duplicateMessage = duplicateCount > 0
      ? ` ${duplicateCount} duplicate line${duplicateCount === 1 ? " was" : "s were"} already imported and skipped.`
      : "";
    return ok(`${importedCount} Banner line${importedCount === 1 ? "" : "s"} assigned to POs.${duplicateMessage}`);
  } catch (error) {
    return err(getErrorMessage(error, "Could not reconcile the Banner account lines."));
  }
}

export async function finalizeBannerReconciliationAction(
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
    const fiscalYearId = String(formData.get("fiscalYearId") ?? "").trim();
    const ytdFile = formData.get("ytdFile");
    const encControlFile = formData.get("encControlFile");
    const encDetailFile = formData.get("encDetailFile");
    if (!fiscalYearId) return err("Choose a fiscal year.");
    if (!(ytdFile instanceof File) || ytdFile.size === 0) return err("Choose the Evisions Argos YTD CSV.");
    if (!(encControlFile instanceof File) || encControlFile.size === 0) return err("Choose the Evisions Argos ENC control CSV.");
    if (!(encDetailFile instanceof File) || encDetailFile.size === 0) return err("Choose the Banner Finance ENC detail workbook.");
    if (ytdFile.size > 8_000_000 || encControlFile.size > 8_000_000 || encDetailFile.size > 8_000_000) {
      return err("Each reconciliation file must be 8 MB or smaller.");
    }

    const [ytd, encControl, encDetail] = await Promise.all([
      parseArgosYtdControlCsv(await ytdFile.text()),
      parseArgosEncControlCsv(await encControlFile.text()),
      parseBannerFinanceEncWorkbook(await encDetailFile.arrayBuffer())
    ]);
    if (!ytd.organizationCode || !ytd.accountCode) return err("The Argos YTD file is missing its organization or account code.");
    if (encControl.accountCode !== ytd.accountCode) return err("The Argos ENC control is for a different account than the Argos YTD file.");
    if (encDetail.fiscalYear !== ytd.fiscalYear) return err("The Banner Finance ENC workbook is for a different fiscal year than the Argos YTD file.");
    if (encDetail.organizationCode !== ytd.organizationCode || encDetail.accountCode !== ytd.accountCode) {
      return err("The Banner Finance ENC workbook is for a different organization or account.");
    }
    if (!encDetail.asOfDate) return err("The Banner Finance ENC workbook is missing its as-of date.");
    if (encDetail.reportedTotal !== null && Math.abs(encDetail.reportedTotal - encDetail.total) > 0.01) {
      return err(`The Banner Finance ENC detail lines total ${encDetail.total.toFixed(2)}, but its report total is ${encDetail.reportedTotal.toFixed(2)}.`);
    }
    if (Math.abs(encDetail.total - encControl.total) > 0.01) {
      return err(`The Banner Finance ENC detail totals ${encDetail.total.toFixed(2)}, but the Argos ENC control is ${encControl.total.toFixed(2)}.`);
    }

    const { data: organization, error: organizationError } = await supabase
      .from("organizations")
      .select("id")
      .eq("org_code", ytd.organizationCode)
      .eq("active", true)
      .is("superseded_by_organization_id", null)
      .single();
    if (organizationError || !organization) return err(`Active organization ${ytd.organizationCode} was not found.`);
    await ensureOrganizationPmOrAdminAccess(organization.id as string, fiscalYearId);

    const { data: account, error: accountError } = await supabase
      .from("account_codes")
      .select("id")
      .eq("code", ytd.accountCode)
      .single();
    if (accountError || !account) return err(`Banner account ${ytd.accountCode} was not found.`);

    const { data: actualRows, error: actualError } = await supabase
      .from("v_actuals_by_banner_code")
      .select("organization_id, posted_total, enc_total")
      .eq("fiscal_year_id", fiscalYearId)
      .eq("org_code", ytd.organizationCode)
      .eq("banner_account_code", ytd.accountCode);
    if (actualError) return err(actualError.message);
    const appYtd = Math.round(((actualRows ?? []) as Array<Record<string, unknown>>).reduce((sum, row) => sum + Number(row.posted_total ?? 0), 0) * 100) / 100;
    const appEnc = Math.round(((actualRows ?? []) as Array<Record<string, unknown>>).reduce((sum, row) => sum + Number(row.enc_total ?? 0), 0) * 100) / 100;
    const differences: string[] = [];
    if (Math.abs(appYtd - ytd.total) > 0.01) differences.push(`YTD: app ${appYtd.toFixed(2)} vs Argos ${ytd.total.toFixed(2)}`);
    if (Math.abs(appEnc - encControl.total) > 0.01) differences.push(`ENC: app ${appEnc.toFixed(2)} vs Argos ${encControl.total.toFixed(2)}`);
    if (differences.length > 0) {
      return err(`The account cannot be marked reconciled. ${differences.join(". ")}. Review the exception documents and try again.`);
    }

    const { error: saveError } = await supabase
      .from("banner_reconciliation_periods")
      .upsert({
        fiscal_year_id: fiscalYearId,
        organization_id: organization.id as string,
        account_code_id: account.id as string,
        as_of_date: encDetail.asOfDate,
        ytd_control_total: ytd.total,
        enc_control_total: encControl.total,
        enc_detail_total: encDetail.total,
        app_ytd_total: appYtd,
        app_enc_total: appEnc,
        ytd_source_filename: ytdFile.name.slice(0, 255),
        enc_control_filename: encControlFile.name.slice(0, 255),
        enc_detail_filename: encDetailFile.name.slice(0, 255),
        status: "reconciled",
        notes: `${ytd.rowCount} YTD detail lines; ${encDetail.rows.length} ENC detail lines across ${encDetail.documents.length} documents.`,
        created_by_user_id: user.id,
        updated_at: new Date().toISOString()
      }, { onConflict: "fiscal_year_id,organization_id,account_code_id,as_of_date" });
    if (saveError) return err(saveError.message);
    revalidatePath("/procurement");
    revalidatePath("/overview");
    return ok(`${ytd.organizationCode} ${ytd.accountCode} reconciled through ${encDetail.asOfDate}. YTD ${appYtd.toFixed(2)} and ENC ${appEnc.toFixed(2)} both match Banner.`);
  } catch (error) {
    return err(getErrorMessage(error, "Could not finish the Banner reconciliation."));
  }
}

export async function voidPurchaseInvoiceTransactionAction(
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

    const id = String(formData.get("id") ?? "").trim();
    if (!id) return err("Invoice line is required.");
    const { data: transaction, error: transactionError } = await supabase
      .from("purchase_invoice_transactions")
      .select("id, purchase_id, voided_at, purchases(project_id)")
      .eq("id", id)
      .single();
    if (transactionError || !transaction) return err("Invoice line not found.");
    if (transaction.voided_at) return err("That line is already voided.");
    const purchaseId = transaction.purchase_id as string;
    await ensurePurchasePmOrAdminAccess(supabase, user.id, purchaseId);

    const { error } = await supabase
      .from("purchase_invoice_transactions")
      .update({ voided_at: new Date().toISOString(), voided_by_user_id: user.id })
      .eq("id", id)
      .is("voided_at", null);
    if (error) return err(error.message);

    const institutionalSyncError = await syncInstitutionalBudget(supabase, purchaseId, user.id);
    if (institutionalSyncError) return institutionalSyncError;

    const purchaseJoin = Array.isArray(transaction.purchases) ? transaction.purchases[0] : transaction.purchases;
    revalidatePath("/procurement");
    revalidatePath("/requests");
    revalidatePath("/");
    if (purchaseJoin?.project_id) revalidatePath(`/projects/${purchaseJoin.project_id as string}`);
    return ok("Invoice line voided. The PO totals were recalculated.");
  } catch (error) {
    return err(getErrorMessage(error, "Could not void the invoice line."));
  }
}
