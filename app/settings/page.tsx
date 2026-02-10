export default function SettingsPage() {
  return (
    <section>
      <header className="sectionHeader">
        <p className="eyebrow">Admin</p>
        <h1>Project and Access Settings</h1>
      </header>

      <div className="panelGrid">
        <article className="panel">
          <h2>Project Creation</h2>
          <p>Every new project requires an explicit choice: blank or template (Play/Musical).</p>
          <ul>
            <li>Blank project</li>
            <li>Use template</li>
          </ul>
        </article>

        <article className="panel">
          <h2>Role Scopes</h2>
          <ul>
            <li>Admin: all projects and settings</li>
            <li>Project Manager: assigned projects only</li>
            <li>Buyer: assigned projects + budget code scope</li>
            <li>Viewer: read-only running lists, no CSV export</li>
          </ul>
        </article>

        <article className="panel">
          <h2>Bootstrap Checklist</h2>
          <ul>
            <li>Run SQL migrations in order.</li>
            <li>Create at least one project and budget line.</li>
            <li>Add your user to `project_memberships` as `admin` for that project.</li>
            <li>Then create purchase requests from the Requests page.</li>
          </ul>
        </article>
      </div>
    </section>
  );
}
