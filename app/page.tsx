import Link from "next/link";
import { formatCurrency } from "@/lib/format";
import { getDashboardProjects } from "@/lib/db";
import type { DashboardProject } from "@/lib/db";

export default async function DashboardPage() {
  let projects: DashboardProject[] = [];
  let loadError: string | null = null;

  try {
    projects = await getDashboardProjects();
  } catch {
    loadError = "Unable to load project data. Check Supabase view grants and migration status.";
  }

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
        {loadError ? (
          <article className="projectCard">
            <h2>Data Connection Error</h2>
            <p>{loadError}</p>
          </article>
        ) : null}

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
      </div>
    </section>
  );
}
