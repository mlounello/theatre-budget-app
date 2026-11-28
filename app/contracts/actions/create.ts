"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { createInstitutionalCommitmentForPurchase } from "@/lib/institutional-budget";
import { type ActionState, emptyState, ok, err, getErrorMessage, parseMoney } from "@/lib/action-helpers";
import { parseProductionProjectIds, getGuestArtistDefaults, parseEngagementType, parseCompensationBasis, payrollSchedule, parseInstallmentCount, guestCheckDefaults, checkRequestValues, installmentCheckRequestValues, loadUnionCalculation, artistInstallmentAmounts, ensurePmOrAdmin, validateProductionProjectFiscalYear, parseContractSessions, parseHrOnboardingStatus, nullableFormText, uploadContractW9, syncContractProductions, installmentScheduleValues, contractPaymentOrderDate, isMissingInstallmentScheduleColumn, createUnionContributionRows } from "@/app/contracts/actions/_shared";

type BulkContractLine = {
  contractorName: string;
  contractValue: string;
  installmentCount?: string;
};

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

export async function createContractAction(
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

    const projectId = String(formData.get("projectId") ?? "").trim();
    const productionProjectIds = parseProductionProjectIds(formData, projectId);
    const guestArtistId = String(formData.get("guestArtistId") ?? "").trim();
    const fiscalYearId = String(formData.get("fiscalYearId") ?? "").trim();
    const organizationId = String(formData.get("organizationId") ?? "").trim();
    const bannerAccountCodeId = String(formData.get("bannerAccountCodeId") ?? "").trim();
    const guestArtist = await getGuestArtistDefaults(supabase, guestArtistId);
    if (guestArtistId && !guestArtist) return err("Selected guest artist profile was not found or is inactive.");

    const contractorName = String(formData.get("contractorName") ?? "").trim() || guestArtist?.display_name || "";
    const contractorEmployeeId = String(formData.get("contractorEmployeeId") ?? "").trim() || guestArtist?.vendor_number || "";
    const contractorEmail = String(formData.get("contractorEmail") ?? "").trim() || guestArtist?.email || "";
    const contractorPhone = String(formData.get("contractorPhone") ?? "").trim() || guestArtist?.phone || "";
    const contractValue = parseMoney(formData.get("contractValue"));
    const engagementType = parseEngagementType(formData.get("engagementType"));
    const compensationBasis = engagementType === "temporary_employee" ? "flat_fee" : parseCompensationBasis(formData.get("compensationBasis"));
    const payrollDates = payrollSchedule(formData, engagementType);
    const installmentCount = payrollDates?.length ?? parseInstallmentCount(formData.get("installmentCount"));
    const notes = String(formData.get("notes") ?? "").trim();
    const guestTax = guestArtist
      ? { encrypted: guestArtist.tax_id_encrypted, last4: guestArtist.tax_id_last4 }
      : undefined;
    const checkDefaults = guestCheckDefaults(guestArtist);
    const contractCheckRequestValues = checkRequestValues(formData, guestTax, checkDefaults);
    const installmentCheckRequestDefaults = installmentCheckRequestValues(formData, guestTax, checkDefaults);

    if (!projectId) return err("Project is required.");
    if (!bannerAccountCodeId) return err("Banner account code is required.");
    if (!contractorName) return err("Contracted employee name is required.");
    if (contractValue === 0) return err("Contract value must be non-zero.");
    if (engagementType === "independent_contractor" && installmentCount > 2) {
      return err("Independent Contractor Agreements use one or two payments.");
    }

    const unionCalculation = await loadUnionCalculation(
      supabase,
      formData,
      contractValue,
      guestArtist?.default_union_agreement_id ?? null
    );
    const installmentAmounts = artistInstallmentAmounts(contractValue, installmentCount, unionCalculation);

    await ensurePmOrAdmin(projectId, user.id);

    const { data: projectRow, error: projectError } = await supabase
      .from("projects")
      .select("id, organization_id, fiscal_year_id")
      .eq("id", projectId)
      .single();
    if (projectError || !projectRow) return err("Project not found.");

    const resolvedOrganizationId = organizationId || ((projectRow.organization_id as string | null) ?? null);
    const resolvedFiscalYearId = fiscalYearId || ((projectRow.fiscal_year_id as string | null) ?? null);
    if (!resolvedOrganizationId) return err("Select an organization for this hiring record before saving its payments.");
    const productionFiscalYearError = await validateProductionProjectFiscalYear(
      supabase,
      productionProjectIds,
      resolvedFiscalYearId
    );
    if (productionFiscalYearError) return err(productionFiscalYearError);

    const { data: miscCategory, error: miscCategoryError } = await supabase
      .from("production_categories")
      .select("id")
      .ilike("name", "Miscellaneous")
      .order("active", { ascending: false })
      .order("sort_order", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (miscCategoryError) return err(miscCategoryError.message);
    if (!miscCategory?.id) return err("Production category 'Miscellaneous' is required for contract reporting.");
    const miscCategoryId = miscCategory.id as string;

    const { data: reportingBudgetLineId, error: lineError } = await supabase.rpc("ensure_project_category_line", {
      p_project_id: projectId,
      p_production_category_id: miscCategoryId
    });
    if (lineError || !reportingBudgetLineId) return err(lineError?.message ?? "Could not resolve reporting line.");

    const { data: contract, error: contractError } = await supabase
      .from("contracts")
      .insert({
        fiscal_year_id: resolvedFiscalYearId,
        organization_id: resolvedOrganizationId,
        project_id: projectId,
        production_project_id: productionProjectIds[0],
        banner_account_code_id: bannerAccountCodeId,
        guest_artist_id: guestArtist?.id ?? null,
        production_category_id: miscCategoryId,
        entered_by_user_id: user.id,
        contractor_name: contractorName,
        contractor_employee_id: contractorEmployeeId || null,
        contractor_email: contractorEmail || null,
        contractor_phone: contractorPhone || null,
        contract_value: contractValue,
        installment_count: installmentCount,
        contract_session: parseContractSessions(formData),
        is_union: Boolean(unionCalculation),
        engagement_type: engagementType,
        compensation_basis: compensationBasis,
        hr_onboarding_status: parseHrOnboardingStatus(formData.get("hrOnboardingStatus"), engagementType),
        hr_onboarding_reference: nullableFormText(formData, "hrOnboardingReference"),
        employment_start_date: nullableFormText(formData, "employmentStartDate"),
        employment_end_date: nullableFormText(formData, "employmentEndDate"),
        payroll_first_pay_date: nullableFormText(formData, "payrollFirstPayDate"),
        payroll_frequency: "biweekly",
        union_agreement_id: unionCalculation?.agreementId ?? null,
        union_agreement_name_snapshot: unionCalculation?.agreementName ?? null,
        union_signature_status: "not_started",
        ...contractCheckRequestValues,
        workflow_status: "w9_requested",
        notes: notes || null
      } as never)
      .select("id")
      .single();
    if (contractError || !contract) return err(contractError?.message ?? "Could not create contract.");
    const w9AttachmentPath = await uploadContractW9(supabase, contract.id as string, formData);
    if (w9AttachmentPath) {
      const { error: w9UpdateError } = await supabase.from("contracts").update({ w9_attachment_path: w9AttachmentPath } as never).eq("id", contract.id as string);
      if (w9UpdateError) return err(w9UpdateError.message);
    }
    await syncContractProductions(supabase, contract.id as string, productionProjectIds);

    for (let index = 0; index < installmentAmounts.length; index += 1) {
      const installmentNumber = index + 1;
      const installmentAmount = installmentAmounts[index];
      const installmentTitle = `${contractorName} Contract Payment ${installmentNumber}/${installmentCount}`;
      const scheduleValues = payrollDates
        ? { due_date: payrollDates[index], ap_receive_by: null, mail_by: null }
        : installmentScheduleValues(formData, installmentNumber);

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
          requested_amount: installmentAmount,
          encumbered_amount: 0,
          pending_cc_amount: 0,
          posted_amount: 0,
          status: "requested",
          request_type: "contract_payment",
          is_credit_card: false,
          ordered_on: contractPaymentOrderDate(scheduleValues),
          procurement_status: "requested",
          notes: `Contract installment ${installmentNumber}/${installmentCount}`
        })
        .select("id")
        .single();
      if (purchaseError || !purchase) return err(purchaseError?.message ?? "Could not create linked payment row.");

      const { error: allocationError } = await supabase.from("purchase_allocations").insert({
        purchase_id: purchase.id,
        project_id: projectId,
        organization_id: resolvedOrganizationId,
        reporting_budget_line_id: reportingBudgetLineId as string,
        account_code_id: bannerAccountCodeId,
        production_category_id: miscCategoryId,
        amount: installmentAmount,
        reporting_bucket: "direct",
        note: "Contract installment allocation"
      });
      if (allocationError) return err(allocationError.message);

      const installmentInsert = {
        contract_id: contract.id,
        purchase_id: purchase.id,
        installment_number: installmentNumber,
        installment_amount: installmentAmount,
        payment_channel: engagementType === "temporary_employee" ? "payroll" : "check_request",
        ...scheduleValues,
        ...installmentCheckRequestDefaults,
        status: "planned"
      };
      let { error: installmentError } = await supabase.from("contract_installments").insert(installmentInsert);
      if (isMissingInstallmentScheduleColumn(installmentError)) {
        const { due_date: _dueDate, ap_receive_by: _apReceiveBy, mail_by: _mailBy, ...fallbackInsert } = installmentInsert;
        void _dueDate;
        void _apReceiveBy;
        void _mailBy;
        ({ error: installmentError } = await supabase.from("contract_installments").insert(fallbackInsert));
      }
      if (installmentError) return err(installmentError.message);

      await createInstitutionalCommitmentForPurchase(supabase, purchase.id as string, user.id);
    }

    if (unionCalculation) {
      await createUnionContributionRows(supabase, {
        contractId: contract.id as string,
        projectId,
        organizationId: resolvedOrganizationId,
        bannerAccountCodeId,
        productionCategoryId: miscCategoryId,
        reportingBudgetLineId: reportingBudgetLineId as string,
        userId: user.id,
        calculation: unionCalculation,
        contractValue
      });
    }

    revalidatePath("/contracts");
    revalidatePath("/");
    revalidatePath("/overview");
    revalidatePath(`/projects/${projectId}`);
    return ok("Contract saved.");
  } catch (error) {
    return err(getErrorMessage(error, "Could not save contract."));
  }
}

export async function createContractsBulkAction(
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

    const projectId = String(formData.get("projectId") ?? "").trim();
    const fiscalYearId = String(formData.get("fiscalYearId") ?? "").trim();
    const organizationId = String(formData.get("organizationId") ?? "").trim();
    const bannerAccountCodeId = String(formData.get("bannerAccountCodeId") ?? "").trim();
    const rows = parseBulkContractLines(formData.get("linesJson"));

    if (!projectId) return err("Project is required.");
    if (!bannerAccountCodeId) return err("Banner account code is required.");
    if (rows.length === 0) return err("Add at least one contract row.");
    if (rows.some((row) => parseInstallmentCount(row.installmentCount ?? "1") > 2)) {
      return err("Bulk Independent Contractor Agreements use one or two payments.");
    }

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
    if (createError) return err(createError.message);

    revalidatePath("/contracts");
    revalidatePath("/");
    revalidatePath("/overview");
    revalidatePath(`/projects/${projectId}`);
    return ok(`Saved ${Number(createdCount ?? rows.length)} contracts.`);
  } catch (error) {
    return err(getErrorMessage(error, "Could not save bulk contracts."));
  }
}
