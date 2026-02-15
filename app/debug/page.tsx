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

  const { data: users, error: usersError } = await supabase
    .from("users")
    .select("id, full_name")
    .order("full_name", { ascending: true });

  const { data: categories, error: categoriesError } = await supabase
    .from("production_categories")
    .select("id, name")
    .order("name", { ascending: true });

  const { data: scopes, error: scopesError } = await supabase
    .from("user_access_scopes")
    .select("id, user_id, scope_role, project_id, production_category_id, active")
    .order("created_at", { ascending: false })
    .limit(200);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const supabaseRef = supabaseUrl.replace("https://", "").split(".")[0] || "unknown";
  const userNameById = new Map((users ?? []).map((row) => [String(row.id), String(row.full_name ?? "")]));
  const projectNameById = new Map(
    (projects ?? []).map((row) => [String(row.id), `${String(row.name ?? "")}${row.season ? ` (${row.season})` : ""}`])
  );
  const categoryNameById = new Map((categories ?? []).map((row) => [String(row.id), String(row.name ?? "")]));

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

        <article className="panel panelFull">
          <h2>Role Test Checklist</h2>
          <p className="heroSubtitle">Use this to validate role routing after each deploy.</p>
          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>Role</th>
                  <th>Expected Nav</th>
                  <th>Expected Access</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Admin</td>
                  <td>Dashboard, Overview, Requests, Procurement, Contracts, Income, CC, Settings, Debug</td>
                  <td>Global settings + all projects</td>
                </tr>
                <tr>
                  <td>Project Manager</td>
                  <td>Dashboard, Overview, Requests, Procurement, Contracts, Income, CC, Settings</td>
                  <td>Managed projects only; no global admin panels</td>
                </tr>
                <tr>
                  <td>Buyer</td>
                  <td>Dashboard, My Budget, Requests</td>
                  <td>Create planning/request entries; no edit/trash</td>
                </tr>
                <tr>
                  <td>Viewer</td>
                  <td>Dashboard, My Budget</td>
                  <td>Read-only scoped budget visibility</td>
                </tr>
                <tr>
                  <td>Procurement Tracker</td>
                  <td>Procurement Tracker</td>
                  <td>Read-only External Procurement rows for scoped organizations</td>
                </tr>
              </tbody>
            </table>
          </div>
        </article>

        <article className="panel panelFull">
          <h2>Visible Access Scopes</h2>
          {scopesError ? <p>{scopesError.message}</p> : null}
          {usersError ? <p>{usersError.message}</p> : null}
          {categoriesError ? <p>{categoriesError.message}</p> : null}
          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>User</th>
                  <th>Role</th>
                  <th>Project</th>
                  <th>Category</th>
                  <th>Active</th>
                </tr>
              </thead>
              <tbody>
                {(scopes ?? []).map((scope) => (
                  <tr key={scope.id as string}>
                    <td>{scope.id as string}</td>
                    <td>
                      {userNameById.get(String(scope.user_id)) || String(scope.user_id)}
                      <br />
                      <small>{String(scope.user_id)}</small>
                    </td>
                    <td>{scope.scope_role as string}</td>
                    <td>
                      {scope.project_id
                        ? (projectNameById.get(String(scope.project_id)) ?? String(scope.project_id))
                        : "-"}
                    </td>
                    <td>
                      {scope.production_category_id
                        ? (categoryNameById.get(String(scope.production_category_id)) ??
                          String(scope.production_category_id))
                        : "-"}
                    </td>
                    <td>{Boolean(scope.active as boolean | null) ? "Yes" : "No"}</td>
                  </tr>
                ))}
                {(scopes ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={6}>(none)</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </article>
      </div>
    </section>
  );
}
