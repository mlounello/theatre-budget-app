import Link from "next/link";
import { budgetLines, projects } from "@/lib/mock-data";
import { formatCurrency } from "@/lib/format";

function calcProjectTotals(projectId: string): {
  allocated: number;
  ytd: number;
  enc: number;
  pending: number;
  requested: number;
  obligated: number;
  remainingTrue: number;
  remainingIfRequestedApproved: number;
} {
  const lines = budgetLines.filter((line) => line.projectId === projectId);
  const allocated = lines.reduce((sum, line) => sum + line.allocatedAmount, 0);
  const ytd = lines.reduce((sum, line) => sum + line.ytdAmount, 0);
  const enc = lines.reduce((sum, line) => sum + line.encumberedAmount, 0);
  const pending = lines.reduce((sum, line) => sum + line.pendingCcAmount, 0);
  const requested = lines.reduce((sum, line) => sum + line.requestedOpenAmount, 0);
  const obligated = ytd + enc + pending;
  const remainingTrue = allocated - obligated;

  return {
    allocated,
    ytd,
    enc,
    pending,
    requested,
    obligated,
    remainingTrue,
    remainingIfRequestedApproved: remainingTrue - requested
  };
}

export default function DashboardPage(): JSX.Element {
  return (
    <section>
      <div className="heroCard">
        <p className="eyebrow">Portfolio View</p>
        <h1 className="heroTitle">Production Budget Dashboard</h1>
        <p className="heroSubtitle">
          True remaining excludes unapproved requests. Planning overlay shows what remaining would be if open
          requests were approved.
        </p>
      </div>

      <div className="gridCards">
        {projects.map((project) => {
          const totals = calcProjectTotals(project.id);

          return (
            <article key={project.id} className="projectCard">
              <div className="projectCardHeader">
                <h2>{project.name}</h2>
                <p>{project.season}</p>
              </div>
              <dl className="metricGrid">
                <div>
                  <dt>Allocated</dt>
                  <dd>{formatCurrency(totals.allocated)}</dd>
                </div>
                <div>
                  <dt>YTD</dt>
                  <dd>{formatCurrency(totals.ytd)}</dd>
                </div>
                <div>
                  <dt>ENC</dt>
                  <dd>{formatCurrency(totals.enc)}</dd>
                </div>
                <div>
                  <dt>Pending CC</dt>
                  <dd>{formatCurrency(totals.pending)}</dd>
                </div>
                <div>
                  <dt>Remaining (True)</dt>
                  <dd className={totals.remainingTrue < 0 ? "negative" : "positive"}>
                    {formatCurrency(totals.remainingTrue)}
                  </dd>
                </div>
                <div>
                  <dt>Requested (Open)</dt>
                  <dd>{formatCurrency(totals.requested)}</dd>
                </div>
                <div>
                  <dt>Remaining if Requested Approved</dt>
                  <dd className={totals.remainingIfRequestedApproved < 0 ? "negative" : "positive"}>
                    {formatCurrency(totals.remainingIfRequestedApproved)}
                  </dd>
                </div>
              </dl>
              <Link href={`/projects/${project.id}`} className="buttonLink">
                Open Budget Board
              </Link>
            </article>
          );
        })}
      </div>
    </section>
  );
}
