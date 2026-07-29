"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { getAccessContext } from "@/lib/access";
import { calculateCheckRequestSchedule } from "@/lib/check-request-schedule";
import { createInstitutionalCommitmentForPurchase } from "@/lib/institutional-budget";
import { encryptSensitiveValue, taxIdLastFour } from "@/lib/sensitive-encryption";
import type { PurchaseStatus } from "@/lib/types";

type ActionState = {
  ok: boolean;
  message: string;
  timestamp: number;
};

type ContractWorkflowStatus = "w9_requested" | "contract_sent" | "contract_signed_returned" | "siena_signed";
type InstallmentStatus = "planned" | "check_request_submitted" | "check_paid";
type CheckRequestHandling = "mail" | "business_affairs_pickup" | "other";
type ContractSession = "summer" | "fall" | "winter" | "spring";
type GuestArtistDefaults = {
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
type BulkContractLine = {
  contractorName: string;
  contractValue: string;
  installmentCount?: string;
};

type UnionCalculationRule = {
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

type UnionCalculation = {
  agreementId: string;
  agreementName: string;
  totalWithholding: number;
  rules: UnionCalculationRule[];
};

const emptyState: ActionState = { ok: true, message: "", timestamp: 0 };

function ok(message: string): ActionState {
  return { ok: true, message, timestamp: Date.now() };
}

function err(message: string): ActionState {
  return { ok: false, message, timestamp: Date.now() };
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) return error.message;
  return fallback;
}

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

function purchaseStatusForInstallmentStatus(status: InstallmentStatus): PurchaseStatus {
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

function parseCheckRequestHandling(value: FormDataEntryValue | null): CheckRequestHandling {
  const raw = String(value ?? "mail").trim();
  if (raw === "business_affairs_pickup" || raw === "other") return raw;
  return "mail";
}

function parseContractSessions(formData: FormData): ContractSession[] {
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

function parseProductionProjectIds(formData: FormData, accountingProjectId: string): string[] {
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

function formIsUnion(formData: FormData): boolean {
  return formData.getAll("isUnion").some((value) => value === "true" || value === "on");
}

async function loadUnionCalculation(
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

function artistInstallmentAmounts(
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

async function createUnionContributionRows(
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

async function validateProductionProjectFiscalYear(
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

async function syncContractProductions(
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

function nullableFormText(formData: FormData, name: string): string | null {
  const value = String(formData.get(name) ?? "").trim();
  return value.length > 0 ? value : null;
}

function formTextOrDefault(formData: FormData, name: string, fallback: string | null = null): string | null {
  const value = String(formData.get(name) ?? "").trim();
  return value.length > 0 ? value : fallback;
}

function parseTaxIdUpdate(formData: FormData, existing?: { encrypted: string | null; last4: string | null }): {
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

function checkRequestValues(
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

function installmentCheckRequestValues(
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

function installmentScheduleValues(formData: FormData, installmentNumber: number): {
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

function contractPaymentOrderDate(schedule: { mail_by: string | null; ap_receive_by: string | null; due_date: string | null }): string | null {
  return schedule.mail_by ?? schedule.ap_receive_by ?? schedule.due_date;
}

function isMissingInstallmentScheduleColumn(error: { message?: string | null } | null | undefined): boolean {
  const message = (error?.message ?? "").toLowerCase();
  return (
    message.includes("due_date") ||
    message.includes("ap_receive_by") ||
    message.includes("mail_by") ||
    message.includes("check_request_foapal_id") ||
    message.includes("vendor_address") ||
    message.includes("tax_id")
  );
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

async function getGuestArtistDefaults(
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

function guestCheckDefaults(guestArtist: GuestArtistDefaults | null) {
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

async function ensurePmOrAdmin(projectId: string, userId: string): Promise<void> {
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
    const installmentCount = parseInstallmentCount(formData.get("installmentCount"));
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
        union_agreement_id: unionCalculation?.agreementId ?? null,
        union_agreement_name_snapshot: unionCalculation?.agreementName ?? null,
        union_signature_status: "not_started",
        ...contractCheckRequestValues,
        workflow_status: "w9_requested",
        notes: notes || null
      })
      .select("id")
      .single();
    if (contractError || !contract) return err(contractError?.message ?? "Could not create contract.");
    await syncContractProductions(supabase, contract.id as string, productionProjectIds);

    for (let index = 0; index < installmentAmounts.length; index += 1) {
      const installmentNumber = index + 1;
      const installmentAmount = installmentAmounts[index];
      const installmentTitle = `${contractorName} Contract Payment ${installmentNumber}/${installmentCount}`;
      const scheduleValues = installmentScheduleValues(formData, installmentNumber);

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
    const installmentCount = parseInstallmentCount(formData.get("installmentCount"));
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
      .select("id, project_id, installment_count, production_category_id, tax_id_encrypted, tax_id_last4, is_union, union_agreement_id")
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
        union_agreement_id: unionCalculation?.agreementId ?? null,
        union_agreement_name_snapshot: unionCalculation?.agreementName ?? null,
        ...contractCheckRequestValues,
        notes: notes || null
      })
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
      const scheduleValues = installmentScheduleValues(formData, installmentNumber);

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
        ...installmentScheduleValues(formData, Number(installment.installment_number ?? 1)),
        ...installmentCheckRequestDefaults
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
          title: `${contractorName} Contract Payment ${installment.installment_number as number}/${installmentCount}`,
          estimated_amount: installmentAmount,
          requested_amount: requestedAmount,
          encumbered_amount: encumberedAmount,
          pending_cc_amount: 0,
          posted_amount: postedAmount,
          ordered_on: nextOrderDate,
          status: nextStatus,
          procurement_status: nextStatus === "posted" ? "paid" : nextStatus === "encumbered" ? "ordered" : "requested",
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
      .select("id, project_id")
      .eq("id", contractId)
      .single();
    if (contractError || !contract) return err("Contract not found.");
    const projectId = contract.project_id as string;

    await ensurePmOrAdmin(projectId, user.id);

    const { data: updated, error: updateError } = await supabase
      .from("contracts")
      .update({ workflow_status: workflowStatus })
      .eq("id", contractId)
      .select("id")
      .maybeSingle();
    if (updateError) return err(updateError.message);
    if (!updated?.id) return err("Contract workflow update was not applied.");

    revalidatePath("/contracts");
    return ok("Contract workflow updated.");
  } catch (error) {
    return err(getErrorMessage(error, "Could not update contract workflow."));
  }
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
        check_paid_on: nextStatus === "check_paid" ? today : null
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
      nextStatus === "check_paid" ? "posted" : nextStatus === "check_request_submitted" ? "encumbered" : "requested";
    if (contribution.purchase_id) {
      const { error: purchaseError } = await supabase
        .from("purchases")
        .update({
          status: purchaseStatus,
          requested_amount: purchaseStatus === "requested" ? amount : 0,
          encumbered_amount: purchaseStatus === "encumbered" ? amount : 0,
          posted_amount: purchaseStatus === "posted" ? amount : 0,
          pending_cc_amount: 0,
          procurement_status: purchaseStatus === "posted" ? "paid" : purchaseStatus === "encumbered" ? "ordered" : "requested",
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
        check_request_submitted_on: nextStatus === "planned" ? null : today,
        check_paid_on: nextStatus === "check_paid" ? today : null
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
      .select("id, contract_id, purchase_id, tax_id_encrypted, tax_id_last4, contracts!inner(project_id)")
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
      })
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

export async function deleteContractAction(
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
    if (!contractId) return err("Contract id is required.");

    const { data: contract, error: contractError } = await supabase
      .from("contracts")
      .select("id, project_id")
      .eq("id", contractId)
      .single();
    if (contractError || !contract) return err("Contract not found.");
    const projectId = contract.project_id as string;

    await ensurePmOrAdmin(projectId, user.id);

    const { error: deleteError } = await supabase.rpc("delete_contract_with_links", {
      p_contract_id: contractId
    });
    if (deleteError) return err(deleteError.message);

    revalidatePath("/contracts");
    revalidatePath("/");
    revalidatePath("/overview");
    revalidatePath(`/projects/${projectId}`);
    return ok("Contract deleted.");
  } catch (error) {
    return err(getErrorMessage(error, "Could not delete contract."));
  }
}

export type { ActionState };
