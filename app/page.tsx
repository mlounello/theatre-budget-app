import Link from "next/link";
import { redirect } from "next/navigation";
import { formatCurrency } from "@/lib/format";
import {
  getDashboardOpenRequisitions,
  getDashboardOrganizationBudgets,
  getDashboardProjects,
  getFiscalYearOptions,
  getMyBudgetData
} from "@/lib/db";
import type { DashboardOpenRequisition, DashboardOrganizationBudget, DashboardProject } from "@/lib/db";
import { getAccessContext } from "@/lib/access";
import { resolveCurrentFiscalYearId, resolveRequestedFiscalYearId } from "@/lib/fiscal-year-context";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { DashboardRequisitionTable } from "@/app/dashboard-requisition-table";

const REQUISITION_PROCUREMENT_STATUSES = [
  { value: "requested", label: "Requested" },
  { value: "ordered", label: "Ordered" },
  { value: "partial_received", label: "Partially Received" },
  { value: "fully_received", label: "Fully Received" },
  { value: "invoice_sent", label: "Invoice Sent" },
  { value: "invoice_received", label: "Invoice Received" },
  { value: "paid", label: "Paid" },
  { value: "cancelled", label: "Cancelled" }
] as const;

function requisitionProcurementLabel(value: string): string {
  const found = REQUISITION_PROCUREMENT_STATUSES.find((status) => status.value === value);
  return found?.label ?? value;
}

type InstitutionalWarning = {
  id: string;
  label: string;
  amount: number;
};

async function getInstitutionalDashboardWarnings(fiscalYearId: string): Promise<{
  overBudgetBuckets: InstitutionalWarning[];
  pendingVarianceCount: number;
  approvedPostedVarianceCount: number;
}> {
  const supabase = await getSupabaseServerClient();
  let overBudgetQuery = supabase
      .from("v_institutional_monthly_budget_availability")
      .select("budget_plan_month_id, fiscal_year_name, org_code, account_code, account_name, month_start, official_available_amount")
      .lt("official_available_amount", 0)
      .order("official_available_amount", { ascending: true })
      .limit(6);
  let pendingVarianceQuery = supabase
    .from("variance_requests")
    .select("id", { count: "exact", head: true })
    .in("status", ["draft", "ready_for_review", "submitted"]);
  let approvedPostedVarianceQuery = supabase
    .from("variance_requests")
    .select("id", { count: "exact", head: true })
    .in("status", ["approved", "posted"]);

  if (fiscalYearId) {
    overBudgetQuery = overBudgetQuery.eq("fiscal_year_id", fiscalYearId);
    pendingVarianceQuery = pendingVarianceQuery.eq("fiscal_year_id", fiscalYearId);
    approvedPostedVarianceQuery = approvedPostedVarianceQuery.eq("fiscal_year_id", fiscalYearId);
  }

  const [{ data: overBudgetData }, { count: pendingVarianceCount }, { count: approvedPostedVarianceCount }] = await Promise.all([
    overBudgetQuery,
    pendingVarianceQuery,
    approvedPostedVarianceQuery
  ]);

  const overBudgetBuckets = ((overBudgetData ?? []) as Array<{
    budget_plan_month_id?: string | null;
    fiscal_year_name?: string | null;
    org_code?: string | null;
    account_code?: string | null;
    account_name?: string | null;
    month_start?: string | null;
    official_available_amount?: string | number | null;
  }>).map((row) => ({
    id: row.budget_plan_month_id ?? `${row.org_code}:${row.account_code}:${row.month_start}`,
    label: [row.fiscal_year_name, row.org_code, row.account_code, row.account_name, row.month_start ? String(row.month_start).slice(0, 7) : null]
      .filter(Boolean)
      .join(" | "),
    amount: Number(row.official_available_amount ?? 0)
  }));

  return {
    overBudgetBuckets,
    pendingVarianceCount: pendingVarianceCount ?? 0,
    approvedPostedVarianceCount: approvedPostedVarianceCount ?? 0
  };
}

export default async function DashboardPage({
  searchParams
}: {
  searchParams?: Promise<{ fiscalYearId?: string; budgetType?: string }>;
}) {
  const access = await getAccessContext();
  if (!access.userId) redirect("/login");
  if (access.role === "none") redirect("/auth/denied");
  if (access.role === "procurement_tracker") {
    redirect("/procurement-tracker");
  }
  if (access.role === "viewer") {
    const fiscalYears = await getFiscalYearOptions();
    const fiscalYearId = resolveCurrentFiscalYearId(fiscalYears);
    const { cards, openRequisitions } = await getMyBudgetData({ fiscalYearId });
    return (
      <section>
        <div className="heroCard">
          <p className="eyebrow">Scoped Dashboard</p>
          <h1 className="heroTitle">Production Budget Dashboard</h1>
          <p className="heroSubtitle">Open requisitions and scoped project/category cards for your assigned budget areas.</p>
        </div>

        <article className="panel">
          <h2>Requisition Follow-Up</h2>
          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Title</th>
                  <th>Req #</th>
                  <th>PO #</th>
                  <th>Vendor</th>
                  <th>Status</th>
                  <th>Order Value</th>
                </tr>
              </thead>
              <tbody>
                {openRequisitions.length === 0 ? (
                  <tr>
                    <td colSpan={7}>No open requisitions.</td>
                  </tr>
                ) : null}
                {openRequisitions.map((row) => (
                  <tr key={row.id}>
                    <td>
                      {row.projectName}
                      {row.season ? <div>{row.season}</div> : null}
                    </td>
                    <td>{row.title}</td>
                    <td>{row.requisitionNumber ?? "-"}</td>
                    <td>{row.poNumber ?? "-"}</td>
                    <td>{row.vendorName ?? "-"}</td>
                    <td>
                      <span className={`statusChip status-${row.procurementStatus}`}>{requisitionProcurementLabel(row.procurementStatus)}</span>
                    </td>
                    <td>{formatCurrency(row.orderValue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <div className="gridCards">
          {cards.length === 0 ? (
            <article className="projectCard">
              <h2>No scoped cards</h2>
              <p>No scoped budget rows are visible yet.</p>
            </article>
          ) : null}
          {cards.map((card) => (
            <article key={`${card.projectId}:${card.productionCategoryId ?? "none"}`} className="projectCard">
              <div className="projectCardHeader">
                <h2>
                  {card.projectName}
                  {card.season ? ` (${card.season})` : ""} - {card.productionCategoryName}
                </h2>
                <p>
                  {card.fiscalYearName ?? "No Fiscal Year"} | {card.orgCode ?? "-"} | {card.organizationName ?? "No Organization"}
                </p>
              </div>
              <dl className="metricGrid">
                <div>
                  <dt>Allocated</dt>
                  <dd>{formatCurrency(card.allocatedTotal)}</dd>
                </div>
                <div>
                  <dt>YTD</dt>
                  <dd>{formatCurrency(card.ytdTotal)}</dd>
                </div>
                <div>
                  <dt>ENC</dt>
                  <dd>{formatCurrency(card.encTotal)}</dd>
                </div>
                <div>
                  <dt>Held</dt>
                  <dd>{formatCurrency(card.heldTotal)}</dd>
                </div>
                <div>
                  <dt>Pending CC</dt>
                  <dd>{formatCurrency(card.pendingCcTotal)}</dd>
                </div>
                <div>
                  <dt>Obligated</dt>
                  <dd>{formatCurrency(card.obligatedTotal)}</dd>
                </div>
                <div>
                  <dt>Remaining</dt>
                  <dd className={card.remainingTrue < 0 ? "negative" : "positive"}>{formatCurrency(card.remainingTrue)}</dd>
                </div>
                <div>
                  <dt>Remaining if Requested Approved</dt>
                  <dd className={card.remainingIfRequestedApproved < 0 ? "negative" : "positive"}>
                    {formatCurrency(card.remainingIfRequestedApproved)}
                  </dd>
                </div>
              </dl>
              <Link
                href={`/my-budget?projectId=${encodeURIComponent(card.projectId)}`}
                className="buttonLink"
              >
                Open My Budget
              </Link>
            </article>
          ))}
        </div>
      </section>
    );
  }

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const fiscalYears = await getFiscalYearOptions();
  const fiscalYearId = resolveRequestedFiscalYearId(fiscalYears, resolvedSearchParams?.fiscalYearId);
  const requestedBudgetType = String(resolvedSearchParams?.budgetType ?? "all").toLowerCase();
  const budgetType: "all" | "theatre" | "non_theatre" =
    requestedBudgetType === "theatre" || requestedBudgetType === "non_theatre" ? requestedBudgetType : "all";

  let projects: DashboardProject[] = [];
  let organizationBudgets: DashboardOrganizationBudget[] = [];
  let openRequisitions: DashboardOpenRequisition[] = [];
  let institutionalWarnings: Awaited<ReturnType<typeof getInstitutionalDashboardWarnings>> = {
    overBudgetBuckets: [],
    pendingVarianceCount: 0,
    approvedPostedVarianceCount: 0
  };
  let loadError: string | null = null;

  try {
    [projects, organizationBudgets, openRequisitions, institutionalWarnings] = await Promise.all([
      budgetType === "non_theatre" ? Promise.resolve([]) : getDashboardProjects({ fiscalYearId }),
      budgetType === "theatre" ? Promise.resolve([]) : getDashboardOrganizationBudgets({ fiscalYearId }),
      getDashboardOpenRequisitions({ fiscalYearId, budgetType }),
      getInstitutionalDashboardWarnings(fiscalYearId)
    ]);
  } catch {
    loadError = "Unable to load project data. Check Supabase view grants and migration status.";
  }

  return (
    <section>
      <div className="heroCard">
        <p className="eyebrow">Portfolio View</p>
        <h1 className="heroTitle">Budget Dashboard</h1>
        <p className="heroSubtitle">
          View theatre project budgets and non-theatre organization budgets together, or filter either group.
        </p>
      </div>

      <article className="panel">
        <h2>Dashboard Filters</h2>
        <form className="panelGrid">
          <label>
            Fiscal Year
            <select name="fiscalYearId" defaultValue={fiscalYearId}>
              {fiscalYears.map((fiscalYear) => (
                <option key={fiscalYear.id} value={fiscalYear.id}>
                  {fiscalYear.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Budget Type
            <select name="budgetType" defaultValue={budgetType}>
              <option value="all">All Budgets</option>
              <option value="theatre">Theatre Projects</option>
              <option value="non_theatre">Non-Theatre Organizations</option>
            </select>
          </label>
          <div>
            <button className="buttonPrimary" type="submit">Apply</button>
          </div>
        </form>
      </article>

      <DashboardRequisitionTable openRequisitions={openRequisitions} />

      <article className="panel">
        <div className="sectionHeader compactHeader">
          <div>
            <p className="eyebrow">Institutional Budget</p>
            <h2>Monthly Budget Warnings</h2>
          </div>
          <div className="inlineActions">
            <Link href="/institutional-budget" className="buttonLink">
              Monthly View
            </Link>
            <Link href="/variance" className="buttonLink">
              Variance Center
            </Link>
          </div>
        </div>
        <dl className="metricGrid">
          <div>
            <dt>Over-Budget Buckets</dt>
            <dd className={institutionalWarnings.overBudgetBuckets.length > 0 ? "negative" : "positive"}>
              {institutionalWarnings.overBudgetBuckets.length}
            </dd>
          </div>
          <div>
            <dt>Pending Variances</dt>
            <dd>{institutionalWarnings.pendingVarianceCount}</dd>
          </div>
          <div>
            <dt>Approved/Posted Variances</dt>
            <dd>{institutionalWarnings.approvedPostedVarianceCount}</dd>
          </div>
        </dl>
        {institutionalWarnings.overBudgetBuckets.length > 0 ? (
          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>Bucket</th>
                  <th>Official Available</th>
                </tr>
              </thead>
              <tbody>
                {institutionalWarnings.overBudgetBuckets.map((bucket) => (
                  <tr key={bucket.id}>
                    <td>{bucket.label}</td>
                    <td className="negative">{formatCurrency(bucket.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="heroSubtitle">No over-budget institutional monthly buckets.</p>
        )}
      </article>

      <div className="gridCards">
        {loadError ? (
          <article className="projectCard">
            <h2>Data Connection Error</h2>
            <p>{loadError}</p>
          </article>
        ) : null}

        {projects.length === 0 && organizationBudgets.length === 0 ? (
          <article className="projectCard">
            <h2>No budgets found</h2>
            <p>No budgets match the selected fiscal year and budget type.</p>
          </article>
        ) : null}

        {projects.map((project) => (
          <article key={project.projectId} className="projectCard">
            <div className="projectCardHeader">
              <h2>{project.projectName}</h2>
              <p>{project.season ?? "No season"}</p>
            </div>
            <dl className="metricGrid">
              <div>
                <dt>Allocated</dt>
                <dd>{formatCurrency(project.allocatedTotal)}</dd>
              </div>
              <div>
                <dt>YTD</dt>
                <dd>{formatCurrency(project.ytdTotal)}</dd>
              </div>
              <div>
                <dt>ENC</dt>
                <dd>{formatCurrency(project.encTotal)}</dd>
              </div>
              <div>
                <dt>Held</dt>
                <dd>{formatCurrency(project.heldTotal)}</dd>
              </div>
              <div>
                <dt>Pending CC</dt>
                <dd>{formatCurrency(project.pendingCcTotal)}</dd>
              </div>
              <div>
                <dt>Obligated</dt>
                <dd>{formatCurrency(project.obligatedTotal)}</dd>
              </div>
              <div>
                <dt>Remaining</dt>
                <dd className={project.remainingTrue < 0 ? "negative" : "positive"}>
                  {formatCurrency(project.remainingTrue)}
                </dd>
              </div>
              <div>
                <dt>Remaining if Requested Approved</dt>
                <dd className={project.remainingIfRequestedApproved < 0 ? "negative" : "positive"}>
                  {formatCurrency(project.remainingIfRequestedApproved)}
                </dd>
              </div>
            </dl>
            <Link href={`/projects/${project.projectId}`} className="buttonLink">
              Open Budget Board
            </Link>
          </article>
        ))}

        {organizationBudgets.map((organization) => (
          <article key={`organization:${organization.organizationId}`} className="projectCard">
            <div className="projectCardHeader">
              <h2>{organization.organizationName}</h2>
              <p>{organization.fiscalYearName ?? "No Fiscal Year"} | {organization.orgCode} | Non-Theatre</p>
            </div>
            <dl className="metricGrid">
              <div><dt>Allocated</dt><dd>{formatCurrency(organization.allocatedTotal)}</dd></div>
              <div><dt>YTD</dt><dd>{formatCurrency(organization.ytdTotal)}</dd></div>
              <div><dt>ENC</dt><dd>{formatCurrency(organization.encTotal)}</dd></div>
              <div><dt>Held</dt><dd>{formatCurrency(organization.heldTotal)}</dd></div>
              <div><dt>Pending CC</dt><dd>{formatCurrency(organization.pendingCcTotal)}</dd></div>
              <div><dt>Obligated</dt><dd>{formatCurrency(organization.obligatedTotal)}</dd></div>
              <div>
                <dt>Remaining</dt>
                <dd className={organization.remainingTrue < 0 ? "negative" : "positive"}>{formatCurrency(organization.remainingTrue)}</dd>
              </div>
              <div>
                <dt>Remaining if Requested Approved</dt>
                <dd className={organization.remainingIfRequestedApproved < 0 ? "negative" : "positive"}>
                  {formatCurrency(organization.remainingIfRequestedApproved)}
                </dd>
              </div>
            </dl>
            <Link
              href={`/institutional-budget?fiscalYearId=${encodeURIComponent(fiscalYearId)}&organizationId=${encodeURIComponent(organization.organizationId)}`}
              className="buttonLink"
            >
              Open Organization Budget
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}
