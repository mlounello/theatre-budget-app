import { getRevenuePerformanceRows, type FiscalYearOption } from "@/lib/db";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export type DashboardAttentionItem = {
  id: string;
  label: string;
  detail: string;
  href?: string;
};

export type DashboardOperationalAttention = {
  missingReceipts: DashboardAttentionItem[];
  statementsAwaitingReconciliation: DashboardAttentionItem[];
  upcomingContractChecks: DashboardAttentionItem[];
  revenueBehindSchedule: DashboardAttentionItem[];
};

function asNumber(value: string | number | null | undefined): number {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value ?? 0));
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

function scopeLabel(row: Record<string, unknown>): string {
  const project = row.projects as { name?: string; season?: string | null } | null;
  if (project?.name) return `${project.name}${project.season ? ` (${project.season})` : ""}`;
  const organization = row.organizations as { name?: string; org_code?: string } | null;
  return organization ? `${organization.org_code ?? "-"} | ${organization.name ?? "Organization"}` : "Unassigned budget";
}

function fiscalYearProgress(fiscalYear: FiscalYearOption | undefined): number {
  if (!fiscalYear?.startDate || !fiscalYear.endDate) return 0;
  const now = new Date();
  const start = new Date(`${fiscalYear.startDate}T00:00:00`);
  const end = new Date(`${fiscalYear.endDate}T23:59:59`);
  if (now <= start) return 0;
  if (now >= end) return 1;
  return (now.getTime() - start.getTime()) / (end.getTime() - start.getTime());
}

export async function getDashboardOperationalAttention(params: {
  fiscalYearId: string;
  fiscalYear: FiscalYearOption | undefined;
}): Promise<DashboardOperationalAttention> {
  const supabase = await getSupabaseServerClient();

  const [pendingPurchasesResponse, statementsResponse, installmentsResponse, unionContributionsResponse, revenueRows] = await Promise.all([
    supabase
      .from("purchases")
      .select(
        "id, title, pending_cc_amount, projects(name, season), organizations(name, org_code), purchase_receipts(id, amount_received)"
      )
      .eq("fiscal_year_id", params.fiscalYearId)
      .eq("status", "pending_cc")
      .order("created_at", { ascending: false }),
    supabase
      .from("cc_statement_months")
      .select("id, statement_month, posted_at, posted_to_banner_at, credit_cards(nickname)")
      .eq("fiscal_year_id", params.fiscalYearId)
      .is("posted_to_banner_at", null)
      .order("statement_month", { ascending: false }),
    supabase
      .from("contract_installments")
      .select(
        "id, installment_number, installment_amount, status, due_date, mail_by, contracts!inner(id, fiscal_year_id, contractor_name, contract_role)"
      )
      .eq("contracts.fiscal_year_id", params.fiscalYearId)
      .neq("status", "check_paid"),
    supabase
      .from("contract_union_contributions")
      .select(
        "id, fund_name_snapshot, amount, status, due_date, mail_by, contracts!inner(id, fiscal_year_id, contractor_name, contract_role)"
      )
      .eq("contracts.fiscal_year_id", params.fiscalYearId)
      .neq("status", "check_paid"),
    getRevenuePerformanceRows({ fiscalYearId: params.fiscalYearId })
  ]);

  if (pendingPurchasesResponse.error) throw pendingPurchasesResponse.error;
  if (statementsResponse.error) throw statementsResponse.error;
  if (installmentsResponse.error) throw installmentsResponse.error;
  if (unionContributionsResponse.error) throw unionContributionsResponse.error;

  const missingReceipts = ((pendingPurchasesResponse.data ?? []) as Array<Record<string, unknown>>)
    .map((row) => {
      const pendingAmount = asNumber(row.pending_cc_amount as string | number | null);
      const receipts = (row.purchase_receipts as Array<{ amount_received?: string | number | null }> | null) ?? [];
      return {
        id: String(row.id ?? ""),
        label: String(row.title ?? "Credit-card purchase"),
        detail: `${scopeLabel(row)} · ${money(pendingAmount)} authorized · no receipt attached`,
        receiptCount: receipts.length,
        href: `/cc?fiscalYearId=${encodeURIComponent(params.fiscalYearId)}&cc_view=exceptions&cc_purchase=${encodeURIComponent(String(row.id ?? ""))}`
      };
    })
    .filter((row) => row.receiptCount === 0)
    .map(({ id, label, detail, href }) => ({ id, label, detail, href }));

  const statementsAwaitingReconciliation = ((statementsResponse.data ?? []) as Array<Record<string, unknown>>).map((row) => {
    const card = row.credit_cards as { nickname?: string } | null;
    const paid = Boolean(row.posted_at);
    return {
      id: String(row.id ?? ""),
      label: `${String(row.statement_month ?? "").slice(0, 7)} · ${card?.nickname ?? "Credit card"}`,
      detail: paid ? "Statement paid · awaiting Banner posting" : "Open · awaiting reconciliation",
      href: `/cc?fiscalYearId=${encodeURIComponent(params.fiscalYearId)}&cc_view=current&cc_statement=${encodeURIComponent(String(row.id ?? ""))}`
    };
  });

  const today = new Date();
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() + 45);
  const todayKey = today.toISOString().slice(0, 10);
  const cutoffKey = cutoff.toISOString().slice(0, 10);
  const contractChecks = [
    ...((installmentsResponse.data ?? []) as Array<Record<string, unknown>>).map((row) => {
      const contract = row.contracts as { id?: string; contractor_name?: string; contract_role?: string | null } | null;
      return {
        id: `installment:${String(row.id ?? "")}`,
        label: `${contract?.contractor_name ?? "Contractor"} · Installment ${Number(row.installment_number ?? 1)}`,
        amount: asNumber(row.installment_amount as string | number | null),
        date: String(row.mail_by ?? row.due_date ?? ""),
        role: contract?.contract_role ?? null,
        contractId: contract?.id ?? null
      };
    }),
    ...((unionContributionsResponse.data ?? []) as Array<Record<string, unknown>>).map((row) => {
      const contract = row.contracts as { id?: string; contractor_name?: string; contract_role?: string | null } | null;
      return {
        id: `union:${String(row.id ?? "")}`,
        label: `${contract?.contractor_name ?? "Contractor"} · ${String(row.fund_name_snapshot ?? "Union fund")}`,
        amount: asNumber(row.amount as string | number | null),
        date: String(row.mail_by ?? row.due_date ?? ""),
        role: contract?.contract_role ?? null,
        contractId: contract?.id ?? null
      };
    })
  ]
    .filter((row) => row.date && row.date <= cutoffKey)
    .sort((a, b) => a.date.localeCompare(b.date));

  const upcomingContractChecks = contractChecks.map((row) => ({
    id: row.id,
    label: row.label,
    detail: `${row.date < todayKey ? "Overdue" : `Due ${row.date}`} · ${money(row.amount)}${row.role ? ` · ${row.role}` : ""}`,
    href: row.contractId ? `/contracts?fiscalYearId=${encodeURIComponent(params.fiscalYearId)}&ct_edit=${encodeURIComponent(row.contractId)}` : undefined
  }));

  const progress = fiscalYearProgress(params.fiscalYear);
  const revenueBehindSchedule = revenueRows
    .map((row) => {
      const expectedToDate = row.targetAmount * progress;
      const behindPace = Math.max(expectedToDate - row.receivedAmount, 0);
      return {
        id: `${row.organizationId}:${row.accountCodeId}`,
        label: `${row.organizationLabel} · ${row.accountCode}`,
        detail: `${money(row.receivedAmount)} received of ${money(row.targetAmount)} target · ${money(behindPace)} behind pace`,
        behindPace
      };
    })
    .filter((row) => row.behindPace > 0.005)
    .sort((a, b) => b.behindPace - a.behindPace)
    .map(({ id, label, detail }) => ({ id, label, detail }));

  return {
    missingReceipts,
    statementsAwaitingReconciliation,
    upcomingContractChecks,
    revenueBehindSchedule
  };
}
