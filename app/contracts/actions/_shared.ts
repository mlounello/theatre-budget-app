import { getSupabaseServerClient } from "@/lib/supabase-server";
import { getAccessContext } from "@/lib/access";
import { calculateCheckRequestSchedule } from "@/lib/check-request-schedule";
import { createInstitutionalCommitmentForPurchase } from "@/lib/institutional-budget";
import { encryptSensitiveValue, taxIdLastFour } from "@/lib/sensitive-encryption";

export type InstallmentStatus = "planned" | "check_request_submitted" | "check_paid" | "cancelled";

export type CheckRequestHandling = "mail" | "business_affairs_pickup" | "other";

export type ContractSession = "summer" | "fall" | "winter" | "spring";

export type EngagementType = "independent_contractor" | "union_freelance_artist" | "temporary_employee";

export type CompensationBasis = "flat_fee" | "hourly";

export type HrOnboardingStatus = "not_started" | "submitted_to_hr" | "onboarding" | "complete" | "not_required";

export type GuestArtistDefaults = {
  id: string;
  display_name: string;
  vendor_number: string | null;
  email: string | null;
  phone: string | null;
  default_foapal_id: string | null;
  default_check_request_handling: CheckRequestHandling;
  default_check_request_other_location: string | null;
  vendor_address1: string | null;
  vendor_address2: string | null;
  vendor_address3: string | null;
  tax_id_encrypted: string | null;
  tax_id_last4: string | null;
  is_union: boolean;
  default_union_agreement_id: string | null;
};

export type UnionCalculationRule = {
  agreementFundId: string;
  unionFundId: string;
  fundName: string;
  vendorNumber: string | null;
  foapalId: string | null;
  checkRequestHandling: CheckRequestHandling;
  checkRequestOtherLocation: string | null;
  vendorAddress1: string | null;
  vendorAddress2: string | null;
  vendorAddress3: string | null;
  taxIdEncrypted: string | null;
  taxIdLast4: string | null;
  contributionType: "employer_paid" | "artist_withholding";
  percentage: number;
  amount: number;
  dueDate: string | null;
  apReceiveBy: string | null;
  mailBy: string | null;
};

export type UnionCalculation = {
  agreementId: string;
  agreementName: string;
  totalWithholding: number;
  rules: UnionCalculationRule[];
};

export function parseInstallmentCount(value: FormDataEntryValue | null): number {
  const parsed = Number.parseInt(String(value ?? "1"), 10);
  if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 4) return parsed;
  return 1;
}

export function payrollSchedule(formData: FormData, engagementType: EngagementType): string[] | null {
  if (engagementType !== "temporary_employee") return null;
  const start = nullableFormText(formData, "employmentStartDate");
  const end = nullableFormText(formData, "employmentEndDate");
  const firstPay = nullableFormText(formData, "payrollFirstPayDate");
  if (!start || !end || !firstPay) throw new Error("Temporary employees require start, end, and first pay dates.");
  if (end < start) throw new Error("Employment end date must be on or after the start date.");
  if (firstPay < start || firstPay > end) throw new Error("The first pay date must fall within the employment dates.");
  const dates: string[] = [];
  const cursor = new Date(`${firstPay}T12:00:00Z`);
  const last = new Date(`${end}T12:00:00Z`);
  while (cursor <= last && dates.length < 40) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 14);
  }
  if (dates.length === 0) throw new Error("The employment dates do not contain a payroll date.");
  return dates;
}

export async function uploadContractW9(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  contractId: string,
  formData: FormData,
  existingPath: string | null = null
): Promise<string | null> {
  const file = formData.get("w9Attachment");
  if (!(file instanceof File) || file.size === 0) return existingPath;
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    throw new Error("The W-9 must be uploaded as a PDF.");
  }
  if (file.size > 10 * 1024 * 1024) throw new Error("The W-9 PDF must be 10 MB or smaller.");
  const path = `${contractId}/${Date.now()}-w9.pdf`;
  const { error } = await supabase.storage.from("contract-w9s").upload(path, file, {
    contentType: "application/pdf",
    upsert: false
  });
  if (error) throw new Error(`W-9 upload failed: ${error.message}`);
  if (existingPath && existingPath !== path) await supabase.storage.from("contract-w9s").remove([existingPath]);
  return path;
}

export function parseCheckRequestHandling(value: FormDataEntryValue | null): CheckRequestHandling {
  const raw = String(value ?? "mail").trim();
  if (raw === "business_affairs_pickup" || raw === "other") return raw;
  return "mail";
}

export function parseContractSessions(formData: FormData): ContractSession[] {
  const valid = new Set<ContractSession>(["summer", "fall", "winter", "spring"]);
  return Array.from(
    new Set(
      formData
        .getAll("contractSessions")
        .map((value) => String(value).trim().toLowerCase())
        .filter((value): value is ContractSession => valid.has(value as ContractSession))
    )
  );
}

export function parseProductionProjectIds(formData: FormData, accountingProjectId: string): string[] {
  const selected = Array.from(
    new Set(
      formData
        .getAll("productionProjectIds")
        .map((value) => String(value).trim())
        .filter(Boolean)
    )
  );
  return selected.length > 0 ? selected : [accountingProjectId];
}

export function formIsUnion(formData: FormData): boolean {
  return parseEngagementType(formData.get("engagementType")) === "union_freelance_artist" ||
    formData.getAll("isUnion").some((value) => value === "true" || value === "on");
}

export function parseEngagementType(value: FormDataEntryValue | null): EngagementType {
  const raw = String(value ?? "independent_contractor").trim();
  if (raw === "union_freelance_artist" || raw === "temporary_employee") return raw;
  return "independent_contractor";
}

export function parseCompensationBasis(value: FormDataEntryValue | null): CompensationBasis {
  return String(value ?? "flat_fee").trim() === "hourly" ? "hourly" : "flat_fee";
}

export function parseHrOnboardingStatus(value: FormDataEntryValue | null, engagementType: EngagementType): HrOnboardingStatus {
  if (engagementType !== "temporary_employee") return "not_required";
  const raw = String(value ?? "not_started").trim();
  if (raw === "submitted_to_hr" || raw === "onboarding" || raw === "complete") return raw;
  return "not_started";
}

export async function loadUnionCalculation(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  formData: FormData,
  contractValue: number,
  defaultAgreementId: string | null
): Promise<UnionCalculation | null> {
  if (!formIsUnion(formData)) return null;
  const agreementId = String(formData.get("unionAgreementId") ?? "").trim() || defaultAgreementId || "";
  if (!agreementId) throw new Error("Select a union agreement for this union contract.");

  const { data, error } = await supabase
    .from("union_agreements")
    .select(
      "id, name, version_label, active, union_agreement_funds(id, union_fund_id, percentage, contribution_type, sort_order, union_funds(id, name, vendor_number, foapal_id, check_request_handling, check_request_other_location, vendor_address1, vendor_address2, vendor_address3, tax_id_encrypted, tax_id_last4, active))"
    )
    .eq("id", agreementId)
    .single();
  if (error || !data) throw new Error(error?.message ?? "Union agreement was not found.");

  const rawRules = (
    (data.union_agreement_funds as Array<{
      id?: string;
      union_fund_id?: string;
      percentage?: string | number;
      contribution_type?: string;
      sort_order?: number;
      union_funds?: {
        id?: string;
        name?: string;
        vendor_number?: string | null;
        foapal_id?: string | null;
        check_request_handling?: string | null;
        check_request_other_location?: string | null;
        vendor_address1?: string | null;
        vendor_address2?: string | null;
        vendor_address3?: string | null;
        tax_id_encrypted?: string | null;
        tax_id_last4?: string | null;
        active?: boolean;
      } | null;
    }> | null) ?? []
  ).sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0));
  if (rawRules.length === 0) throw new Error("The selected union agreement has no contribution funds.");

  const rules = rawRules.map((rule) => {
    const fund = rule.union_funds;
    if (!rule.id || !rule.union_fund_id || !fund?.id) throw new Error("A union agreement fund is incomplete.");
    if (!fund.foapal_id) throw new Error(`${fund.name ?? "Union fund"} needs a FOAPAL before it can be used.`);
    if (!fund.tax_id_encrypted) throw new Error(`${fund.name ?? "Union fund"} needs W-9/Tax ID information before it can be used.`);
    const percentage = Number(rule.percentage ?? 0);
    const amount = Math.round(contractValue * percentage) / 100;
    const dueDate =
      String(formData.get(`unionDueDate_${rule.id}`) ?? "").trim() ||
      String(formData.get("installmentDueDate1") ?? "").trim() ||
      null;
    if (!dueDate) throw new Error(`Select a payment date for ${fund.name ?? "each union fund"}.`);
    const schedule = calculateCheckRequestSchedule(dueDate);
    return {
      agreementFundId: rule.id,
      unionFundId: rule.union_fund_id,
      fundName: fund.name ?? "Union Fund",
      vendorNumber: fund.vendor_number ?? null,
      foapalId: fund.foapal_id,
      checkRequestHandling: ((fund.check_request_handling as string | null) ?? "mail") as CheckRequestHandling,
      checkRequestOtherLocation: fund.check_request_other_location ?? null,
      vendorAddress1: fund.vendor_address1 ?? null,
      vendorAddress2: fund.vendor_address2 ?? null,
      vendorAddress3: fund.vendor_address3 ?? null,
      taxIdEncrypted: fund.tax_id_encrypted,
      taxIdLast4: fund.tax_id_last4 ?? null,
      contributionType:
        rule.contribution_type === "artist_withholding" ? "artist_withholding" as const : "employer_paid" as const,
      percentage,
      amount,
      dueDate: schedule?.dueDate ?? dueDate,
      apReceiveBy: schedule?.apReceiveBy ?? null,
      mailBy: schedule?.mailBy ?? null
    };
  });
  return {
    agreementId,
    agreementName: `${data.name as string} — ${data.version_label as string}`,
    totalWithholding: rules
      .filter((rule) => rule.contributionType === "artist_withholding")
      .reduce((sum, rule) => sum + rule.amount, 0),
    rules
  };
}

export function artistInstallmentAmounts(
  contractValue: number,
  installmentCount: number,
  unionCalculation: UnionCalculation | null
): number[] {
  const amounts = splitAmounts(contractValue, installmentCount);
  const withholding = unionCalculation?.totalWithholding ?? 0;
  if (withholding > 0) {
    const firstAmount = Math.round(((amounts[0] ?? 0) - withholding) * 100) / 100;
    if (firstAmount <= 0) {
      throw new Error("Artist withholdings must be less than the artist's first installment.");
    }
    amounts[0] = firstAmount;
  }
  return amounts;
}

export async function createUnionContributionRows(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  params: {
    contractId: string;
    projectId: string;
    organizationId: string | null;
    bannerAccountCodeId: string;
    productionCategoryId: string;
    reportingBudgetLineId: string;
    userId: string;
    calculation: UnionCalculation;
    contractValue: number;
  }
): Promise<void> {
  for (const rule of params.calculation.rules) {
    const { data: purchase, error: purchaseError } = await supabase
      .from("purchases")
      .insert({
        project_id: params.projectId,
        organization_id: params.organizationId,
        budget_line_id: params.reportingBudgetLineId,
        production_category_id: params.productionCategoryId,
        banner_account_code_id: params.bannerAccountCodeId,
        budget_tracked: true,
        entered_by_user_id: params.userId,
        title: `${rule.fundName} Union Contribution`,
        estimated_amount: rule.amount,
        requested_amount: rule.amount,
        encumbered_amount: 0,
        pending_cc_amount: 0,
        posted_amount: 0,
        status: "requested",
        request_type: "contract_payment",
        is_credit_card: false,
        ordered_on: rule.mailBy ?? rule.apReceiveBy ?? rule.dueDate,
        procurement_status: "requested",
        notes: `Separate union fund check for contract ${params.contractId}`
      })
      .select("id")
      .single();
    if (purchaseError || !purchase) throw new Error(purchaseError?.message ?? "Could not create union payment row.");

    const { error: allocationError } = await supabase.from("purchase_allocations").insert({
      purchase_id: purchase.id,
      project_id: params.projectId,
      organization_id: params.organizationId,
      reporting_budget_line_id: params.reportingBudgetLineId,
      account_code_id: params.bannerAccountCodeId,
      production_category_id: params.productionCategoryId,
      amount: rule.amount,
      reporting_bucket: "direct",
      note: "Union contribution allocation — separate check"
    });
    if (allocationError) throw new Error(allocationError.message);

    const { error: contributionError } = await supabase.from("contract_union_contributions").insert({
      contract_id: params.contractId,
      union_agreement_fund_id: rule.agreementFundId,
      union_fund_id: rule.unionFundId,
      purchase_id: purchase.id,
      fund_name_snapshot: rule.fundName,
      vendor_number_snapshot: rule.vendorNumber,
      foapal_id_snapshot: rule.foapalId,
      check_request_handling_snapshot: rule.checkRequestHandling,
      check_request_other_location_snapshot: rule.checkRequestOtherLocation,
      vendor_address1_snapshot: rule.vendorAddress1,
      vendor_address2_snapshot: rule.vendorAddress2,
      vendor_address3_snapshot: rule.vendorAddress3,
      tax_id_encrypted_snapshot: rule.taxIdEncrypted,
      tax_id_last4_snapshot: rule.taxIdLast4,
      contribution_type: rule.contributionType,
      percentage: rule.percentage,
      calculation_base: params.contractValue,
      amount: rule.amount,
      due_date: rule.dueDate,
      ap_receive_by: rule.apReceiveBy,
      mail_by: rule.mailBy,
      status: "planned"
    });
    if (contributionError) throw new Error(contributionError.message);
    await createInstitutionalCommitmentForPurchase(supabase, purchase.id as string, params.userId);
  }
}

export async function validateProductionProjectFiscalYear(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  projectIds: string[],
  fiscalYearId: string | null
): Promise<string | null> {
  if (!fiscalYearId) return "Select a fiscal year before choosing an associated production or show.";

  const { data, error } = await supabase
    .from("projects")
    .select("id, fiscal_year_id")
    .in("id", projectIds);
  if (error) return error.message;

  const projects = data ?? [];
  if (projects.length !== projectIds.length) return "One or more associated productions or shows could not be found.";
  if (projects.some((project) => project.fiscal_year_id !== fiscalYearId)) {
    return "Every associated production or show must be in the contract's fiscal year.";
  }
  return null;
}

export async function syncContractProductions(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  contractId: string,
  projectIds: string[]
): Promise<void> {
  const { error: deleteError } = await supabase
    .from("contract_productions")
    .delete()
    .eq("contract_id", contractId);
  if (deleteError) throw new Error(deleteError.message);

  const { error: insertError } = await supabase.from("contract_productions").insert(
    projectIds.map((projectId) => ({
      contract_id: contractId,
      project_id: projectId
    }))
  );
  if (insertError) throw new Error(insertError.message);
}

export function nullableFormText(formData: FormData, name: string): string | null {
  const value = String(formData.get(name) ?? "").trim();
  return value.length > 0 ? value : null;
}

export function formTextOrDefault(formData: FormData, name: string, fallback: string | null = null): string | null {
  const value = String(formData.get(name) ?? "").trim();
  return value.length > 0 ? value : fallback;
}

export function parseTaxIdUpdate(formData: FormData, existing?: { encrypted: string | null; last4: string | null }): {
  encrypted: string | null;
  last4: string | null;
} {
  if (formData.get("clearTaxId") === "on") {
    return { encrypted: null, last4: null };
  }
  const rawTaxId = String(formData.get("taxIdOrSsn") ?? "").trim();
  if (!rawTaxId) {
    return {
      encrypted: existing?.encrypted ?? null,
      last4: existing?.last4 ?? null
    };
  }
  return {
    encrypted: encryptSensitiveValue(rawTaxId),
    last4: taxIdLastFour(rawTaxId)
  };
}

export function checkRequestValues(
  formData: FormData,
  existingTax?: { encrypted: string | null; last4: string | null },
  defaults?: {
    foapalId?: string | null;
    handling?: CheckRequestHandling | null;
    otherLocation?: string | null;
    address1?: string | null;
    address2?: string | null;
    address3?: string | null;
  }
) {
  const tax = parseTaxIdUpdate(formData, existingTax);
  return {
    contract_number: nullableFormText(formData, "contractNumber"),
    contract_role: nullableFormText(formData, "contractRole"),
    check_request_foapal_id: formTextOrDefault(formData, "checkRequestFoapalId", defaults?.foapalId ?? null),
    check_request_handling: formData.has("checkRequestHandling")
      ? parseCheckRequestHandling(formData.get("checkRequestHandling"))
      : defaults?.handling ?? "mail",
    check_request_other_location: formTextOrDefault(formData, "checkRequestOtherLocation", defaults?.otherLocation ?? null),
    vendor_address1: formTextOrDefault(formData, "vendorAddress1", defaults?.address1 ?? null),
    vendor_address2: formTextOrDefault(formData, "vendorAddress2", defaults?.address2 ?? null),
    vendor_address3: formTextOrDefault(formData, "vendorAddress3", defaults?.address3 ?? null),
    tax_id_encrypted: tax.encrypted,
    tax_id_last4: tax.last4
  };
}

export function installmentCheckRequestValues(
  formData: FormData,
  existingTax?: { encrypted: string | null; last4: string | null },
  defaults?: Parameters<typeof checkRequestValues>[2]
) {
  const values = checkRequestValues(formData, existingTax, defaults);
  const { contract_number: _contractNumber, contract_role: _contractRole, ...installmentValues } = values;
  void _contractNumber;
  void _contractRole;
  return installmentValues;
}

export function splitAmounts(total: number, count: number): number[] {
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

export function installmentScheduleValues(formData: FormData, installmentNumber: number): {
  due_date: string | null;
  ap_receive_by: string | null;
  mail_by: string | null;
} {
  const dueDate = String(formData.get(`installmentDueDate${installmentNumber}`) ?? "").trim();
  const schedule = calculateCheckRequestSchedule(dueDate);
  return {
    due_date: schedule?.dueDate ?? null,
    ap_receive_by: schedule?.apReceiveBy ?? null,
    mail_by: schedule?.mailBy ?? null
  };
}

export function contractPaymentOrderDate(schedule: { mail_by: string | null; ap_receive_by: string | null; due_date: string | null }): string | null {
  return schedule.mail_by ?? schedule.ap_receive_by ?? schedule.due_date;
}

export function isMissingInstallmentScheduleColumn(error: { message?: string | null } | null | undefined): boolean {
  const message = (error?.message ?? "").toLowerCase();
  return (
    message.includes("due_date") ||
    message.includes("ap_receive_by") ||
    message.includes("mail_by") ||
    message.includes("check_request_foapal_id") ||
    message.includes("vendor_address") ||
    message.includes("tax_id") ||
    message.includes("payment_channel")
  );
}

export async function getGuestArtistDefaults(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  guestArtistId: string
): Promise<GuestArtistDefaults | null> {
  if (!guestArtistId) return null;
  const { data, error } = await supabase
    .from("guest_artists")
    .select(
      "id, display_name, vendor_number, email, phone, default_foapal_id, default_check_request_handling, default_check_request_other_location, vendor_address1, vendor_address2, vendor_address3, tax_id_encrypted, tax_id_last4, is_union, default_union_agreement_id, active"
    )
    .eq("id", guestArtistId)
    .eq("active", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.id) return null;
  return {
    id: data.id as string,
    display_name: data.display_name as string,
    vendor_number: (data.vendor_number as string | null) ?? null,
    email: (data.email as string | null) ?? null,
    phone: (data.phone as string | null) ?? null,
    default_foapal_id: (data.default_foapal_id as string | null) ?? null,
    default_check_request_handling: ((data.default_check_request_handling as string | null) ?? "mail") as CheckRequestHandling,
    default_check_request_other_location: (data.default_check_request_other_location as string | null) ?? null,
    vendor_address1: (data.vendor_address1 as string | null) ?? null,
    vendor_address2: (data.vendor_address2 as string | null) ?? null,
    vendor_address3: (data.vendor_address3 as string | null) ?? null,
    tax_id_encrypted: (data.tax_id_encrypted as string | null) ?? null,
    tax_id_last4: (data.tax_id_last4 as string | null) ?? null,
    is_union: Boolean(data.is_union as boolean | null),
    default_union_agreement_id: (data.default_union_agreement_id as string | null) ?? null
  };
}

export function guestCheckDefaults(guestArtist: GuestArtistDefaults | null) {
  return guestArtist
    ? {
        foapalId: guestArtist.default_foapal_id,
        handling: guestArtist.default_check_request_handling,
        otherLocation: guestArtist.default_check_request_other_location,
        address1: guestArtist.vendor_address1,
        address2: guestArtist.vendor_address2,
        address3: guestArtist.vendor_address3
      }
    : undefined;
}

export async function ensurePmOrAdmin(projectId: string, userId: string): Promise<void> {
  const access = await getAccessContext();
  if (access.role === "admin") return;
  if (access.role === "project_manager" && access.manageableProjectIds.has(projectId)) return;

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
