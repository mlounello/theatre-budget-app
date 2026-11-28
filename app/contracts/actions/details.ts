"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { getAccessContext } from "@/lib/access";
import { createInstitutionalCommitmentForPurchase } from "@/lib/institutional-budget";
import type { PurchaseStatus } from "@/lib/types";
import { type ActionState, emptyState, ok, err, getErrorMessage, parseMoney } from "@/lib/action-helpers";
import { type InstallmentStatus, ensurePmOrAdmin, parseProductionProjectIds, getGuestArtistDefaults, parseEngagementType, parseCompensationBasis, payrollSchedule, parseInstallmentCount, loadUnionCalculation, validateProductionProjectFiscalYear, guestCheckDefaults, checkRequestValues, installmentCheckRequestValues, uploadContractW9, parseContractSessions, parseHrOnboardingStatus, nullableFormText, syncContractProductions, artistInstallmentAmounts, installmentScheduleValues, contractPaymentOrderDate, isMissingInstallmentScheduleColumn, createUnionContributionRows } from "@/app/contracts/actions/_shared";

type ContractWorkflowStatus = "w9_requested" | "contract_sent" | "contract_signed_returned" | "siena_signed" | "cancelled";

function parseWorkflowStatus(value: FormDataEntryValue | null): ContractWorkflowStatus {
  const raw = String(value ?? "w9_requested").trim().toLowerCase();
  if (raw === "contract_sent" || raw === "contract_signed_returned" || raw === "siena_signed" || raw === "cancelled") return raw;
  return "w9_requested";
}

function purchaseStatusForInstallmentStatus(status: InstallmentStatus): PurchaseStatus {
  if (status === "cancelled") return "cancelled";
  if (status === "check_paid") return "posted";
  if (status === "check_request_submitted") return "encumbered";
  return "requested";
}

function contractPaymentRequestedAmount(status: PurchaseStatus, amount: number): number {
  return status === "requested" ? amount : 0;
}

function contractPaymentEncumberedAmount(status: PurchaseStatus, amount: number): number {
  return status === "encumbered" ? amount : 0;
}

function contractPaymentPostedAmount(status: PurchaseStatus, amount: number): number {
  return status === "posted" ? amount : 0;
}

export async function updateContractVendorIdAction(
  prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  void prevState;
  try {
    const supabase = await getSupabaseServerClient();
    const access = await getAccessContext();
    if (!access.userId) return err("You must be signed in.");
    if (access.isImpersonating) return err("Exit impersonation before editing a vendor ID.");

    const contractId = String(formData.get("contractId") ?? "").trim();
    const vendorId = String(formData.get("contractorEmployeeId") ?? "").trim();
    if (!contractId || !vendorId) return err("Enter a vendor or employee ID.");

    const { data: contract, error } = await supabase.from("contracts")
      .select("id, project_id").eq("id", contractId).maybeSingle();
    if (error || !contract?.project_id) return err("Contract not found.");
    await ensurePmOrAdmin(String(contract.project_id), access.userId);

    const { data: updated, error: updateError } = await supabase.from("contracts")
      .update({ contractor_employee_id: vendorId })
      .eq("id", contractId)
      .eq("project_id", contract.project_id)
      .select("id")
      .maybeSingle();
    if (updateError || !updated) return err(updateError?.message ?? "Vendor ID was not saved.");
    revalidatePath("/contracts");
    return ok("Vendor / Employee ID saved.");
  } catch (error) {
    return err(getErrorMessage(error, "Could not save the vendor ID."));
  }
}

export async function updateContractDetailsAction(
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

    const contractId = String(formData.get("contractId") ?? "").trim();
    const guestArtistId = String(formData.get("guestArtistId") ?? "").trim();
    const projectId = String(formData.get("projectId") ?? "").trim();
    const productionProjectIds = parseProductionProjectIds(formData, projectId);
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

    if (!contractId) return err("Contract id is required.");
    if (!projectId) return err("Project is required.");
    if (!bannerAccountCodeId) return err("Banner account code is required.");
    if (!contractorName) return err("Contracted employee name is required.");
    if (contractValue === 0) return err("Contract value must be non-zero.");

    const unionCalculation = await loadUnionCalculation(
      supabase,
      formData,
      contractValue,
      guestArtist?.default_union_agreement_id ?? null
    );

    const { data: existing, error: existingError } = await supabase
      .from("contracts")
      .select("id, project_id, installment_count, production_category_id, tax_id_encrypted, tax_id_last4, is_union, union_agreement_id, w9_attachment_path")
      .eq("id", contractId)
      .single();
    if (existingError || !existing) return err("Contract not found.");

    await ensurePmOrAdmin(existing.project_id as string, user.id);
    if ((existing.project_id as string) !== projectId) {
      await ensurePmOrAdmin(projectId, user.id);
    }

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
    const productionCategoryId = (existing.production_category_id as string | null) ?? null;
    if (!productionCategoryId) return err("Contract production category is missing.");
    const taxSource = guestArtist
      ? { encrypted: guestArtist.tax_id_encrypted, last4: guestArtist.tax_id_last4 }
      : {
          encrypted: (existing.tax_id_encrypted as string | null) ?? null,
          last4: (existing.tax_id_last4 as string | null) ?? null
        };
    const checkDefaults = guestCheckDefaults(guestArtist);
    const contractCheckRequestValues = checkRequestValues(formData, taxSource, checkDefaults);
    const installmentCheckRequestDefaults = installmentCheckRequestValues(formData, taxSource, checkDefaults);
    const w9AttachmentPath = await uploadContractW9(
      supabase,
      contractId,
      formData,
      (existing.w9_attachment_path as string | null) ?? null
    );

    const { data: reportingBudgetLineId, error: lineError } = await supabase.rpc("ensure_project_category_line", {
      p_project_id: projectId,
      p_production_category_id: productionCategoryId
    });
    if (lineError || !reportingBudgetLineId) return err(lineError?.message ?? "Could not resolve reporting line.");

    const { data: installments, error: installmentsError } = await supabase
      .from("contract_installments")
      .select("id, purchase_id, installment_number, status")
      .eq("contract_id", contractId)
      .order("installment_number", { ascending: true });
    if (installmentsError) return err(installmentsError.message);

    const installmentsList = installments ?? [];
    const { data: existingUnionContributions, error: existingUnionError } = await supabase
      .from("contract_union_contributions")
      .select("id, purchase_id, status")
      .eq("contract_id", contractId);
    if (existingUnionError) return err(existingUnionError.message);
    if ((existingUnionContributions ?? []).some((contribution) => contribution.status !== "planned")) {
      return err("Union fund payments are locked after a check request is submitted or paid.");
    }
    const removedInstallments = installmentsList.filter((installment) => Number(installment.installment_number ?? 1) > installmentCount);
    const removedPurchaseIds = removedInstallments
      .map((installment) => (installment.purchase_id as string | null) ?? null)
      .filter((id): id is string => Boolean(id));

    if (removedInstallments.some((installment) => ((installment.status as string | null) ?? "planned") !== "planned")) {
      return err("Cannot reduce installments after an extra installment has been submitted or paid.");
    }

    if (removedPurchaseIds.length > 0) {
      const { data: removedPurchases, error: removedPurchasesError } = await supabase
        .from("purchases")
        .select("id, status, procurement_status")
        .in("id", removedPurchaseIds);
      if (removedPurchasesError) return err(removedPurchasesError.message);
      const unsafePurchase = (removedPurchases ?? []).find(
        (purchase) =>
          String(purchase.status ?? "requested") !== "requested" ||
          String(purchase.procurement_status ?? "requested") !== "requested"
      );
      if (unsafePurchase) {
        return err("Cannot reduce installments after an extra linked payment row has moved beyond requested status.");
      }
    }

    const oldUnionPurchaseIds = (existingUnionContributions ?? [])
      .map((contribution) => (contribution.purchase_id as string | null) ?? null)
      .filter((id): id is string => Boolean(id));
    if ((existingUnionContributions ?? []).length > 0) {
      const { error: contributionDeleteError } = await supabase
        .from("contract_union_contributions")
        .delete()
        .eq("contract_id", contractId);
      if (contributionDeleteError) return err(contributionDeleteError.message);
    }
    if (oldUnionPurchaseIds.length > 0) {
      const { error: purchaseDeleteError } = await supabase.from("purchases").delete().in("id", oldUnionPurchaseIds);
      if (purchaseDeleteError) return err(purchaseDeleteError.message);
    }

    const { data: contractUpdated, error: contractUpdateError } = await supabase
      .from("contracts")
      .update({
        fiscal_year_id: resolvedFiscalYearId,
        organization_id: resolvedOrganizationId,
        project_id: projectId,
        production_project_id: productionProjectIds[0],
        banner_account_code_id: bannerAccountCodeId,
        guest_artist_id: guestArtist?.id ?? null,
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
        w9_attachment_path: w9AttachmentPath,
        employment_start_date: nullableFormText(formData, "employmentStartDate"),
        employment_end_date: nullableFormText(formData, "employmentEndDate"),
        payroll_first_pay_date: nullableFormText(formData, "payrollFirstPayDate"),
        payroll_frequency: "biweekly",
        union_agreement_id: unionCalculation?.agreementId ?? null,
        union_agreement_name_snapshot: unionCalculation?.agreementName ?? null,
        ...contractCheckRequestValues,
        notes: notes || null
      } as never)
      .eq("id", contractId)
      .select("id")
      .maybeSingle();
    if (contractUpdateError) return err(contractUpdateError.message);
    if (!contractUpdated?.id) return err("Contract update was not applied.");
    await syncContractProductions(supabase, contractId, productionProjectIds);

    for (const installment of removedInstallments) {
      const purchaseId = (installment.purchase_id as string | null) ?? null;
      const { error: installmentDeleteError } = await supabase
        .from("contract_installments")
        .delete()
        .eq("id", installment.id as string);
      if (installmentDeleteError) return err(installmentDeleteError.message);

      if (purchaseId) {
        const { error: purchaseDeleteError } = await supabase.from("purchases").delete().eq("id", purchaseId);
        if (purchaseDeleteError) return err(purchaseDeleteError.message);
      }
    }

    const retainedInstallments = installmentsList.filter((installment) => Number(installment.installment_number ?? 1) <= installmentCount);
    const existingNumbers = new Set(retainedInstallments.map((installment) => Number(installment.installment_number ?? 1)));
    const parts = artistInstallmentAmounts(contractValue, installmentCount, unionCalculation);

    for (let installmentNumber = 1; installmentNumber <= installmentCount; installmentNumber += 1) {
      if (existingNumbers.has(installmentNumber)) continue;
      const installmentAmount = parts[installmentNumber - 1] ?? 0;
      const installmentTitle = `${contractorName} Contract Payment ${installmentNumber}/${installmentCount}`;
      const scheduleValues = payrollDates
        ? { due_date: payrollDates[installmentNumber - 1], ap_receive_by: null, mail_by: null }
        : installmentScheduleValues(formData, installmentNumber);

      const { data: purchase, error: purchaseError } = await supabase
        .from("purchases")
        .insert({
          project_id: projectId,
          organization_id: resolvedOrganizationId,
          budget_line_id: reportingBudgetLineId as string,
          production_category_id: productionCategoryId,
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
        production_category_id: productionCategoryId,
        amount: installmentAmount,
        reporting_bucket: "direct",
        note: "Contract installment allocation"
      });
      if (allocationError) return err(allocationError.message);

      const installmentInsert = {
        contract_id: contractId,
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

    const { data: updatedInstallments, error: updatedInstallmentsError } = await supabase
      .from("contract_installments")
      .select("id, purchase_id, installment_number, status")
      .eq("contract_id", contractId)
      .order("installment_number", { ascending: true });
    if (updatedInstallmentsError) return err(updatedInstallmentsError.message);

    for (const installment of updatedInstallments ?? []) {
      const index = Number(installment.installment_number ?? 1) - 1;
      const installmentAmount = parts[index] ?? 0;
      const installmentStatus = ((installment.status as string | null) ?? "planned") as InstallmentStatus;

      const installmentUpdate = {
        installment_amount: installmentAmount,
        payment_channel: engagementType === "temporary_employee" ? "payroll" : "check_request",
        ...(payrollDates
          ? {
              due_date: payrollDates[Number(installment.installment_number ?? 1) - 1] ?? null,
              ap_receive_by: null,
              mail_by: null
            }
          : installmentScheduleValues(formData, Number(installment.installment_number ?? 1))),
        ...installmentCheckRequestDefaults,
        ...(installmentStatus === "planned"
          ? {
              automation_status: "not_ready",
              automation_ready_at: null,
              automation_ready_by_user_id: null,
              automation_last_error: null
            }
          : {})
      };
      const nextOrderDate = contractPaymentOrderDate(installmentUpdate);
      let { data: installmentUpdated, error: installmentUpdateError } = await supabase
        .from("contract_installments")
        .update(installmentUpdate)
        .eq("id", installment.id as string)
        .select("id")
        .maybeSingle();
      if (isMissingInstallmentScheduleColumn(installmentUpdateError)) {
        const { due_date: _dueDate, ap_receive_by: _apReceiveBy, mail_by: _mailBy, ...fallbackUpdate } = installmentUpdate;
        void _dueDate;
        void _apReceiveBy;
        void _mailBy;
        ({ data: installmentUpdated, error: installmentUpdateError } = await supabase
          .from("contract_installments")
          .update(fallbackUpdate)
          .eq("id", installment.id as string)
          .select("id")
          .maybeSingle());
      }
      if (installmentUpdateError) return err(installmentUpdateError.message);
      if (!installmentUpdated?.id) return err("Installment amount update was not applied.");

      if (!installment.purchase_id) continue;

      const purchaseId = installment.purchase_id as string;
      const nextStatus = purchaseStatusForInstallmentStatus(installmentStatus);
      const requestedAmount = contractPaymentRequestedAmount(nextStatus, installmentAmount);
      const encumberedAmount = contractPaymentEncumberedAmount(nextStatus, installmentAmount);
      const postedAmount = contractPaymentPostedAmount(nextStatus, installmentAmount);

      const { data: purchaseUpdated, error: purchaseUpdateError } = await supabase
        .from("purchases")
        .update({
          project_id: projectId,
          organization_id: resolvedOrganizationId,
          budget_line_id: reportingBudgetLineId as string,
          production_category_id: productionCategoryId,
          banner_account_code_id: bannerAccountCodeId,
          title: `${contractorName} ${engagementType === "temporary_employee" ? "Payroll" : "Contract Payment"} ${installment.installment_number as number}/${installmentCount}`,
          estimated_amount: installmentAmount,
          requested_amount: requestedAmount,
          encumbered_amount: encumberedAmount,
          pending_cc_amount: 0,
          posted_amount: postedAmount,
          ordered_on: nextOrderDate,
          status: nextStatus,
          procurement_status: nextStatus === "cancelled" ? "cancelled" : nextStatus === "posted" ? "paid" : nextStatus === "encumbered" ? "ordered" : "requested",
          posted_date: nextStatus === "posted" ? new Date().toISOString().slice(0, 10) : null
        })
        .eq("id", purchaseId)
        .select("id")
        .maybeSingle();
      if (purchaseUpdateError) return err(purchaseUpdateError.message);
      if (!purchaseUpdated?.id) return err("Linked purchase update was not applied.");

      const { data: allocationUpdated, error: allocationUpdateError } = await supabase
        .from("purchase_allocations")
        .update({
          project_id: projectId,
          organization_id: resolvedOrganizationId,
          reporting_budget_line_id: reportingBudgetLineId as string,
          account_code_id: bannerAccountCodeId,
          production_category_id: productionCategoryId,
          amount: installmentAmount
        })
        .eq("purchase_id", purchaseId)
        .select("id")
        .limit(1);
      if (allocationUpdateError) return err(allocationUpdateError.message);
      if (!allocationUpdated || allocationUpdated.length === 0) return err("Linked allocation update was not applied.");

      await createInstitutionalCommitmentForPurchase(supabase, purchaseId, user.id);
    }

    if (unionCalculation) {
      await createUnionContributionRows(supabase, {
        contractId,
        projectId,
        organizationId: resolvedOrganizationId,
        bannerAccountCodeId,
        productionCategoryId,
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
    return ok("Contract updated.");
  } catch (error) {
    return err(getErrorMessage(error, "Could not update contract."));
  }
}

export async function updateContractWorkflowAction(
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

    const contractId = String(formData.get("contractId") ?? "").trim();
    const workflowStatus = parseWorkflowStatus(formData.get("workflowStatus"));
    if (!contractId) return err("Contract id is required.");

    const { data: contract, error: contractError } = await supabase
      .from("contracts")
      .select("id, project_id, engagement_type")
      .eq("id", contractId)
      .single();
    if (contractError || !contract) return err("Contract not found.");
    const projectId = contract.project_id as string;

    await ensurePmOrAdmin(projectId, user.id);

    const { data: updated, error: updateError } = await supabase
      .from("contracts")
      .update({
        workflow_status: workflowStatus,
        ...(contract.engagement_type === "temporary_employee"
          ? {
              hr_onboarding_status:
                workflowStatus === "contract_sent"
                  ? "submitted_to_hr"
                  : workflowStatus === "contract_signed_returned"
                    ? "onboarding"
                    : workflowStatus === "siena_signed"
                      ? "complete"
                      : "not_started"
            }
          : {})
      })
      .eq("id", contractId)
      .select("id")
      .maybeSingle();
    if (updateError) return err(updateError.message);
    if (!updated?.id) return err("Contract workflow update was not applied.");

    if (workflowStatus !== "siena_signed") {
      await Promise.all([
        supabase.from("contract_installments").update({ automation_status: "not_ready", automation_ready_at: null, automation_ready_by_user_id: null }).eq("contract_id", contractId).eq("automation_status", "ready"),
        supabase.from("contract_union_contributions").update({ automation_status: "not_ready", automation_ready_at: null, automation_ready_by_user_id: null }).eq("contract_id", contractId).eq("automation_status", "ready")
      ]);
    }

    if (workflowStatus === "cancelled") {
      const [{ data: plannedInstallments, error: installmentLookupError }, { data: plannedContributions, error: contributionLookupError }] = await Promise.all([
        supabase.from("contract_installments").select("id, purchase_id").eq("contract_id", contractId).eq("status", "planned"),
        supabase.from("contract_union_contributions").select("id, purchase_id").eq("contract_id", contractId).eq("status", "planned")
      ]);
      if (installmentLookupError) return err(installmentLookupError.message);
      if (contributionLookupError) return err(contributionLookupError.message);

      const installmentIds = (plannedInstallments ?? []).map((row) => row.id as string);
      const contributionIds = (plannedContributions ?? []).map((row) => row.id as string);
      const purchaseIds = [...(plannedInstallments ?? []), ...(plannedContributions ?? [])]
        .map((row) => (row.purchase_id as string | null) ?? null)
        .filter((id): id is string => Boolean(id));

      if (purchaseIds.length > 0) {
        const { error: purchaseCancelError } = await supabase
          .from("purchases")
          .update({
            status: "cancelled",
            requested_amount: 0,
            encumbered_amount: 0,
            pending_cc_amount: 0,
            posted_amount: 0,
            posted_date: null,
            procurement_status: "cancelled"
          })
          .in("id", purchaseIds);
        if (purchaseCancelError) return err(purchaseCancelError.message);
        for (const purchaseId of purchaseIds) {
          await createInstitutionalCommitmentForPurchase(supabase, purchaseId, user.id);
        }
      }
      if (installmentIds.length > 0) {
        const { error: installmentCancelError } = await supabase
          .from("contract_installments")
          .update({ status: "cancelled", automation_status: "not_ready", automation_ready_at: null, automation_ready_by_user_id: null })
          .in("id", installmentIds);
        if (installmentCancelError) return err(installmentCancelError.message);
      }
      if (contributionIds.length > 0) {
        const { error: contributionCancelError } = await supabase
          .from("contract_union_contributions")
          .update({ status: "cancelled", automation_status: "not_ready", automation_ready_at: null, automation_ready_by_user_id: null })
          .in("id", contributionIds);
        if (contributionCancelError) return err(contributionCancelError.message);
      }
    }

    revalidatePath("/contracts");
    return ok("Contract workflow updated.");
  } catch (error) {
    return err(getErrorMessage(error, "Could not update contract workflow."));
  }
}
