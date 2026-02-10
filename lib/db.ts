import { getSupabaseServerClient } from "@/lib/supabase-server";
import type { PurchaseStatus } from "@/lib/types";

function asNumber(value: string | number | null): number {
  if (value === null) return 0;
  if (typeof value === "number") return value;
  const parsed = Number.parseFloat(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export type DashboardProject = {
  projectId: string;
  projectName: string;
  season: string | null;
  allocatedTotal: number;
  requestedOpenTotal: number;
  encTotal: number;
  pendingCcTotal: number;
  ytdTotal: number;
  obligatedTotal: number;
  remainingTrue: number;
  remainingIfRequestedApproved: number;
  incomeTotal: number;
};

export type BudgetLineTotal = {
  projectBudgetLineId: string;
  budgetCode: string;
  category: string;
  lineName: string;
  allocatedAmount: number;
  requestedOpenTotal: number;
  encTotal: number;
  pendingCcTotal: number;
  ytdTotal: number;
  obligatedTotal: number;
  remainingTrue: number;
  remainingIfRequestedApproved: number;
};

export type PurchaseRow = {
  id: string;
  projectId: string;
  projectName: string;
  budgetLineId: string;
  budgetCode: string;
  category: string;
  title: string;
  referenceNumber: string | null;
  estimatedAmount: number;
  requestedAmount: number;
  encumberedAmount: number;
  pendingCcAmount: number;
  postedAmount: number;
  status: PurchaseStatus;
  createdAt: string;
};

export type ProjectBudgetLineOption = {
  id: string;
  projectId: string;
  accountCodeId: string | null;
  label: string;
};

export type SettingsProject = {
  id: string;
  name: string;
  season: string | null;
  sortOrder: number;
};

export type AccountCodeOption = {
  id: string;
  code: string;
  category: string;
  name: string;
  label: string;
};

export type FiscalYearOption = {
  id: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  sortOrder: number;
};

export type OrganizationOption = {
  id: string;
  name: string;
  orgCode: string;
  fiscalYearId: string | null;
  fiscalYearName: string | null;
  sortOrder: number;
  label: string;
};

export type OrganizationOverviewRow = {
  organizationId: string;
  organizationName: string;
  orgCode: string;
  fiscalYearName: string | null;
  allocatedTotal: number;
  requestedOpenTotal: number;
  encTotal: number;
  pendingCcTotal: number;
  ytdTotal: number;
  obligatedTotal: number;
  remainingTrue: number;
  remainingIfRequestedApproved: number;
  incomeTotal: number;
};

export type IncomeRow = {
  id: string;
  organizationId: string | null;
  organizationLabel: string;
  projectId: string | null;
  projectName: string | null;
  incomeType: "starting_budget" | "donation" | "ticket_sales" | "other";
  lineName: string;
  referenceNumber: string | null;
  amount: number;
  receivedOn: string | null;
  createdAt: string;
};

export type HierarchyRow = {
  fiscalYearId: string | null;
  fiscalYearName: string | null;
  fiscalYearStartDate: string | null;
  fiscalYearEndDate: string | null;
  fiscalYearSortOrder: number | null;
  organizationId: string | null;
  organizationName: string | null;
  orgCode: string | null;
  organizationSortOrder: number | null;
  projectId: string;
  projectName: string;
  season: string | null;
  projectSortOrder: number | null;
  budgetLineId: string | null;
  budgetLineActive: boolean | null;
  accountCodeId: string | null;
  budgetCode: string | null;
  budgetCategory: string | null;
  budgetLineName: string | null;
  sortOrder: number | null;
  allocatedAmount: number | null;
};

export async function getDashboardProjects(): Promise<DashboardProject[]> {
  const supabase = await getSupabaseServerClient();

  const { data: projectsData, error: projectsError } = await supabase
    .from("projects")
    .select("id, name, season, sort_order")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (projectsError) {
    throw projectsError;
  }

  const projectIds = (projectsData ?? []).map((row) => row.id as string);

  let totalsByProject = new Map<string, { requested: number; enc: number; pending: number; ytd: number }>();
  let summaryByProject = new Map<
    string,
    { allocated: number; obligated: number; remainingTrue: number; remainingIfRequestedApproved: number; income: number }
  >();

  if (projectIds.length > 0) {
    const { data: summaryData, error: summaryError } = await supabase
      .from("v_portfolio_summary")
      .select("project_id, allocated_total, obligated_total, remaining_true, remaining_if_requested_approved, income_total")
      .in("project_id", projectIds);

    if (summaryError) {
      throw summaryError;
    }

    summaryByProject = new Map(
      (summaryData ?? []).map((row) => [
        row.project_id as string,
        {
          allocated: asNumber(row.allocated_total as string | number | null),
          obligated: asNumber(row.obligated_total as string | number | null),
          remainingTrue: asNumber(row.remaining_true as string | number | null),
          remainingIfRequestedApproved: asNumber(row.remaining_if_requested_approved as string | number | null),
          income: asNumber(row.income_total as string | number | null)
        }
      ])
    );

    const { data: totalsData, error: totalsError } = await supabase
      .from("v_project_totals")
      .select("project_id, requested_open_total, enc_total, pending_cc_total, ytd_total")
      .in("project_id", projectIds);

    if (totalsError) {
      throw totalsError;
    }

    totalsByProject = new Map(
      (totalsData ?? []).map((row) => [
        row.project_id as string,
        {
          requested: asNumber(row.requested_open_total as string | number | null),
          enc: asNumber(row.enc_total as string | number | null),
          pending: asNumber(row.pending_cc_total as string | number | null),
          ytd: asNumber(row.ytd_total as string | number | null)
        }
      ])
    );
  }

  return (projectsData ?? []).map((row) => {
    const projectId = row.id as string;
    const totals = totalsByProject.get(projectId);
    const summary = summaryByProject.get(projectId);

    return {
      projectId,
      projectName: (row.name as string) ?? "Untitled Project",
      season: (row.season as string | null) ?? null,
      allocatedTotal: summary?.allocated ?? 0,
      requestedOpenTotal: totals?.requested ?? 0,
      encTotal: totals?.enc ?? 0,
      pendingCcTotal: totals?.pending ?? 0,
      ytdTotal: totals?.ytd ?? 0,
      obligatedTotal: summary?.obligated ?? 0,
      remainingTrue: summary?.remainingTrue ?? 0,
      remainingIfRequestedApproved: summary?.remainingIfRequestedApproved ?? 0,
      incomeTotal: summary?.income ?? 0
    };
  });
}

export async function getProjectBudgetBoard(projectId: string): Promise<{ projectName: string; lines: BudgetLineTotal[] }> {
  const supabase = await getSupabaseServerClient();

  const { data: projectData, error: projectError } = await supabase
    .from("projects")
    .select("name")
    .eq("id", projectId)
    .single();

  if (projectError) {
    throw projectError;
  }

  const { data, error } = await supabase
    .from("v_budget_line_totals")
    .select(
      "project_budget_line_id, budget_code, category, line_name, allocated_amount, requested_open_total, enc_total, pending_cc_total, ytd_total, obligated_total, remaining_true, remaining_if_requested_approved"
    )
    .eq("project_id", projectId)
    .order("category", { ascending: true })
    .order("budget_code", { ascending: true });

  if (error) {
    throw error;
  }

  return {
    projectName: (projectData.name as string) ?? "Project",
    lines: (data ?? []).map((row) => ({
      projectBudgetLineId: row.project_budget_line_id as string,
      budgetCode: row.budget_code as string,
      category: row.category as string,
      lineName: row.line_name as string,
      allocatedAmount: asNumber(row.allocated_amount as string | number | null),
      requestedOpenTotal: asNumber(row.requested_open_total as string | number | null),
      encTotal: asNumber(row.enc_total as string | number | null),
      pendingCcTotal: asNumber(row.pending_cc_total as string | number | null),
      ytdTotal: asNumber(row.ytd_total as string | number | null),
      obligatedTotal: asNumber(row.obligated_total as string | number | null),
      remainingTrue: asNumber(row.remaining_true as string | number | null),
      remainingIfRequestedApproved: asNumber(row.remaining_if_requested_approved as string | number | null)
    }))
  };
}

export async function getRequestsData(): Promise<{
  purchases: PurchaseRow[];
  budgetLineOptions: ProjectBudgetLineOption[];
  accountCodeOptions: AccountCodeOption[];
}> {
  const supabase = await getSupabaseServerClient();

  const { data: purchasesData, error: purchasesError } = await supabase
    .from("purchases")
    .select(
      "id, project_id, budget_line_id, title, reference_number, estimated_amount, requested_amount, encumbered_amount, pending_cc_amount, posted_amount, status, created_at, projects(name), project_budget_lines(budget_code, category)"
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (purchasesError) {
    throw purchasesError;
  }

  const { data: optionsData, error: optionsError } = await supabase
    .from("project_budget_lines")
    .select("id, project_id, account_code_id, budget_code, category, line_name")
    .eq("active", true)
    .order("category", { ascending: true })
    .order("budget_code", { ascending: true });

  if (optionsError) {
    throw optionsError;
  }

  const { data: accountCodeData, error: accountCodeError } = await supabase
    .from("account_codes")
    .select("id, code, category, name")
    .eq("active", true)
    .order("code", { ascending: true });

  if (accountCodeError) {
    throw accountCodeError;
  }

  const purchases: PurchaseRow[] = (purchasesData ?? []).map((row) => {
    const project = row.projects as { name?: string } | null;
    const budgetLine = row.project_budget_lines as { budget_code?: string; category?: string } | null;

    return {
      id: row.id as string,
      projectId: row.project_id as string,
      projectName: project?.name ?? "Unknown Project",
      budgetLineId: row.budget_line_id as string,
      budgetCode: budgetLine?.budget_code ?? "",
      category: budgetLine?.category ?? "",
      title: row.title as string,
      referenceNumber: (row.reference_number as string | null) ?? null,
      estimatedAmount: asNumber(row.estimated_amount as string | number | null),
      requestedAmount: asNumber(row.requested_amount as string | number | null),
      encumberedAmount: asNumber(row.encumbered_amount as string | number | null),
      pendingCcAmount: asNumber(row.pending_cc_amount as string | number | null),
      postedAmount: asNumber(row.posted_amount as string | number | null),
      status: row.status as PurchaseStatus,
      createdAt: row.created_at as string
    };
  });

  const budgetLineOptions: ProjectBudgetLineOption[] = (optionsData ?? []).map((row) => ({
    id: row.id as string,
    projectId: row.project_id as string,
    accountCodeId: (row.account_code_id as string | null) ?? null,
    label: `${row.category as string} | ${row.budget_code as string} | ${row.line_name as string}`
  }));

  const accountCodeOptions: AccountCodeOption[] = (
    (accountCodeData as Array<{ id?: unknown; code?: unknown; category?: unknown; name?: unknown }> | null) ?? []
  ).map((row) => ({
    id: row.id as string,
    code: row.code as string,
    category: row.category as string,
    name: row.name as string,
    label: `${row.code as string} | ${row.category as string} | ${row.name as string}`
  }));

  return { purchases, budgetLineOptions, accountCodeOptions };
}

export async function getCcPendingRows(): Promise<
  Array<{ projectId: string; budgetCode: string; creditCardName: string | null; pendingCcTotal: number }>
> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("v_cc_pending_by_code")
    .select("project_id, budget_code, credit_card_name, pending_cc_total")
    .order("project_id", { ascending: true })
    .order("budget_code", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    projectId: row.project_id as string,
    budgetCode: row.budget_code as string,
    creditCardName: (row.credit_card_name as string | null) ?? null,
    pendingCcTotal: asNumber(row.pending_cc_total as string | number | null)
  }));
}

export async function getSettingsProjects(): Promise<SettingsProject[]> {
  const supabase = await getSupabaseServerClient();

  const { data, error } = await supabase
    .from("projects")
    .select("id, name, season, sort_order")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    season: (row.season as string | null) ?? null,
    sortOrder: (row.sort_order as number | null) ?? 0
  }));
}

export async function getTemplateNames(): Promise<string[]> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.from("budget_templates").select("name").order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => row.name as string);
}

export async function getAccountCodeOptions(): Promise<AccountCodeOption[]> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("account_codes")
    .select("id, code, category, name")
    .eq("active", true)
    .order("code", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id as string,
    code: row.code as string,
    category: row.category as string,
    name: row.name as string,
    label: `${row.code as string} | ${row.category as string} | ${row.name as string}`
  }));
}

export async function getFiscalYearOptions(): Promise<FiscalYearOption[]> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("fiscal_years")
    .select("id, name, start_date, end_date, sort_order")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    startDate: (row.start_date as string | null) ?? null,
    endDate: (row.end_date as string | null) ?? null,
    sortOrder: (row.sort_order as number | null) ?? 0
  }));
}

export async function getOrganizationOptions(): Promise<OrganizationOption[]> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("organizations")
    .select("id, name, org_code, fiscal_year_id, sort_order, fiscal_years(name)")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => {
    const fy = row.fiscal_years as { name?: string } | null;
    const fiscalYearName = fy?.name ?? null;
    return {
      id: row.id as string,
      name: row.name as string,
      orgCode: row.org_code as string,
      fiscalYearId: (row.fiscal_year_id as string | null) ?? null,
      fiscalYearName,
      sortOrder: (row.sort_order as number | null) ?? 0,
      label: `${row.org_code as string} | ${row.name as string}${fiscalYearName ? ` (${fiscalYearName})` : ""}`
    };
  });
}

export async function getOrganizationOverviewRows(): Promise<OrganizationOverviewRow[]> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("v_organization_totals")
    .select(
      "organization_id, organization_name, org_code, fiscal_year_name, allocated_total, requested_open_total, enc_total, pending_cc_total, ytd_total, obligated_total, remaining_true, remaining_if_requested_approved, income_total"
    )
    .order("fiscal_year_name", { ascending: true })
    .order("org_code", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    organizationId: row.organization_id as string,
    organizationName: row.organization_name as string,
    orgCode: row.org_code as string,
    fiscalYearName: (row.fiscal_year_name as string | null) ?? null,
    allocatedTotal: asNumber(row.allocated_total as string | number | null),
    requestedOpenTotal: asNumber(row.requested_open_total as string | number | null),
    encTotal: asNumber(row.enc_total as string | number | null),
    pendingCcTotal: asNumber(row.pending_cc_total as string | number | null),
    ytdTotal: asNumber(row.ytd_total as string | number | null),
    obligatedTotal: asNumber(row.obligated_total as string | number | null),
    remainingTrue: asNumber(row.remaining_true as string | number | null),
    remainingIfRequestedApproved: asNumber(row.remaining_if_requested_approved as string | number | null),
    incomeTotal: asNumber(row.income_total as string | number | null)
  }));
}

export async function getHierarchyRows(): Promise<HierarchyRow[]> {
  const supabase = await getSupabaseServerClient();
  const { data: projects, error } = await supabase
    .from("projects")
    .select(
      "id, name, season, sort_order, organization_id, organizations(id, name, org_code, fiscal_year_id, sort_order, fiscal_years(id, name, start_date, end_date, sort_order)), project_budget_lines(id, account_code_id, budget_code, category, line_name, allocated_amount, sort_order, active)"
    )
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) throw error;

  const rows: HierarchyRow[] = [];

  for (const project of projects ?? []) {
    const organization = project.organizations as
      | {
          id?: string;
          name?: string;
          org_code?: string;
          fiscal_year_id?: string | null;
          sort_order?: number | null;
          fiscal_years?: {
            id?: string;
            name?: string;
            start_date?: string | null;
            end_date?: string | null;
            sort_order?: number | null;
          } | null;
        }
      | null;
    const fiscalYearName = organization?.fiscal_years?.name ?? null;
    const fiscalYearId = (organization?.fiscal_years?.id as string | null) ?? null;
    const fiscalYearStartDate = (organization?.fiscal_years?.start_date as string | null) ?? null;
    const fiscalYearEndDate = (organization?.fiscal_years?.end_date as string | null) ?? null;
    const fiscalYearSortOrder = (organization?.fiscal_years?.sort_order as number | null) ?? null;
    const organizationSortOrder = (organization?.sort_order as number | null) ?? null;
    const projectSortOrder = (project.sort_order as number | null) ?? null;
    const lines = (project.project_budget_lines as
      | Array<{
          id?: string;
          account_code_id?: string | null;
          budget_code?: string;
          category?: string;
          line_name?: string;
          allocated_amount?: string | number | null;
          sort_order?: number | null;
          active?: boolean | null;
        }>
      | null) ?? [];

    if (lines.length === 0) {
      rows.push({
        fiscalYearName,
        fiscalYearId,
        fiscalYearStartDate,
        fiscalYearEndDate,
        fiscalYearSortOrder,
        organizationName: organization?.name ?? null,
        organizationId: (organization?.id as string | null) ?? null,
        orgCode: organization?.org_code ?? null,
        organizationSortOrder,
        projectId: project.id as string,
        projectName: project.name as string,
        season: (project.season as string | null) ?? null,
        projectSortOrder,
        budgetLineId: null,
        budgetLineActive: null,
        accountCodeId: null,
        budgetCode: null,
        budgetCategory: null,
        budgetLineName: null,
        sortOrder: null,
        allocatedAmount: null
      });
      continue;
    }

    for (const line of lines) {
      rows.push({
        fiscalYearName,
        fiscalYearId,
        fiscalYearStartDate,
        fiscalYearEndDate,
        fiscalYearSortOrder,
        organizationName: organization?.name ?? null,
        organizationId: (organization?.id as string | null) ?? null,
        orgCode: organization?.org_code ?? null,
        organizationSortOrder,
        projectId: project.id as string,
        projectName: project.name as string,
        season: (project.season as string | null) ?? null,
        projectSortOrder,
        budgetLineId: (line.id as string | null) ?? null,
        budgetLineActive: (line.active as boolean | null) ?? null,
        accountCodeId: (line.account_code_id as string | null) ?? null,
        budgetCode: line.budget_code ?? null,
        budgetCategory: line.category ?? null,
        budgetLineName: line.line_name ?? null,
        sortOrder: (line.sort_order as number | null) ?? null,
        allocatedAmount:
          line.allocated_amount === null || line.allocated_amount === undefined
            ? null
            : asNumber(line.allocated_amount as string | number | null)
      });
    }
  }

  return rows;
}

export async function getIncomeRows(): Promise<IncomeRow[]> {
  const supabase = await getSupabaseServerClient();

  const withType = await supabase
    .from("income_lines")
    .select(
      "id, project_id, organization_id, line_name, reference_number, amount, received_on, created_at, income_type, projects(name), organizations(name, org_code, fiscal_years(name))"
    )
    .order("created_at", { ascending: false })
    .limit(500);

  if (withType.error) {
    const fallback = await supabase
      .from("income_lines")
      .select("id, project_id, organization_id, line_name, reference_number, amount, received_on, created_at, projects(name)")
      .order("created_at", { ascending: false })
      .limit(500);
    if (fallback.error) throw fallback.error;

    return (fallback.data ?? []).map((row) => {
      const project = row.projects as { name?: string } | null;
      const organizationLabel = (row.organization_id as string | null) ? "Organization" : "Unassigned Organization";
      return {
        id: row.id as string,
        organizationId: (row.organization_id as string | null) ?? null,
        organizationLabel,
        projectId: (row.project_id as string | null) ?? null,
        projectName: project?.name ?? null,
        incomeType: "other",
        lineName: (row.line_name as string) ?? "Income",
        referenceNumber: (row.reference_number as string | null) ?? null,
        amount: asNumber(row.amount as string | number | null),
        receivedOn: (row.received_on as string | null) ?? null,
        createdAt: row.created_at as string
      };
    });
  }

  return (withType.data ?? []).map((row) => {
    const project = row.projects as { name?: string } | null;
    const org = row.organizations as { name?: string; org_code?: string; fiscal_years?: { name?: string } | null } | null;
    const orgLabel = org
      ? `${org.org_code ?? ""} | ${org.name ?? "Organization"}${org.fiscal_years?.name ? ` (${org.fiscal_years.name})` : ""}`
      : "Unassigned Organization";
    const incomeTypeRaw = (row.income_type as string | null) ?? "other";
    const incomeType =
      incomeTypeRaw === "starting_budget" ||
      incomeTypeRaw === "donation" ||
      incomeTypeRaw === "ticket_sales" ||
      incomeTypeRaw === "other"
        ? incomeTypeRaw
        : "other";

    return {
      id: row.id as string,
      organizationId: (row.organization_id as string | null) ?? null,
      organizationLabel: orgLabel,
      projectId: (row.project_id as string | null) ?? null,
      projectName: project?.name ?? null,
      incomeType,
      lineName: (row.line_name as string) ?? "Income",
      referenceNumber: (row.reference_number as string | null) ?? null,
      amount: asNumber(row.amount as string | number | null),
      receivedOn: (row.received_on as string | null) ?? null,
      createdAt: row.created_at as string
    };
  });
}
