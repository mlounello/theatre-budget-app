import { getSupabaseServerClient } from "@/lib/supabase-server";

export default async function DebugPage() {
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

  const { data: scopes, error: scopesError } = await supabase
    .from("user_access_scopes")
    .select("id, scope_role, fiscal_year_id, organization_id, project_id, production_category_id, active")
    .order("created_at", { ascending: false });

  const { count: visibleBudgetLines, error: budgetLinesError } = await supabase
    .from("project_budget_lines")
    .select("id", { head: true, count: "exact" })
    .eq("active", true);

  const { count: visiblePurchases, error: purchasesError } = await supabase
    .from("purchases")
    .select("id", { head: true, count: "exact" })
    .neq("status", "cancelled");

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

        <article className="panel">
          <h2>Visible Access Scopes</h2>
          {scopesError ? <p>{scopesError.message}</p> : null}
          <ul>
            {(scopes ?? []).map((s) => (
              <li key={s.id}>
                {s.scope_role} | FY: {s.fiscal_year_id ?? "any"} | Org: {s.organization_id ?? "any"} | Project:{" "}
                {s.project_id ?? "any"} | Category: {s.production_category_id ?? "any"} | Active:{" "}
                {s.active ? "yes" : "no"}
              </li>
            ))}
            {(scopes ?? []).length === 0 ? <li>(none)</li> : null}
          </ul>
        </article>

        <article className="panel">
          <h2>Visible Row Counts</h2>
          {budgetLinesError ? <p>{budgetLinesError.message}</p> : null}
          {purchasesError ? <p>{purchasesError.message}</p> : null}
          <p>
            <strong>Active Budget Lines:</strong> {visibleBudgetLines ?? 0}
          </p>
          <p>
            <strong>Purchases (non-cancelled):</strong> {visiblePurchases ?? 0}
          </p>
        </article>
      </div>
    </section>
  );
}
