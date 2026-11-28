import { getSupabaseServerClient } from "@/lib/supabase-server";
import { asNumber } from "@/lib/db/shared";

export async function getCcPendingRows(params: { fiscalYearId?: string } = {}): Promise<
  Array<{
    scopeId: string;
    projectId: string | null;
    scopeLabel: string;
    budgetCode: string;
    creditCardName: string | null;
    pendingCcTotal: number;
  }>
> {
  const supabase = await getSupabaseServerClient();
  let query = supabase
    .from("purchases")
    .select(
      "id, project_id, organization_id, banner_account_code_id, pending_cc_amount, projects(name, season), organizations(name, org_code), account_codes(code), project_budget_lines(budget_code), credit_cards(nickname)"
    )
    .eq("status", "pending_cc")
    .gt("pending_cc_amount", 0);
  if (params.fiscalYearId) query = query.eq("fiscal_year_id", params.fiscalYearId);
  const { data, error } = await query;

  if (error) throw error;

  const grouped = new Map<string, {
    scopeId: string;
    projectId: string | null;
    scopeLabel: string;
    budgetCode: string;
    creditCardName: string | null;
    pendingCcTotal: number;
  }>();
  for (const row of data ?? []) {
    const project = row.projects as { name?: string; season?: string | null } | null;
    const organization = row.organizations as { name?: string; org_code?: string } | null;
    const account = row.account_codes as { code?: string } | null;
    const budgetLine = row.project_budget_lines as { budget_code?: string } | null;
    const card = row.credit_cards as { nickname?: string } | null;
    const projectId = (row.project_id as string | null) ?? null;
    const organizationId = (row.organization_id as string | null) ?? null;
    const scopeId = projectId ?? `organization:${organizationId ?? "unknown"}`;
    const scopeLabel = project
      ? `${project.name ?? "Project"}${project.season ? ` (${project.season})` : ""}`
      : `${organization?.org_code ?? "-"} | ${organization?.name ?? "Organization Budget"}`;
    const budgetCode = account?.code ?? budgetLine?.budget_code ?? "UNASSIGNED";
    const creditCardName = card?.nickname ?? null;
    const key = `${scopeId}:${budgetCode}:${creditCardName ?? ""}`;
    const current = grouped.get(key) ?? { scopeId, projectId, scopeLabel, budgetCode, creditCardName, pendingCcTotal: 0 };
    current.pendingCcTotal += asNumber(row.pending_cc_amount as string | number | null);
    grouped.set(key, current);
  }
  return [...grouped.values()].sort((a, b) => a.scopeLabel.localeCompare(b.scopeLabel) || a.budgetCode.localeCompare(b.budgetCode));
}
