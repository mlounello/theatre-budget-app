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
  label: string;
};

export type SettingsProject = {
  id: string;
  name: string;
  season: string | null;
};

export async function getDashboardProjects(): Promise<DashboardProject[]> {
  const supabase = await getSupabaseServerClient();

  const { data: projectsData, error: projectsError } = await supabase
    .from("projects")
    .select("id, name, season")
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

export async function getRequestsData(): Promise<{ purchases: PurchaseRow[]; budgetLineOptions: ProjectBudgetLineOption[] }> {
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
    .select("id, project_id, budget_code, category, line_name")
    .eq("active", true)
    .order("category", { ascending: true })
    .order("budget_code", { ascending: true });

  if (optionsError) {
    throw optionsError;
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
    label: `${row.category as string} | ${row.budget_code as string} | ${row.line_name as string}`
  }));

  return { purchases, budgetLineOptions };
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
    .select("id, name, season")
    .order("name", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    season: (row.season as string | null) ?? null
  }));
}

export async function getTemplateNames(): Promise<string[]> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.from("budget_templates").select("name").order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => row.name as string);
}
