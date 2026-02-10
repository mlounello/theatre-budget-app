import { addBudgetLineAction, createProjectAction } from "@/app/settings/actions";
import { getSettingsProjects, getTemplateNames } from "@/lib/db";

export default async function SettingsPage() {
  const projects = await getSettingsProjects();
  const templates = await getTemplateNames();

  return (
    <section>
      <header className="sectionHeader">
        <p className="eyebrow">Admin</p>
        <h1>Project and Access Settings</h1>
      </header>

      <div className="panelGrid">
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
          <h2>Add Budget Line</h2>
          <p>Add manual lines to any project where you have manager/admin access.</p>
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
              Budget Code
              <input name="budgetCode" required placeholder="Ex: 11300" />
            </label>
            <label>
              Category
              <input name="category" required placeholder="Ex: Scenic" />
            </label>
            <label>
              Line Name
              <input name="lineName" required placeholder="Ex: Scenic" />
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
