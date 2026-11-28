"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { requireProjectRole } from "@/lib/access";
import { createInstitutionalCommitmentForPurchase } from "@/lib/institutional-budget";
import type { PurchaseStatus } from "@/lib/types";
import { type ActionState, emptyState, ok, err, getErrorMessage, parseMoney } from "@/lib/action-helpers";
import { requireCcManagerRole, requireOrganizationMembership } from "@/app/cc/actions/_shared";

export async function createReimbursementRequestAction(
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
    const projectId = String(formData.get("projectId") ?? "").trim();
    const organizationId = String(formData.get("organizationId") ?? "").trim();
    const productionCategoryId = String(formData.get("productionCategoryId") ?? "").trim();
    const bannerAccountCodeId = String(formData.get("bannerAccountCodeId") ?? "").trim();
    const title = String(formData.get("title") ?? "").trim();
    const referenceNumber = String(formData.get("referenceNumber") ?? "").trim();
    const amount = parseMoney(formData.get("amount"));

    if (!fiscalYearId || (!projectId && !organizationId) || (projectId && organizationId) || !title) {
      return err("Fiscal year, exactly one project or organization budget, and title are required.");
    }
    if (projectId && !productionCategoryId) return err("Department is required for project reimbursements.");
    if (organizationId && !bannerAccountCodeId) return err("Banner code is required for organization reimbursements.");
    if (amount === 0) return err("Amount must be non-zero.");

    let budgetLine: { id: string; account_code_id: string | null } | null = null;
    let resolvedOrganizationId: string | null = organizationId || null;
    if (projectId) {
      await requireProjectRole(projectId, ["admin", "project_manager", "buyer"], {
        productionCategoryId,
        errorMessage: "You do not have permission to create requests for this project."
      });
      const { data: project, error: projectError } = await supabase
        .from("projects")
        .select("id, fiscal_year_id, organization_id")
        .eq("id", projectId)
        .single();
      if (projectError || !project) return err("Project not found.");
      if (project.fiscal_year_id !== fiscalYearId) return err("Project does not belong to the selected fiscal year.");
      resolvedOrganizationId = (project.organization_id as string | null) ?? null;

      const { data: budgetLineId, error: ensureLineError } = await supabase.rpc("ensure_project_category_line", {
        p_project_id: projectId,
        p_production_category_id: productionCategoryId
      });
      if (ensureLineError || !budgetLineId) return err(ensureLineError?.message ?? "Unable to resolve reporting line.");

      const { data: line, error: budgetLineError } = await supabase
        .from("project_budget_lines")
        .select("id, account_code_id")
        .eq("id", budgetLineId as string)
        .single();
      if (budgetLineError || !line) return err("Reporting line not found.");
      budgetLine = { id: line.id as string, account_code_id: (line.account_code_id as string | null) ?? null };
    } else {
      await requireCcManagerRole();
      await requireOrganizationMembership(supabase, fiscalYearId, organizationId, { projectlessOnly: true });
    }

    const { data: inserted, error: insertError } = await supabase
      .from("purchases")
      .insert({
        fiscal_year_id: fiscalYearId,
        project_id: projectId || null,
        organization_id: resolvedOrganizationId,
        budget_line_id: budgetLine?.id ?? null,
        production_category_id: productionCategoryId || null,
        banner_account_code_id: bannerAccountCodeId || null,
        budget_tracked: true,
        entered_by_user_id: user.id,
        title,
        reference_number: referenceNumber || null,
        requisition_number: null,
        estimated_amount: amount,
        requested_amount: amount,
        encumbered_amount: 0,
        pending_cc_amount: 0,
        posted_amount: 0,
        status: "requested",
        request_type: "expense",
        is_credit_card: false,
        cc_workflow_status: null,
        procurement_status: "requested"
      })
      .select("id")
      .single();
    if (insertError || !inserted) return err(insertError?.message ?? "Could not create reimbursement.");

    if (budgetLine) {
      const { error: allocationError } = await supabase.from("purchase_allocations").insert({
        purchase_id: inserted.id as string,
        reporting_budget_line_id: budgetLine.id,
        account_code_id: bannerAccountCodeId || budgetLine.account_code_id,
        production_category_id: productionCategoryId,
        amount,
        reporting_bucket: "direct"
      });
      if (allocationError) return err(allocationError.message);
    }

    await createInstitutionalCommitmentForPurchase(supabase, inserted.id as string, user.id);

    const { error: eventError } = await supabase.from("purchase_events").insert({
      purchase_id: inserted.id as string,
      from_status: null,
      to_status: "requested" as PurchaseStatus,
      estimated_amount_snapshot: amount,
      requested_amount_snapshot: amount,
      encumbered_amount_snapshot: 0,
      pending_cc_amount_snapshot: 0,
      posted_amount_snapshot: 0,
      changed_by_user_id: user.id,
      note: "Reimbursement request created"
    });
    if (eventError) return err(eventError.message);

    revalidatePath("/cc");
    revalidatePath("/requests");
    revalidatePath("/");
    return ok("Reimbursement request saved.");
  } catch (error) {
    return err(getErrorMessage(error, "Could not save reimbursement request."));
  }
}

export async function addStatementLineAction(
  prevState: ActionState = emptyState,
  formData: FormData
): Promise<ActionState> {
  void prevState;
  try {
    const supabase = await getSupabaseServerClient();
    const statementMonthId = String(formData.get("statementMonthId") ?? "").trim();
    const projectBudgetLineId = String(formData.get("projectBudgetLineId") ?? "").trim();
    const organizationId = String(formData.get("organizationId") ?? "").trim();
    const bannerAccountCodeId = String(formData.get("bannerAccountCodeId") ?? "").trim();
    const amount = parseMoney(formData.get("amount"));
    const note = String(formData.get("note") ?? "").trim();

    if (!statementMonthId || (!projectBudgetLineId && (!organizationId || !bannerAccountCodeId))) {
      return err("Statement month and either a project budget line or organization account are required.");
    }
    if (projectBudgetLineId && organizationId) return err("Choose a project budget line or an organization account, not both.");
    if (amount === 0) return err("Amount must be non-zero.");

    const { data: statementMonth, error: statementMonthError } = await supabase
      .from("cc_statement_months")
      .select("id, fiscal_year_id")
      .eq("id", statementMonthId)
      .single();
    if (statementMonthError || !statementMonth) return err("Statement month not found.");

    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) return err("You must be signed in.");
    await requireCcManagerRole();
    if (organizationId) {
      await requireOrganizationMembership(supabase, statementMonth.fiscal_year_id as string, organizationId, {
        projectlessOnly: true
      });
    }

    const { error } = await supabase.from("cc_statement_lines").insert({
      statement_month_id: statementMonthId,
      fiscal_year_id: statementMonth.fiscal_year_id,
      project_budget_line_id: projectBudgetLineId || null,
      organization_id: organizationId || null,
      banner_account_code_id: bannerAccountCodeId || null,
      amount,
      note: note || null
    });
    if (error) return err(error.message);

    revalidatePath("/cc");
    return ok("Statement line added.");
  } catch (error) {
    return err(getErrorMessage(error, "Could not add statement line."));
  }
}

export async function confirmStatementLineMatchAction(
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

    const statementLineId = String(formData.get("statementLineId") ?? "").trim();
    const purchaseIds = formData
      .getAll("purchaseId")
      .map((value) => String(value).trim())
      .filter(Boolean);

    if (!statementLineId) return err("Statement line is required.");
    if (purchaseIds.length === 0) return err("Select at least one pending purchase to match.");

    const { data: statementLine, error: statementLineError } = await supabase
      .from("cc_statement_lines")
      .select("id, fiscal_year_id, organization_id, banner_account_code_id, amount, matched_purchase_ids, statement_month_id, project_budget_line_id")
      .eq("id", statementLineId)
      .single();
    if (statementLineError || !statementLine) return err("Statement line not found.");

    const { data: statementMonth, error: statementMonthError } = await supabase
      .from("cc_statement_months")
      .select("id, fiscal_year_id, credit_card_id, statement_month")
      .eq("id", statementLine.statement_month_id as string)
      .single();
    if (statementMonthError || !statementMonth) return err("Statement month not found.");
    await requireCcManagerRole();

    const { data: purchases, error: purchasesError } = await supabase
      .from("purchases")
      .select("id, fiscal_year_id, project_id, organization_id, banner_account_code_id, budget_line_id, status, pending_cc_amount, credit_card_id, estimated_amount, requested_amount")
      .in("id", purchaseIds);
    if (purchasesError) return err(purchasesError.message);
    if (!purchases || purchases.length !== purchaseIds.length) return err("One or more selected purchases were not found.");

    const selectedTotal = purchases.reduce((sum, purchase) => sum + Number(purchase.pending_cc_amount ?? 0), 0);
    const statementAmount = Number(statementLine.amount ?? 0);
    if (Math.abs(selectedTotal - statementAmount) > 0.01) {
      return err(`Selected purchases total ${selectedTotal.toFixed(2)} but statement line is ${statementAmount.toFixed(2)}.`);
    }

    for (const purchase of purchases) {
      if (purchase.fiscal_year_id !== statementMonth.fiscal_year_id || purchase.fiscal_year_id !== statementLine.fiscal_year_id) {
        return err("Statement line and purchases must belong to the same fiscal year.");
      }
      if (statementLine.project_budget_line_id) {
        if ((purchase.budget_line_id as string) !== (statementLine.project_budget_line_id as string)) {
          return err("All purchases must match the selected statement budget line.");
        }
      } else if (
        purchase.organization_id !== statementLine.organization_id ||
        purchase.banner_account_code_id !== statementLine.banner_account_code_id
      ) {
        return err("All purchases must match the statement organization and Banner account.");
      }
      if ((purchase.status as string) !== "pending_cc") {
        return err("Only pending credit-card purchases can be matched.");
      }
    }

    for (const purchase of purchases) {
      const pendingAmount = Number(purchase.pending_cc_amount ?? 0);
      const { error: updateError } = await supabase
        .from("purchases")
        .update({
          status: "pending_cc",
          posted_amount: 0,
          pending_cc_amount: pendingAmount,
          cc_workflow_status: "statement_paid",
          credit_card_id: (statementMonth.credit_card_id as string) ?? (purchase.credit_card_id as string | null),
          posted_date: null
        })
        .eq("id", purchase.id as string);
      if (updateError) return err(updateError.message);

      const { error: eventError } = await supabase.from("purchase_events").insert({
        purchase_id: purchase.id as string,
        from_status: "pending_cc",
        to_status: "pending_cc",
        estimated_amount_snapshot: Number(purchase.estimated_amount ?? 0),
        requested_amount_snapshot: Number(purchase.requested_amount ?? 0),
        encumbered_amount_snapshot: 0,
        pending_cc_amount_snapshot: pendingAmount,
        posted_amount_snapshot: 0,
        changed_by_user_id: user.id,
        note: `Statement paid ${(statementMonth.statement_month as string).slice(0, 7)}; awaiting accounts posting`
      });
      if (eventError) return err(eventError.message);
    }

    const matchedPurchaseIds = Array.from(new Set([...(statementLine.matched_purchase_ids as string[] | null | undefined) ?? [], ...purchaseIds]));
    const { error: lineUpdateError } = await supabase
      .from("cc_statement_lines")
      .update({ matched_purchase_ids: matchedPurchaseIds })
      .eq("id", statementLineId);
    if (lineUpdateError) return err(lineUpdateError.message);

    const { data: openLines, error: openLinesError } = await supabase
      .from("cc_statement_lines")
      .select("id, matched_purchase_ids")
      .eq("statement_month_id", statementMonth.id as string);
    if (openLinesError) return err(openLinesError.message);

    const allMatched = (openLines ?? []).every((line) => Array.isArray(line.matched_purchase_ids) && line.matched_purchase_ids.length > 0);
    if (allMatched) {
      await supabase.from("cc_statement_months").update({ posted_at: new Date().toISOString() }).eq("id", statementMonth.id as string);
    }

    revalidatePath("/cc");
    revalidatePath("/requests");
    revalidatePath("/");
    revalidatePath("/projects");
    return ok("Statement match posted.");
  } catch (error) {
    return err(getErrorMessage(error, "Could not match statement line."));
  }
}
