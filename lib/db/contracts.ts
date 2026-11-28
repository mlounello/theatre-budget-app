import { getSupabaseServerClient } from "@/lib/supabase-server";
import { getAccessContext } from "@/lib/access";
import { type UnionContributionType, type FiscalYearOption, type OrganizationOption, type ProcurementProjectOption, type AccountCodeOption, type FoapalOption, type GuestArtistOption, type UnionAgreementOption, asNumber } from "@/lib/db/shared";
import { getFiscalYearOptions, getFiscalYearOrganizationOptions, getAccountCodeOptions, getFoapalOptions, getGuestArtistOptions, getUnionAgreementOptions } from "@/lib/db/options";
import { getSettingsProjects } from "@/lib/db/settings";

type DbListResponse = {
  data: Array<Record<string, unknown>> | null;
  error: { message: string } | null;
};

export type ContractWorkflowStatus =
  | "w9_requested"
  | "contract_sent"
  | "contract_signed_returned"
  | "siena_signed"
  | "cancelled";

export type ContractInstallmentStatus = "planned" | "check_request_submitted" | "check_paid" | "cancelled";

export type ContractSession = "summer" | "fall" | "winter" | "spring";

export type UnionSignatureStatus = "not_started" | "sent_to_union" | "union_countersigned" | "complete";

export type HiringEngagementType = "independent_contractor" | "union_freelance_artist" | "temporary_employee";

export type HiringEngagementStatus = "active" | "completed" | "terminated";

export type HiringCompensationBasis = "flat_fee" | "hourly";

export type HrOnboardingStatus = "not_started" | "submitted_to_hr" | "onboarding" | "complete" | "not_required";

export type CheckRequestAutomationStatus = "not_ready" | "ready" | "sending" | "sent" | "failed";

export type ContractRow = {
  id: string;
  fiscalYearId: string | null;
  fiscalYearName: string | null;
  organizationId: string | null;
  organizationLabel: string | null;
  projectId: string;
  projectName: string;
  season: string | null;
  productionProjectId: string;
  productionProjectName: string;
  productionProjectSeason: string | null;
  productionProjects: Array<{
    id: string;
    name: string;
    season: string | null;
  }>;
  bannerAccountCodeId: string;
  bannerAccountCode: string | null;
  guestArtistId: string | null;
  contractorName: string;
  contractorEmployeeId: string | null;
  contractorEmail: string | null;
  contractorPhone: string | null;
  contractValue: number;
  installmentCount: number;
  contractNumber: string | null;
  contractRole: string | null;
  contractSessions: ContractSession[];
  checkRequestFoapalId: string | null;
  checkRequestHandling: "mail" | "business_affairs_pickup" | "other";
  checkRequestOtherLocation: string | null;
  vendorAddress1: string | null;
  vendorAddress2: string | null;
  vendorAddress3: string | null;
  taxIdLast4: string | null;
  workflowStatus: ContractWorkflowStatus;
  isUnion: boolean;
  unionAgreementId: string | null;
  unionAgreementName: string | null;
  unionSignatureStatus: UnionSignatureStatus;
  engagementType: HiringEngagementType;
  engagementStatus: HiringEngagementStatus;
  compensationBasis: HiringCompensationBasis;
  hrOnboardingStatus: HrOnboardingStatus;
  hrOnboardingReference: string | null;
  w9AttachmentPath: string | null;
  employmentStartDate: string | null;
  employmentEndDate: string | null;
  payrollFirstPayDate: string | null;
  payrollFrequency: "biweekly";
  notes: string | null;
  createdAt: string;
};

export type ContractInstallmentRow = {
  id: string;
  contractId: string;
  purchaseId: string | null;
  installmentNumber: number;
  installmentAmount: number;
  paymentChannel: "check_request" | "payroll";
  status: ContractInstallmentStatus;
  dueDate: string | null;
  apReceiveBy: string | null;
  mailBy: string | null;
  checkRequestFoapalId: string | null;
  checkRequestHandling: "mail" | "business_affairs_pickup" | "other";
  checkRequestOtherLocation: string | null;
  vendorAddress1: string | null;
  vendorAddress2: string | null;
  vendorAddress3: string | null;
  taxIdLast4: string | null;
  checkRequestSubmittedOn: string | null;
  checkPaidOn: string | null;
  automationStatus: CheckRequestAutomationStatus;
  automationSentAt: string | null;
  automationLastError: string | null;
};

export type ContractUnionContributionRow = {
  id: string;
  contractId: string;
  purchaseId: string | null;
  fundName: string;
  vendorNumber: string | null;
  contributionType: UnionContributionType;
  percentage: number;
  calculationBase: number;
  amount: number;
  dueDate: string | null;
  apReceiveBy: string | null;
  mailBy: string | null;
  status: ContractInstallmentStatus;
  taxIdLast4: string | null;
  checkRequestSubmittedOn: string | null;
  checkPaidOn: string | null;
  automationStatus: CheckRequestAutomationStatus;
  automationSentAt: string | null;
  automationLastError: string | null;
};

export async function getContractsData(): Promise<{
  contracts: ContractRow[];
  installments: ContractInstallmentRow[];
  unionContributions: ContractUnionContributionRow[];
  fiscalYearOptions: FiscalYearOption[];
  organizationOptions: OrganizationOption[];
  projectOptions: ProcurementProjectOption[];
  accountCodeOptions: AccountCodeOption[];
  foapalOptions: FoapalOption[];
  guestArtistOptions: GuestArtistOption[];
  unionAgreementOptions: UnionAgreementOption[];
  canManageContracts: boolean;
}> {
  const supabase = await getSupabaseServerClient();
  const access = await getAccessContext();

  const [fiscalYears, organizations, projects, accountCodes, foapalOptions, guestArtistOptions, unionAgreementOptions] = await Promise.all([
    getFiscalYearOptions(),
    getFiscalYearOrganizationOptions(),
    getSettingsProjects(),
    getAccountCodeOptions(),
    getFoapalOptions(),
    getGuestArtistOptions(),
    getUnionAgreementOptions()
  ]);

  let contractsResponse = (await supabase
    .from("contracts")
    .select(
      "id, fiscal_year_id, organization_id, project_id, production_project_id, banner_account_code_id, guest_artist_id, contractor_name, contractor_employee_id, contractor_email, contractor_phone, contract_value, installment_count, contract_number, contract_role, contract_session, check_request_foapal_id, check_request_handling, check_request_other_location, vendor_address1, vendor_address2, vendor_address3, tax_id_last4, workflow_status, is_union, union_agreement_id, union_agreement_name_snapshot, union_signature_status, engagement_type, engagement_status, compensation_basis, hr_onboarding_status, hr_onboarding_reference, w9_attachment_path, employment_start_date, employment_end_date, payroll_first_pay_date, payroll_frequency, notes, created_at, fiscal_years(name), organizations(name, org_code), accounting_project:projects!contracts_project_id_fkey(name, season), production_project:projects!contracts_production_project_id_fkey(name, season), contract_productions(project_id, production:projects!contract_productions_project_id_fkey(name, season)), account_codes(code)"
    )
    .order("created_at", { ascending: false })
    .limit(200)) as DbListResponse;
  if (
    contractsResponse.error &&
    (contractsResponse.error.message.toLowerCase().includes("contract_number") ||
      contractsResponse.error.message.toLowerCase().includes("contract_session") ||
      contractsResponse.error.message.toLowerCase().includes("contract_productions") ||
      contractsResponse.error.message.toLowerCase().includes("is_union") ||
      contractsResponse.error.message.toLowerCase().includes("guest_artist_id") ||
      contractsResponse.error.message.toLowerCase().includes("production_project") ||
      contractsResponse.error.message.toLowerCase().includes("check_request_foapal_id") ||
      contractsResponse.error.message.toLowerCase().includes("tax_id"))
  ) {
    contractsResponse = (await supabase
      .from("contracts")
      .select(
        "id, fiscal_year_id, organization_id, project_id, banner_account_code_id, contractor_name, contractor_employee_id, contractor_email, contractor_phone, contract_value, installment_count, workflow_status, notes, created_at, fiscal_years(name), organizations(name, org_code), accounting_project:projects!contracts_project_id_fkey(name, season), account_codes(code)"
      )
      .order("created_at", { ascending: false })
      .limit(200)) as DbListResponse;
  }
  if (contractsResponse.error) throw contractsResponse.error;
  let installmentsResponse = (await supabase
    .from("contract_installments")
    .select("id, contract_id, purchase_id, installment_number, installment_amount, payment_channel, status, due_date, ap_receive_by, mail_by, check_request_foapal_id, check_request_handling, check_request_other_location, vendor_address1, vendor_address2, vendor_address3, tax_id_last4, check_request_submitted_on, check_paid_on, automation_status, automation_sent_at, automation_last_error")
    .order("contract_id", { ascending: true })
    .order("installment_number", { ascending: true })) as DbListResponse;

  if (
    installmentsResponse.error &&
    (installmentsResponse.error.message.toLowerCase().includes("due_date") ||
      installmentsResponse.error.message.toLowerCase().includes("check_request_foapal_id") ||
      installmentsResponse.error.message.toLowerCase().includes("payment_channel"))
  ) {
    installmentsResponse = (await supabase
      .from("contract_installments")
      .select("id, contract_id, purchase_id, installment_number, installment_amount, status, check_request_submitted_on, check_paid_on")
      .order("contract_id", { ascending: true })
      .order("installment_number", { ascending: true })) as DbListResponse;
  }
  if (installmentsResponse.error) throw installmentsResponse.error;

  const { data: unionContributionRows, error: unionContributionsError } = await supabase
    .from("contract_union_contributions")
    .select(
      "id, contract_id, purchase_id, fund_name_snapshot, vendor_number_snapshot, contribution_type, percentage, calculation_base, amount, due_date, ap_receive_by, mail_by, status, tax_id_last4_snapshot, check_request_submitted_on, check_paid_on, automation_status, automation_sent_at, automation_last_error"
    )
    .order("created_at", { ascending: true });
  if (unionContributionsError) throw unionContributionsError;

  const canManageContracts = access.role === "admin" || access.role === "project_manager";

  const projectById = new Map(projects.map((project) => [project.id, project]));
  const fiscalYearById = new Map(fiscalYears.map((fiscalYear) => [fiscalYear.id, fiscalYear.name]));

  const contracts: ContractRow[] = (contractsResponse.data ?? []).map((row) => {
    const fy = row.fiscal_years as { name?: string } | null;
    const org = row.organizations as { name?: string; org_code?: string } | null;
    const project = row.accounting_project as { name?: string; season?: string | null } | null;
    const productionProject = row.production_project as { name?: string; season?: string | null } | null;
    const linkedProductions = (
      (row.contract_productions as Array<{
        project_id?: string;
        production?: { name?: string; season?: string | null } | null;
      }> | null) ?? []
    )
      .filter((linked) => Boolean(linked.project_id))
      .map((linked) => ({
        id: linked.project_id as string,
        name: linked.production?.name ?? "Unknown Production",
        season: (linked.production?.season as string | null) ?? null
      }));
    const account = row.account_codes as { code?: string } | null;
    const projectMeta = projectById.get(row.project_id as string);
    return {
      id: row.id as string,
      fiscalYearId: (row.fiscal_year_id as string | null) ?? null,
      fiscalYearName:
        fy?.name ??
        (projectMeta?.fiscalYearId ? (fiscalYearById.get(projectMeta.fiscalYearId) ?? null) : null),
      organizationId: (row.organization_id as string | null) ?? null,
      organizationLabel: org ? `${org.org_code ?? ""} | ${org.name ?? ""}` : null,
      projectId: row.project_id as string,
      projectName: project?.name ?? "Unknown Project",
      season: (project?.season as string | null) ?? null,
      productionProjectId: ((row.production_project_id as string | null) ?? row.project_id) as string,
      productionProjectName: productionProject?.name ?? project?.name ?? "Unknown Production",
      productionProjectSeason: (productionProject?.season as string | null) ?? (project?.season as string | null) ?? null,
      productionProjects:
        linkedProductions.length > 0
          ? linkedProductions
          : [
              {
                id: ((row.production_project_id as string | null) ?? row.project_id) as string,
                name: productionProject?.name ?? project?.name ?? "Unknown Production",
                season: (productionProject?.season as string | null) ?? (project?.season as string | null) ?? null
              }
            ],
      bannerAccountCodeId: row.banner_account_code_id as string,
      bannerAccountCode: account?.code ?? null,
      guestArtistId: (row.guest_artist_id as string | null) ?? null,
      contractorName: row.contractor_name as string,
      contractorEmployeeId: (row.contractor_employee_id as string | null) ?? null,
      contractorEmail: (row.contractor_email as string | null) ?? null,
      contractorPhone: (row.contractor_phone as string | null) ?? null,
      contractValue: asNumber(row.contract_value as string | number | null),
      installmentCount: Number(row.installment_count ?? 1),
      contractNumber: (row.contract_number as string | null) ?? null,
      contractRole: (row.contract_role as string | null) ?? null,
      contractSessions: (Array.isArray(row.contract_session) ? row.contract_session : [row.contract_session])
        .filter(
          (value): value is ContractSession =>
            value === "summer" || value === "fall" || value === "winter" || value === "spring"
        ),
      checkRequestFoapalId: (row.check_request_foapal_id as string | null) ?? null,
      checkRequestHandling: ((row.check_request_handling as string | null) ?? "mail") as "mail" | "business_affairs_pickup" | "other",
      checkRequestOtherLocation: (row.check_request_other_location as string | null) ?? null,
      vendorAddress1: (row.vendor_address1 as string | null) ?? null,
      vendorAddress2: (row.vendor_address2 as string | null) ?? null,
      vendorAddress3: (row.vendor_address3 as string | null) ?? null,
      taxIdLast4: (row.tax_id_last4 as string | null) ?? null,
      workflowStatus: (row.workflow_status as ContractWorkflowStatus) ?? "w9_requested",
      isUnion: Boolean(row.is_union as boolean | null),
      unionAgreementId: (row.union_agreement_id as string | null) ?? null,
      unionAgreementName: (row.union_agreement_name_snapshot as string | null) ?? null,
      unionSignatureStatus: ((row.union_signature_status as string | null) ?? "not_started") as UnionSignatureStatus,
      engagementType: ((row.engagement_type as string | null) ?? (Boolean(row.is_union) ? "union_freelance_artist" : "independent_contractor")) as HiringEngagementType,
      engagementStatus: ((row.engagement_status as string | null) ?? "active") as HiringEngagementStatus,
      compensationBasis: ((row.compensation_basis as string | null) ?? "flat_fee") as HiringCompensationBasis,
      hrOnboardingStatus: ((row.hr_onboarding_status as string | null) ?? "not_required") as HrOnboardingStatus,
      hrOnboardingReference: (row.hr_onboarding_reference as string | null) ?? null,
      w9AttachmentPath: (row.w9_attachment_path as string | null) ?? null,
      employmentStartDate: (row.employment_start_date as string | null) ?? null,
      employmentEndDate: (row.employment_end_date as string | null) ?? null,
      payrollFirstPayDate: (row.payroll_first_pay_date as string | null) ?? null,
      payrollFrequency: "biweekly",
      notes: (row.notes as string | null) ?? null,
      createdAt: row.created_at as string
    };
  });

  const installments: ContractInstallmentRow[] = (installmentsResponse.data ?? []).map((row) => ({
    id: row.id as string,
    contractId: row.contract_id as string,
    purchaseId: (row.purchase_id as string | null) ?? null,
    installmentNumber: Number(row.installment_number ?? 1),
    installmentAmount: asNumber(row.installment_amount as string | number | null),
    paymentChannel: ((row.payment_channel as string | null) ?? "check_request") as "check_request" | "payroll",
    status: ((row.status as string | null) ?? "planned") as ContractInstallmentStatus,
    dueDate: (row.due_date as string | null) ?? null,
    apReceiveBy: (row.ap_receive_by as string | null) ?? null,
    mailBy: (row.mail_by as string | null) ?? null,
    checkRequestFoapalId: (row.check_request_foapal_id as string | null) ?? null,
    checkRequestHandling: ((row.check_request_handling as string | null) ?? "mail") as "mail" | "business_affairs_pickup" | "other",
    checkRequestOtherLocation: (row.check_request_other_location as string | null) ?? null,
    vendorAddress1: (row.vendor_address1 as string | null) ?? null,
    vendorAddress2: (row.vendor_address2 as string | null) ?? null,
    vendorAddress3: (row.vendor_address3 as string | null) ?? null,
    taxIdLast4: (row.tax_id_last4 as string | null) ?? null,
    checkRequestSubmittedOn: (row.check_request_submitted_on as string | null) ?? null,
    checkPaidOn: (row.check_paid_on as string | null) ?? null,
    automationStatus: ((row.automation_status as string | null) ?? "not_ready") as CheckRequestAutomationStatus,
    automationSentAt: (row.automation_sent_at as string | null) ?? null,
    automationLastError: (row.automation_last_error as string | null) ?? null
  }));

  const unionContributions: ContractUnionContributionRow[] = (unionContributionRows ?? []).map((row) => ({
    id: row.id as string,
    contractId: row.contract_id as string,
    purchaseId: (row.purchase_id as string | null) ?? null,
    fundName: row.fund_name_snapshot as string,
    vendorNumber: (row.vendor_number_snapshot as string | null) ?? null,
    contributionType: row.contribution_type as UnionContributionType,
    percentage: asNumber(row.percentage as string | number | null),
    calculationBase: asNumber(row.calculation_base as string | number | null),
    amount: asNumber(row.amount as string | number | null),
    dueDate: (row.due_date as string | null) ?? null,
    apReceiveBy: (row.ap_receive_by as string | null) ?? null,
    mailBy: (row.mail_by as string | null) ?? null,
    status: ((row.status as string | null) ?? "planned") as ContractInstallmentStatus,
    taxIdLast4: (row.tax_id_last4_snapshot as string | null) ?? null,
    checkRequestSubmittedOn: (row.check_request_submitted_on as string | null) ?? null,
    checkPaidOn: (row.check_paid_on as string | null) ?? null,
    automationStatus: ((row.automation_status as string | null) ?? "not_ready") as CheckRequestAutomationStatus,
    automationSentAt: (row.automation_sent_at as string | null) ?? null,
    automationLastError: (row.automation_last_error as string | null) ?? null
  }));

  const projectOptions: ProcurementProjectOption[] = projects.map((project) => ({
    id: project.id,
    name: project.name,
    label: `${project.name}${project.season ? ` (${project.season})` : ""}`,
    organizationId: project.organizationId,
    fiscalYearId: project.fiscalYearId,
    isExternal: project.name.trim().toLowerCase() === "external procurement"
  }));

  return {
    contracts,
    installments,
    unionContributions,
    fiscalYearOptions: fiscalYears,
    organizationOptions: organizations,
    projectOptions,
    accountCodeOptions: accountCodes.filter((account) => !account.isRevenue),
    foapalOptions,
    guestArtistOptions,
    unionAgreementOptions,
    canManageContracts
  };
}
