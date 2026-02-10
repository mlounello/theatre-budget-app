import Link from "next/link";
import { formatCurrency } from "@/lib/format";
import { getDashboardProjects } from "@/lib/db";

export default async function DashboardPage() {
  const projects = await getDashboardProjects();

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
        {projects.length === 0 ? (
          <article className="projectCard">
            <h2>No projects yet</h2>
            <p>Add projects and budget lines in Supabase to start tracking.</p>
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
                <dt>Pending CC</dt>
                <dd>{formatCurrency(project.pendingCcTotal)}</dd>
              </div>
              <div>
                <dt>Remaining (True)</dt>
                <dd className={project.remainingTrue < 0 ? "negative" : "positive"}>
                  {formatCurrency(project.remainingTrue)}
                </dd>
              </div>
              <div>
                <dt>Requested (Open)</dt>
                <dd>{formatCurrency(project.requestedOpenTotal)}</dd>
              </div>
              <div>
                <dt>Income</dt>
                <dd>{formatCurrency(project.incomeTotal)}</dd>
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
      </div>
    </section>
  );
}
