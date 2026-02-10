import {
  addBudgetLineAction,
  createAccountCodeAction,
  importHierarchyCsvAction,
  updateBudgetLineAction,
  updateFiscalYearAction,
  updateOrganizationAction,
  updateProjectAction
} from "@/app/settings/actions";
import { AddEntityPanel } from "@/app/settings/add-entity-panel";
import {
  getAccountCodeOptions,
  getFiscalYearOptions,
  getHierarchyRows,
  getOrganizationOptions,
  getSettingsProjects,
  getTemplateNames,
  type HierarchyRow
} from "@/lib/db";
import { formatCurrency } from "@/lib/format";

type ProjectGroup = {
  id: string;
  name: string;
  season: string | null;
  rows: HierarchyRow[];
};

type OrganizationGroup = {
  id: string;
  name: string;
  orgCode: string;
  fiscalYearId: string | null;
  projects: Map<string, ProjectGroup>;
};

type FiscalYearGroup = {
  id: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  organizations: Map<string, OrganizationGroup>;
};

export default async function SettingsPage({
  searchParams
}: {
  searchParams?: Promise<{ import?: string; msg?: string }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const importStatus = resolvedSearchParams?.import;
  const importMessage = resolvedSearchParams?.msg;

  const projects = await getSettingsProjects();
  const templates = await getTemplateNames();
  const accountCodes = await getAccountCodeOptions();
  const fiscalYears = await getFiscalYearOptions();
  const organizations = await getOrganizationOptions();
  const hierarchyRows = await getHierarchyRows();

  const groupedByFiscalYear = new Map<string, FiscalYearGroup>();
  const noFiscalYearKey = "__no_fy__";

  for (const row of hierarchyRows) {
    const fyId = row.fiscalYearId ?? noFiscalYearKey;
    const fyName = row.fiscalYearName ?? "No Fiscal Year";
    if (!groupedByFiscalYear.has(fyId)) {
      groupedByFiscalYear.set(fyId, {
        id: fyId,
        name: fyName,
        startDate: row.fiscalYearStartDate,
        endDate: row.fiscalYearEndDate,
        organizations: new Map()
      });
    }
    const fy = groupedByFiscalYear.get(fyId)!;

    const orgId = row.organizationId ?? `__no_org__:${row.projectId}`;
    const orgName = row.organizationName ?? "No Organization";
    const orgCode = row.orgCode ?? "-";

    if (!fy.organizations.has(orgId)) {
      fy.organizations.set(orgId, {
        id: orgId,
        name: orgName,
        orgCode,
        fiscalYearId: row.fiscalYearId,
        projects: new Map()
      });
    }
    const org = fy.organizations.get(orgId)!;

    if (!org.projects.has(row.projectId)) {
      org.projects.set(row.projectId, {
        id: row.projectId,
        name: row.projectName,
        season: row.season,
        rows: []
      });
    }

    org.projects.get(row.projectId)!.rows.push(row);
  }

  const fiscalYearGroups = Array.from(groupedByFiscalYear.values()).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <section>
      <header className="sectionHeader">
        <p className="eyebrow">Admin</p>
        <h1>Project and Access Settings</h1>
        {importStatus === "ok" ? <p className="successNote">CSV import completed.</p> : null}
        {importStatus === "error" ? <p className="errorNote">CSV import failed: {importMessage ?? "Unknown error"}</p> : null}
      </header>

      <div className="panelGrid">
        <AddEntityPanel
          fiscalYears={fiscalYears}
          organizations={organizations}
          templates={templates}
          projects={projects}
          accountCodes={accountCodes}
        />

        <article className="panel panelFull">
          <h2>CSV Import</h2>
          <p>Download template, fill rows, upload to create/update hierarchy and budget lines.</p>
          <div className="inlineActionRow">
            <a className="buttonLink" href="/settings/import-template">
              Download CSV Template
            </a>
          </div>
          <form className="requestForm" action={importHierarchyCsvAction}>
            <label>
              CSV File
              <input name="csvFile" type="file" accept=".csv,text/csv" required />
            </label>
            <button type="submit" className="buttonLink buttonPrimary">
              Import CSV
            </button>
          </form>
        </article>

        <article className="panel panelFull">
          <h2>Hierarchy Reference</h2>
          <p>Fiscal Year {"->"} Organization {"->"} Project {"->"} Budget Line (expand with arrows, edit inline).</p>

          {fiscalYearGroups.length === 0 ? <p>(none)</p> : null}

          {fiscalYearGroups.map((fy) => (
            <details key={fy.id} className="treeNode" open>
              <summary>
                <strong>FY:</strong> {fy.name}
              </summary>
              {fy.id !== noFiscalYearKey ? (
                <form action={updateFiscalYearAction} className="inlineEditForm">
                  <input type="hidden" name="id" value={fy.id} />
                  <input name="name" defaultValue={fy.name} />
                  <input name="startDate" type="date" defaultValue={fy.startDate ?? ""} />
                  <input name="endDate" type="date" defaultValue={fy.endDate ?? ""} />
                  <button type="submit" className="tinyButton">
                    Save FY
                  </button>
                </form>
              ) : null}

              {Array.from(fy.organizations.values())
                .sort((a, b) => a.orgCode.localeCompare(b.orgCode))
                .map((org) => (
                  <details key={org.id} className="treeNode childNode" open>
                    <summary>
                      <strong>Org:</strong> {org.orgCode} - {org.name}
                    </summary>
                    {org.id.startsWith("__no_org__") ? null : (
                      <form action={updateOrganizationAction} className="inlineEditForm">
                        <input type="hidden" name="id" value={org.id} />
                        <input name="name" defaultValue={org.name} />
                        <input name="orgCode" defaultValue={org.orgCode} />
                        <select name="fiscalYearId" defaultValue={org.fiscalYearId ?? ""}>
                          <option value="">No fiscal year</option>
                          {fiscalYears.map((fyOption) => (
                            <option key={fyOption.id} value={fyOption.id}>
                              {fyOption.name}
                            </option>
                          ))}
                        </select>
                        <button type="submit" className="tinyButton">
                          Save Org
                        </button>
                      </form>
                    )}

                    {Array.from(org.projects.values())
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map((project) => (
                        <details key={project.id} className="treeNode childNode" open>
                          <summary>
                            <strong>Project:</strong> {project.name} {project.season ? `(${project.season})` : ""}
                          </summary>
                          <form action={updateProjectAction} className="inlineEditForm">
                            <input type="hidden" name="id" value={project.id} />
                            <input name="name" defaultValue={project.name} />
                            <input name="season" defaultValue={project.season ?? ""} />
                            <select name="organizationId" defaultValue={org.id.startsWith("__no_org__") ? "" : org.id}>
                              <option value="">No organization</option>
                              {organizations.map((orgOption) => (
                                <option key={orgOption.id} value={orgOption.id}>
                                  {orgOption.label}
                                </option>
                              ))}
                            </select>
                            <button type="submit" className="tinyButton">
                              Save Project
                            </button>
                          </form>

                          <div className="tableWrap">
                            <table>
                              <thead>
                                <tr>
                                  <th>Code</th>
                                  <th>Category</th>
                                  <th>Line</th>
                                  <th>Allocated</th>
                                  <th>Sort</th>
                                  <th>Active</th>
                                  <th>Edit</th>
                                </tr>
                              </thead>
                              <tbody>
                                {project.rows.map((line, idx) => (
                                  <tr key={`${project.id}-${line.budgetLineId ?? "none"}-${idx}`}>
                                    <td>{line.budgetCode ?? "-"}</td>
                                    <td>{line.budgetCategory ?? "-"}</td>
                                    <td>{line.budgetLineName ?? "-"}</td>
                                    <td>{line.allocatedAmount === null ? "-" : formatCurrency(line.allocatedAmount)}</td>
                                    <td>{line.sortOrder ?? "-"}</td>
                                    <td>{line.budgetLineId ? (line.budgetLineActive ? "Yes" : "No") : "-"}</td>
                                    <td>
                                      {line.budgetLineId ? (
                                        <form action={updateBudgetLineAction} className="inlineEditForm">
                                          <input type="hidden" name="id" value={line.budgetLineId} />
                                          <select name="accountCodeId" defaultValue={line.accountCodeId ?? ""}>
                                            <option value="">Keep current code</option>
                                            {accountCodes.map((accountCode) => (
                                              <option key={accountCode.id} value={accountCode.id}>
                                                {accountCode.code} | {accountCode.category} | {accountCode.name}
                                              </option>
                                            ))}
                                          </select>
                                          <input
                                            name="allocatedAmount"
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            placeholder="Allocated $"
                                            defaultValue={line.allocatedAmount ?? 0}
                                          />
                                          <input
                                            name="sortOrder"
                                            type="number"
                                            step="1"
                                            min="0"
                                            placeholder="Sort #"
                                            defaultValue={line.sortOrder ?? 0}
                                          />
                                          <label className="checkboxLabel">
                                            <input name="active" type="checkbox" defaultChecked={line.budgetLineActive ?? true} />
                                            Active
                                          </label>
                                          <button type="submit" className="tinyButton">
                                            Save Line
                                          </button>
                                        </form>
                                      ) : (
                                        <form action={addBudgetLineAction} className="inlineEditForm">
                                          <input type="hidden" name="projectId" value={project.id} />
                                          <select name="accountCodeId" required>
                                            <option value="">Account code</option>
                                            {accountCodes.map((accountCode) => (
                                              <option key={accountCode.id} value={accountCode.id}>
                                                {accountCode.code}
                                              </option>
                                            ))}
                                          </select>
                                          <input
                                            name="allocatedAmount"
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            placeholder="Allocated $"
                                            defaultValue={0}
                                          />
                                          <input
                                            name="sortOrder"
                                            type="number"
                                            step="1"
                                            min="0"
                                            placeholder="Sort #"
                                            defaultValue={0}
                                          />
                                          <button type="submit" className="tinyButton">
                                            Add Line
                                          </button>
                                        </form>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </details>
                      ))}
                  </details>
                ))}
            </details>
          ))}
        </article>

        <article className="panel">
          <h2>Current Account Codes</h2>
          <ul>
            {accountCodes.map((ac) => (
              <li key={ac.id}>{ac.label}</li>
            ))}
            {accountCodes.length === 0 ? <li>(none)</li> : null}
          </ul>
          <form action={createAccountCodeAction} className="requestForm">
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
      </div>
    </section>
  );
}
