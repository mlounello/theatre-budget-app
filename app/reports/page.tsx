import Link from "next/link";
import { redirect } from "next/navigation";
import { getAccessContext } from "@/lib/access";
import { getDashboardOrganizationBudgets, getDashboardProjects, getFiscalYearOptions } from "@/lib/db";
import { resolveRequestedFiscalYearId } from "@/lib/fiscal-year-context";
import { formatCurrency } from "@/lib/format";

export default async function ReportsPage({
  searchParams
}: {
  searchParams?: Promise<{ fiscalYearId?: string }>;
}) {
  const access = await getAccessContext();
  if (!access.userId) redirect("/login");
  if (!["admin", "project_manager"].includes(access.role)) redirect("/my-budget");

  const params = searchParams ? await searchParams : undefined;
  const fiscalYears = await getFiscalYearOptions();
  const fiscalYearId = resolveRequestedFiscalYearId(fiscalYears, params?.fiscalYearId);
  const [projects, organizations] = await Promise.all([
    getDashboardProjects({ fiscalYearId }),
    getDashboardOrganizationBudgets({ fiscalYearId })
  ]);

  return (
    <section>
      <header className="sectionHeader">
        <p className="eyebrow">Reports</p>
        <h1>Detailed Budget Views</h1>
        <p className="heroSubtitle">Open portfolio summaries, department totals, or an individual budget board.</p>
      </header>

      <article className="panel">
        <form className="inlineEditForm">
          <label>
            Fiscal Year
            <select name="fiscalYearId" defaultValue={fiscalYearId}>
              {fiscalYears.map((fiscalYear) => (
                <option key={fiscalYear.id} value={fiscalYear.id}>{fiscalYear.name}</option>
              ))}
            </select>
          </label>
          <button type="submit" className="buttonLink buttonPrimary">Apply</button>
        </form>
      </article>

      <div className="dashboardReportHubGrid">
        <Link className="dashboardReportHubCard" href={`/overview?fiscalYearId=${encodeURIComponent(fiscalYearId)}`}>
          <strong>Overview</strong>
          <span>Portfolio-level rollups and comparisons.</span>
        </Link>
        <Link className="dashboardReportHubCard" href={`/my-budget?fiscalYearId=${encodeURIComponent(fiscalYearId)}`}>
          <strong>Department Totals</strong>
          <span>Scoped category and department totals.</span>
        </Link>
        <Link className="dashboardReportHubCard" href={`/institutional-budget?fiscalYearId=${encodeURIComponent(fiscalYearId)}`}>
          <strong>Institutional Budget</strong>
          <span>Monthly expense plans, revenue targets, and actuals.</span>
        </Link>
      </div>

      <section aria-labelledby="project-board-heading">
        <div className="sectionHeader compactHeader">
          <div>
            <p className="eyebrow">Theatre</p>
            <h2 id="project-board-heading">Project Budget Boards</h2>
          </div>
        </div>
        <div className="dashboardReportHubGrid">
          {projects.map((project) => (
            <Link className="dashboardReportHubCard" href={`/projects/${project.projectId}`} key={project.projectId}>
              <strong>{project.projectName}</strong>
              <span>{project.season ?? "No season"} · {formatCurrency(project.remainingTrue)} remaining</span>
            </Link>
          ))}
          {projects.length === 0 ? <p className="panel">No project budget boards are available for this fiscal year.</p> : null}
        </div>
      </section>

      <section aria-labelledby="organization-board-heading">
        <div className="sectionHeader compactHeader">
          <div>
            <p className="eyebrow">Non-Theatre</p>
            <h2 id="organization-board-heading">Organization Budget Views</h2>
          </div>
        </div>
        <div className="dashboardReportHubGrid">
          {organizations.map((organization) => (
            <Link
              className="dashboardReportHubCard"
              href={`/institutional-budget?fiscalYearId=${encodeURIComponent(fiscalYearId)}&organizationId=${encodeURIComponent(organization.organizationId)}`}
              key={`${organization.fiscalYearId}:${organization.organizationId}`}
            >
              <strong>{organization.orgCode} · {organization.organizationName}</strong>
              <span>{formatCurrency(organization.remainingTrue)} remaining</span>
            </Link>
          ))}
          {organizations.length === 0 ? <p className="panel">No organization budget views are available for this fiscal year.</p> : null}
        </div>
      </section>
    </section>
  );
}
