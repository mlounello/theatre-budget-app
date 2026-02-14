import { getSupabaseServerClient } from "@/lib/supabase-server";
import { getAccessContext } from "@/lib/access";
import { redirect } from "next/navigation";

export default async function DebugPage() {
  const access = await getAccessContext();
  if (!access.userId) redirect("/login");
  if (access.role !== "admin") redirect("/");

  const supabase = await getSupabaseServerClient();

  const {
    data: { user }
  } = await supabase.auth.getUser();

  const { data: memberships, error: membershipsError } = await supabase
    .from("project_memberships")
    .select("project_id, user_id, role, projects(name, season)")
    .order("project_id", { ascending: true });

  const { data: projects, error: projectsError } = await supabase
    .from("projects")
    .select("id, name, season")
    .order("name", { ascending: true });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const supabaseRef = supabaseUrl.replace("https://", "").split(".")[0] || "unknown";

  return (
    <section>
      <header className="sectionHeader">
        <p className="eyebrow">Debug</p>
        <h1>Auth and Access Debug</h1>
      </header>

      <div className="panelGrid">
        <article className="panel">
          <h2>Session</h2>
          <p>
            <strong>Supabase Ref:</strong> {supabaseRef}
          </p>
          <p>
            <strong>User ID:</strong> {user?.id ?? "(none)"}
          </p>
          <p>
            <strong>Email:</strong> {user?.email ?? "(none)"}
          </p>
        </article>

        <article className="panel">
          <h2>Visible Projects</h2>
          {projectsError ? <p>{projectsError.message}</p> : null}
          <ul>
            {(projects ?? []).map((project) => (
              <li key={project.id}>
                {project.id} - {project.name} {project.season ? `(${project.season})` : ""}
              </li>
            ))}
            {(projects ?? []).length === 0 ? <li>(none)</li> : null}
          </ul>
        </article>

        <article className="panel">
          <h2>Visible Memberships</h2>
          {membershipsError ? <p>{membershipsError.message}</p> : null}
          <ul>
            {(memberships ?? []).map((m) => {
              const p = m.projects as { name?: string; season?: string | null } | null;
              return (
                <li key={`${m.project_id}-${m.user_id}`}>
                  {m.project_id} - {p?.name ?? "Unknown"} - {m.role} - {m.user_id}
                </li>
              );
            })}
            {(memberships ?? []).length === 0 ? <li>(none)</li> : null}
          </ul>
        </article>
      </div>
    </section>
  );
}
