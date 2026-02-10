import {
  addBudgetLineAction,
  createAccountCodeAction,
  createFiscalYearAction,
  createOrganizationAction,
  createProjectAction
} from "@/app/settings/actions";
import {
  getAccountCodeOptions,
  getFiscalYearOptions,
  getOrganizationOptions,
  getSettingsProjects,
  getTemplateNames
} from "@/lib/db";

export default async function SettingsPage() {
  const projects = await getSettingsProjects();
  const templates = await getTemplateNames();
  const accountCodes = await getAccountCodeOptions();
  const fiscalYears = await getFiscalYearOptions();
  const organizations = await getOrganizationOptions();

  return (
    <section>
      <header className="sectionHeader">
        <p className="eyebrow">Admin</p>
        <h1>Project and Access Settings</h1>
      </header>

      <div className="panelGrid">
        <article className="panel">
          <h2>Create Fiscal Year</h2>
          <form className="requestForm" action={createFiscalYearAction}>
            <label>
              Name
              <input name="name" required placeholder="Ex: FY 2025-2026" />
            </label>
            <label>
              Start Date
              <input type="date" name="startDate" />
            </label>
            <label>
              End Date
              <input type="date" name="endDate" />
            </label>
            <button type="submit" className="buttonLink buttonPrimary">
              Add Fiscal Year
            </button>
          </form>
        </article>

        <article className="panel">
          <h2>Create Organization</h2>
          <form className="requestForm" action={createOrganizationAction}>
            <label>
              Organization Name
              <input name="name" required placeholder="Ex: Theatre Department" />
            </label>
            <label>
              Org Code
              <input name="orgCode" required placeholder="Ex: ORG-113" />
            </label>
            <label>
              Fiscal Year
              <select name="fiscalYearId">
                <option value="">No fiscal year</option>
                {fiscalYears.map((fy) => (
                  <option key={fy.id} value={fy.id}>
                    {fy.name}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="buttonLink buttonPrimary">
              Add Organization
            </button>
          </form>
        </article>

        <article className="panel">
          <h2>Create Project</h2>
          <p>Create a project and auto-assign yourself as Admin. Template usage is always optional.</p>
          <form className="requestForm" action={createProjectAction}>
            <label>
              Project Name
              <input name="projectName" required placeholder="Ex: Spring Musical 2026" />
            </label>
            <label>
              Season
              <input name="season" placeholder="Ex: Spring 2026" />
            </label>
            <label>
              Organization
              <select name="organizationId">
                <option value="">No organization</option>
                {organizations.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Template
              <select name="templateName" defaultValue="Play/Musical Default">
                {templates.map((templateName) => (
                  <option key={templateName} value={templateName}>
                    {templateName}
                  </option>
                ))}
              </select>
            </label>
            <label className="checkboxLabel">
              <input name="useTemplate" type="checkbox" defaultChecked />
              Apply selected template lines
            </label>
            <button type="submit" className="buttonLink buttonPrimary">
              Create Project
            </button>
          </form>
        </article>

        <article className="panel">
          <h2>Add Account Code</h2>
          <p>Admin-managed master list (university-controlled values).</p>
          <form className="requestForm" action={createAccountCodeAction}>
            <label>
              Code
              <input name="code" required placeholder="Ex: 11310" />
            </label>
            <label>
              Category
              <input name="category" required placeholder="Ex: Scenic" />
            </label>
            <label>
              Name
              <input name="name" required placeholder="Ex: Scenic Supplies" />
            </label>
            <label className="checkboxLabel">
              <input name="active" type="checkbox" defaultChecked />
              Active
            </label>
            <button type="submit" className="buttonLink buttonPrimary">
              Save Account Code
            </button>
          </form>
        </article>

        <article className="panel">
          <h2>Add Budget Line</h2>
          <p>Select from fixed university account codes.</p>
          <form className="requestForm" action={addBudgetLineAction}>
            <label>
              Project
              <select name="projectId" required>
                <option value="">Select project</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name} {project.season ? `(${project.season})` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Account Code
              <select name="accountCodeId" required>
                <option value="">Select account code</option>
                {accountCodes.map((accountCode) => (
                  <option key={accountCode.id} value={accountCode.id}>
                    {accountCode.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Allocated Amount
              <input name="allocatedAmount" type="number" step="0.01" min="0" defaultValue="0" />
            </label>
            <label>
              Sort Order
              <input name="sortOrder" type="number" step="1" min="0" defaultValue="0" />
            </label>
            <button type="submit" className="buttonLink buttonPrimary">
              Add Budget Line
            </button>
          </form>
        </article>

        <article className="panel">
          <h2>Current Projects</h2>
          {projects.length === 0 ? <p>No projects yet. Create your first project above.</p> : null}
          <ul>
            {projects.map((project) => (
              <li key={project.id}>
                {project.name} {project.season ? `- ${project.season}` : ""}
              </li>
            ))}
          </ul>
        </article>
      </div>
    </section>
  );
}
