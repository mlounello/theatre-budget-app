import {
  addProjectMembershipAction,
  addBudgetLineAction,
  createAccountCodeAction,
  createUserAccessScopeAction,
  deleteFiscalYearAction,
  deleteOrganizationAction,
  deleteProductionCategoryAction,
  deleteAccountCodeAction,
  deleteUserAccessScopeAction,
  removeProjectMembershipAction,
  importHierarchyCsvAction,
  updateProductionCategoryAction,
  updateAccountCodeAction,
  updateBudgetLineAction,
  updateFiscalYearAction,
  updateOrganizationAction,
  updateProjectAction
} from "@/app/settings/actions";
import { AddEntityPanel } from "@/app/settings/add-entity-panel";
import { BudgetLineReorder } from "@/app/settings/budget-line-reorder";
import { FiscalYearReorder } from "@/app/settings/fiscal-year-reorder";
import { OrganizationReorder } from "@/app/settings/organization-reorder";
import { ProjectReorder } from "@/app/settings/project-reorder";
import {
  getAccountCodesAdmin,
  getFiscalYearOptions,
  getHierarchyRows,
  getOrganizationOptions,
  getProductionCategoriesAdmin,
  getProductionCategoryOptions,
  getSettingsAccessScopes,
  getSettingsProjectMemberships,
  getSettingsProjects,
  getTemplateNames,
  type HierarchyRow
} from "@/lib/db";
import { formatCurrency } from "@/lib/format";
import { getAccessContext } from "@/lib/access";
import { redirect } from "next/navigation";

type ProjectGroup = {
  id: string;
  name: string;
  season: string | null;
  sortOrder: number;
  rows: HierarchyRow[];
};

type OrganizationGroup = {
  id: string;
  name: string;
  orgCode: string;
  fiscalYearId: string | null;
  sortOrder: number;
  projects: Map<string, ProjectGroup>;
};

type FiscalYearGroup = {
  id: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  sortOrder: number;
  organizations: Map<string, OrganizationGroup>;
};

export default async function SettingsPage({
  searchParams
}: {
  searchParams?: Promise<{
    import?: string;
    msg?: string;
    ok?: string;
    error?: string;
    editType?: "fy" | "org" | "project" | "line" | "account" | "production_category";
    editId?: string;
  }>;
}) {
  const access = await getAccessContext();
  if (!access.userId) redirect("/login");
  if (!["admin", "project_manager"].includes(access.role)) redirect("/my-budget");
  const isAdmin = access.role === "admin";

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const importStatus = resolvedSearchParams?.import;
  const importMessage = resolvedSearchParams?.msg;
  const okMessage = resolvedSearchParams?.ok;
  const errorMessage = resolvedSearchParams?.error;
  const editType = resolvedSearchParams?.editType;
  const editId = resolvedSearchParams?.editId;

  const projectsAll = await getSettingsProjects();
  const templates = await getTemplateNames();
  const allAccountCodes = await getAccountCodesAdmin();
  const productionCategories = await getProductionCategoryOptions();
  const allProductionCategories = await getProductionCategoriesAdmin();
  const fiscalYears = await getFiscalYearOptions();
  const organizations = await getOrganizationOptions();
  const hierarchyRowsAll = await getHierarchyRows();
  const { users: accessUsers, scopes: accessScopes } = await getSettingsAccessScopes();
  const { users: membershipUsers, memberships: projectMemberships } = await getSettingsProjectMemberships();

  const manageableProjectIds = access.manageableProjectIds;
  const projects = isAdmin ? projectsAll : projectsAll.filter((project) => manageableProjectIds.has(project.id));
  const hierarchyRows = isAdmin ? hierarchyRowsAll : hierarchyRowsAll.filter((row) => manageableProjectIds.has(row.projectId));

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
        sortOrder: row.fiscalYearSortOrder ?? 0,
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
        sortOrder: row.organizationSortOrder ?? 0,
        projects: new Map()
      });
    }
    const org = fy.organizations.get(orgId)!;

    if (!org.projects.has(row.projectId)) {
      org.projects.set(row.projectId, {
        id: row.projectId,
        name: row.projectName,
        season: row.season,
        sortOrder: row.projectSortOrder ?? 0,
        rows: []
      });
    }

    org.projects.get(row.projectId)!.rows.push(row);
  }

  const fiscalYearGroups = Array.from(groupedByFiscalYear.values()).sort(
    (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)
  );

  const fiscalYearLookup = new Map(
    fiscalYearGroups.filter((fy) => fy.id !== noFiscalYearKey).map((fy) => [fy.id, fy] as const)
  );

  const organizationLookup = new Map(
    organizations.map((org) => [org.id, { id: org.id, name: org.name, orgCode: org.orgCode, fiscalYearId: org.fiscalYearId }] as const)
  );

  const projectLookup = new Map(
    fiscalYearGroups.flatMap((fy) =>
      Array.from(fy.organizations.values()).flatMap((org) =>
        Array.from(org.projects.values()).map((project) => [project.id, project] as const)
      )
    )
  );

  const budgetLineLookup = new Map(
    fiscalYearGroups.flatMap((fy) =>
      Array.from(fy.organizations.values()).flatMap((org) =>
        Array.from(org.projects.values()).flatMap((project) =>
          project.rows
            .filter((line) => Boolean(line.budgetLineId))
            .map((line) => [line.budgetLineId as string, { ...line, projectId: project.id }] as const)
        )
      )
    )
  );

  const editingFiscalYear = editType === "fy" && editId ? fiscalYearLookup.get(editId) : null;
  const editingOrganization = editType === "org" && editId ? organizationLookup.get(editId) : null;
  const editingProject = editType === "project" && editId ? projectLookup.get(editId) : null;
  const settingsProjectById = new Map(projects.map((project) => [project.id, project] as const));
  const projectCountByFiscalYear = new Map<string, number>();
  for (const project of projects) {
    if (!project.fiscalYearId) continue;
    projectCountByFiscalYear.set(project.fiscalYearId, (projectCountByFiscalYear.get(project.fiscalYearId) ?? 0) + 1);
  }
  const editingFiscalYearProjectCount = editingFiscalYear ? projectCountByFiscalYear.get(editingFiscalYear.id) ?? 0 : 0;
  const editingLine = editType === "line" && editId ? budgetLineLookup.get(editId) : null;
  const accountCodeLookup = new Map(allAccountCodes.map((row) => [row.id, row] as const));
  const editingAccountCode = editType === "account" && editId ? accountCodeLookup.get(editId) : null;
  const productionCategoryLookup = new Map(allProductionCategories.map((row) => [row.id, row] as const));
  const editingProductionCategory =
    editType === "production_category" && editId ? productionCategoryLookup.get(editId) : null;

  return (
    <section>
      <header className="sectionHeader">
        <p className="eyebrow">{isAdmin ? "Admin" : "Project Manager"}</p>
        <h1>Settings</h1>
        {okMessage ? <p className="successNote">{okMessage}</p> : null}
        {errorMessage ? <p className="errorNote">{errorMessage}</p> : null}
        {importStatus === "ok" ? <p className="successNote">CSV import completed.</p> : null}
        {importStatus === "error" ? <p className="errorNote">CSV import failed: {importMessage ?? "Unknown error"}</p> : null}
      </header>

      <div className="panelGrid">
        <article className="panel panelFull">
          <h2>How To Use This Page</h2>
          <p>Step 1: Add or import structure. Step 2: Expand the hierarchy and edit inline. Step 3: Open each Reorder panel only when you need to change display order.</p>
          <p className="heroSubtitle">Hierarchy: Fiscal Year - Organization - Project - Budget Line. Reorder controls are collapsed to reduce clutter.</p>
        </article>

        {isAdmin ? (
          <AddEntityPanel
            fiscalYears={fiscalYears}
            organizations={organizations}
            templates={templates}
            projects={projects}
            productionCategories={productionCategories}
          />
        ) : null}

        {isAdmin ? (
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
        ) : null}

        <article className="panel panelFull">
          <h2>Hierarchy Manager</h2>
          <p>Expand each level to edit records. Use Reorder sections only when you want to change card/table order.</p>
          {isAdmin ? (
            <FiscalYearReorder
              items={fiscalYearGroups.filter((fy) => fy.id !== noFiscalYearKey).map((fy) => ({ id: fy.id, label: fy.name }))}
            />
          ) : null}

          {fiscalYearGroups.length === 0 ? <p>(none)</p> : null}

          {fiscalYearGroups.map((fy) => (
            <details key={fy.id} className="treeNode" open>
              <summary>
                <strong>FY:</strong> {fy.name}
              </summary>
              {isAdmin && fy.id !== noFiscalYearKey ? (
                <div className="inlineActionRow">
                  <a className="tinyButton" href={`/settings?editType=fy&editId=${fy.id}`}>
                    Edit FY
                  </a>
                </div>
              ) : null}

              {isAdmin ? (<OrganizationReorder
                fiscalYearId={fy.id === noFiscalYearKey ? null : fy.id}
                items={Array.from(fy.organizations.values())
                  .filter((orgItem) => !orgItem.id.startsWith("__no_org__"))
                  .sort((a, b) => a.sortOrder - b.sortOrder || a.orgCode.localeCompare(b.orgCode))
                  .map((orgItem) => ({ id: orgItem.id, label: `${orgItem.orgCode} - ${orgItem.name}` }))}
              />) : null}

              {Array.from(fy.organizations.values())
                .sort((a, b) => a.sortOrder - b.sortOrder || a.orgCode.localeCompare(b.orgCode))
                .map((org) => (
                  <details key={org.id} className="treeNode childNode" open>
                    <summary>
                      <strong>Org:</strong> {org.orgCode} - {org.name}
                    </summary>
                    {isAdmin && !org.id.startsWith("__no_org__") ? (
                      <div className="inlineActionRow">
                        <a className="tinyButton" href={`/settings?editType=org&editId=${org.id}`}>
                          Edit Org
                        </a>
                        <form action={deleteOrganizationAction}>
                          <input type="hidden" name="id" value={org.id} />
                          <button type="submit" className="tinyButton dangerButton">
                            Delete Org
                          </button>
                        </form>
                      </div>
                    ) : null}

                    {isAdmin ? (<ProjectReorder
                      organizationId={org.id.startsWith("__no_org__") ? null : org.id}
                      items={Array.from(org.projects.values())
                        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
                        .map((projectItem) => ({
                          id: projectItem.id,
                          label: `${projectItem.name}${projectItem.season ? ` (${projectItem.season})` : ""}`
                        }))}
                    />) : null}

                    {Array.from(org.projects.values())
                      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
                      .map((project) => (
                        <details key={project.id} className="treeNode childNode" open id={`project-${project.id}`}>
                          <summary>
                            <strong>Project:</strong> {project.name} {project.season ? `(${project.season})` : ""}{" "}
                            <em>
                              [
                              {settingsProjectById.get(project.id)?.planningRequestsEnabled
                                ? "Planning Requests: On"
                                : "Planning Requests: Off"}
                              ]
                            </em>
                          </summary>
                          <div className="inlineActionRow">
                            <a className="tinyButton" href={`/settings?editType=project&editId=${project.id}`}>
                              Edit Project
                            </a>
                          </div>

                          <BudgetLineReorder
                            projectId={project.id}
                            lines={[...project.rows]
                              .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
                              .filter((line) => Boolean(line.budgetLineId))
                              .map((line) => ({
                                id: line.budgetLineId as string,
                                label: `${line.budgetCode ?? ""} | ${line.budgetCategory ?? ""} | ${line.budgetLineName ?? ""}`
                              }))}
                          />

                          <div className="tableWrap">
                            <table>
                              <thead>
                                <tr>
                                  <th>Category</th>
                                  <th>Allocated</th>
                                  <th>Display Order</th>
                                  <th>Active</th>
                                  <th>Edit</th>
                                </tr>
                              </thead>
                              <tbody>
                                {[...project.rows]
                                  .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
                                  .map((line, idx) => (
                                  <tr key={`${project.id}-${line.budgetLineId ?? "none"}-${idx}`}>
                                    <td>{line.budgetCategory ?? line.budgetLineName ?? "-"}</td>
                                    <td>{line.allocatedAmount === null ? "-" : formatCurrency(line.allocatedAmount)}</td>
                                    <td>{line.budgetLineId ? idx + 1 : "-"}</td>
                                    <td>{line.budgetLineId ? (line.budgetLineActive ? "Yes" : "No") : "-"}</td>
                                    <td>
                                      {line.budgetLineId ? (
                                        <a className="tinyButton" href={`/settings?editType=line&editId=${line.budgetLineId}`}>
                                          Edit Line
                                        </a>
                                      ) : null}
                                    </td>
                                  </tr>
                                ))}
                                <tr>
                                  <td colSpan={4}>Add a new category allocation line to this project</td>
                                  <td>
                                    <form action={addBudgetLineAction} className="inlineEditForm">
                                      <input type="hidden" name="projectId" value={project.id} />
                                      <select name="productionCategoryId" required>
                                        <option value="">Category</option>
                                        {productionCategories.map((category) => (
                                          <option key={category.id} value={category.id}>
                                            {category.name}
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
                                      <button type="submit" className="tinyButton">
                                        Add Line
                                      </button>
                                    </form>
                                  </td>
                                </tr>
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

        {isAdmin ? (
        <article className="panel panelFull">
          <h2>Current Organizations</h2>
          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>Org Code</th>
                  <th>Name</th>
                  <th>Edit</th>
                  <th>Trash</th>
                </tr>
              </thead>
              <tbody>
                {organizations.map((orgOption) => (
                  <tr key={orgOption.id}>
                    <td>{orgOption.orgCode}</td>
                    <td>{orgOption.name}</td>
                    <td>
                      <a className="tinyButton" href={`/settings?editType=org&editId=${orgOption.id}`}>
                        Edit
                      </a>
                    </td>
                    <td>
                      <form action={deleteOrganizationAction}>
                        <input type="hidden" name="id" value={orgOption.id} />
                        <button type="submit" className="tinyButton dangerButton">
                          Trash
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
                {organizations.length === 0 ? (
                  <tr>
                    <td colSpan={4}>(none)</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </article>
        ) : null}

        {isAdmin ? (
        <article className="panel panelFull">
          <h2>Current Production Categories</h2>
          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Sort</th>
                  <th>Active</th>
                  <th>Edit</th>
                  <th>Trash</th>
                </tr>
              </thead>
              <tbody>
                {allProductionCategories.map((category) => (
                  <tr key={category.id}>
                    <td>{category.name}</td>
                    <td>{category.sortOrder}</td>
                    <td>{category.active ? "Yes" : "No"}</td>
                    <td>
                      <a className="tinyButton" href={`/settings?editType=production_category&editId=${category.id}`}>
                        Edit
                      </a>
                    </td>
                    <td>
                      <form action={deleteProductionCategoryAction}>
                        <input type="hidden" name="id" value={category.id} />
                        <button type="submit" className="tinyButton">
                          Trash
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
                {allProductionCategories.length === 0 ? (
                  <tr>
                    <td colSpan={5}>(none)</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </article>
        ) : null}

        {isAdmin ? (
        <article className="panel panelFull">
          <h2>Current Account Codes</h2>
          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Category</th>
                  <th>Name</th>
                  <th>Active</th>
                  <th>Edit</th>
                  <th>Trash</th>
                </tr>
              </thead>
              <tbody>
                {allAccountCodes.map((ac) => (
                  <tr key={ac.id}>
                    <td>{ac.code}</td>
                    <td>{ac.category}</td>
                    <td>{ac.name}</td>
                    <td>{ac.active ? "Yes" : "No"}</td>
                    <td>
                      <a className="tinyButton" href={`/settings?editType=account&editId=${ac.id}`}>
                        Edit
                      </a>
                    </td>
                    <td>
                      <form action={deleteAccountCodeAction}>
                        <input type="hidden" name="id" value={ac.id} />
                        <button type="submit" className="tinyButton">
                          Trash
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
                {allAccountCodes.length === 0 ? (
                  <tr>
                    <td colSpan={6}>(none)</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
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
        ) : null}

        <article className="panel panelFull">
          <h2>Project Team Access</h2>
          <p className="heroSubtitle">
            {isAdmin
              ? "Assign Admin/PM/Buyer/Viewer roles by project."
              : "Assign PM/Buyer/Viewer roles for projects you manage."}
          </p>
          <form action={addProjectMembershipAction} className="requestForm">
            <label>
              Project
              <select name="projectId" required>
                <option value="">Select project</option>
                {projects
                  .slice()
                  .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
                  .map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                      {project.season ? ` (${project.season})` : ""}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              User
              <select name="userId" required>
                <option value="">Select user</option>
                {membershipUsers.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.fullName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Role
              <select name="role" defaultValue={isAdmin ? "project_manager" : "buyer"}>
                {isAdmin ? <option value="admin">Admin</option> : null}
                <option value="project_manager">Project Manager</option>
                <option value="buyer">Buyer</option>
                <option value="viewer">Viewer</option>
              </select>
            </label>
            <button type="submit" className="buttonLink buttonPrimary">
              Save Team Role
            </button>
          </form>
          <div className="tableWrap" style={{ marginTop: "0.8rem" }}>
            <table>
              <thead>
                <tr>
                  <th>Project</th>
                  <th>User</th>
                  <th>Role</th>
                  <th>Remove</th>
                </tr>
              </thead>
              <tbody>
                {projectMemberships.map((membership) => (
                  <tr key={`${membership.projectId}-${membership.userId}`}>
                    <td>{membership.projectLabel}</td>
                    <td>{membership.userName}</td>
                    <td>{membership.role}</td>
                    <td>
                      <form action={removeProjectMembershipAction}>
                        <input type="hidden" name="projectId" value={membership.projectId} />
                        <input type="hidden" name="userId" value={membership.userId} />
                        <button type="submit" className="tinyButton dangerButton">
                          Remove
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
                {projectMemberships.length === 0 ? (
                  <tr>
                    <td colSpan={4}>(none)</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </article>

        <article className="panel panelFull">
          <h2>User Access Scopes</h2>
          <p className="heroSubtitle">
            {isAdmin
              ? "Assign optional FY/Org/Project/Department scope rows."
              : "Assign Buyer/Viewer scope rows for projects you manage."}
          </p>
          <form action={createUserAccessScopeAction} className="requestForm">
            <label>
              User
              <select name="userId" required>
                <option value="">Select user</option>
                {accessUsers.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.fullName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Role
              <select name="scopeRole" defaultValue="buyer">
                {isAdmin ? <option value="admin">Admin</option> : null}
                {isAdmin ? <option value="project_manager">Project Manager</option> : null}
                <option value="buyer">Buyer</option>
                <option value="viewer">Viewer</option>
              </select>
            </label>
            <label>
              Projects (multi)
              <select name="projectIds" multiple size={6}>
                {projects
                  .slice()
                  .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
                  .map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                      {project.season ? ` (${project.season})` : ""}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Departments (multi)
              <select name="productionCategoryIds" multiple size={6}>
                {productionCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Fiscal Year
              <select name="fiscalYearId">
                <option value="">(optional)</option>
                {fiscalYears.map((fiscalYear) => (
                  <option key={fiscalYear.id} value={fiscalYear.id}>
                    {fiscalYear.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Organization
              <select name="organizationId">
                <option value="">(optional)</option>
                {organizations.map((organization) => (
                  <option key={organization.id} value={organization.id}>
                    {organization.label}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="buttonLink buttonPrimary">
              Save Scope
            </button>
          </form>
          <div className="tableWrap" style={{ marginTop: "0.8rem" }}>
            <table>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Project</th>
                  <th>Category</th>
                  <th>Active</th>
                  <th>Remove</th>
                </tr>
              </thead>
              <tbody>
                {accessScopes.map((scope) => (
                  <tr key={scope.id}>
                    <td>{scope.userName}</td>
                    <td>{scope.scopeRole}</td>
                    <td>{projects.find((project) => project.id === scope.projectId)?.name ?? "-"}</td>
                    <td>{productionCategories.find((category) => category.id === scope.productionCategoryId)?.name ?? "-"}</td>
                    <td>{scope.active ? "Yes" : "No"}</td>
                    <td>
                      <form action={deleteUserAccessScopeAction}>
                        <input type="hidden" name="id" value={scope.id} />
                        <button type="submit" className="tinyButton dangerButton">
                          Remove
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
                {accessScopes.length === 0 ? (
                  <tr>
                    <td colSpan={6}>(none)</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </article>
      </div>

      {isAdmin && editingFiscalYear ? (
        <div className="modalOverlay" role="dialog" aria-modal="true" aria-label="Edit fiscal year">
          <div className="modalPanel">
            <h2>Edit Fiscal Year</h2>
            <form action={updateFiscalYearAction} className="requestForm">
              <input type="hidden" name="id" value={editingFiscalYear.id} />
              <label>
                Name
                <input name="name" defaultValue={editingFiscalYear.name} required />
              </label>
              <label>
                Start Date
                <input name="startDate" type="date" defaultValue={editingFiscalYear.startDate ?? ""} />
              </label>
              <label>
                End Date
                <input name="endDate" type="date" defaultValue={editingFiscalYear.endDate ?? ""} />
              </label>
              <div className="modalActions">
                <a className="tinyButton" href="/settings">
                  Cancel
                </a>
                <button type="submit" className="buttonLink buttonPrimary">
                  Save FY
                </button>
              </div>
            </form>
            <form action={deleteFiscalYearAction} className="requestForm">
              <input type="hidden" name="id" value={editingFiscalYear.id} />
              <p className="heroSubtitle">Linked projects: {editingFiscalYearProjectCount}</p>
              <label className="checkboxLabel">
                <input name="clearProjectAssignments" type="checkbox" />
                Clear project fiscal year assignments before delete
              </label>
              <button type="submit" className="tinyButton dangerButton">
                Delete Fiscal Year
              </button>
            </form>
          </div>
        </div>
      ) : null}

      {isAdmin && editingOrganization ? (
        <div className="modalOverlay" role="dialog" aria-modal="true" aria-label="Edit organization">
          <div className="modalPanel">
            <h2>Edit Organization</h2>
            <form action={updateOrganizationAction} className="requestForm">
              <input type="hidden" name="id" value={editingOrganization.id} />
              <label>
                Name
                <input name="name" defaultValue={editingOrganization.name} required />
              </label>
              <label>
                Org Code
                <input name="orgCode" defaultValue={editingOrganization.orgCode} required />
              </label>
              <div className="modalActions">
                <a className="tinyButton" href="/settings">
                  Cancel
                </a>
                <button type="submit" className="buttonLink buttonPrimary">
                  Save Org
                </button>
              </div>
            </form>
            <form action={deleteOrganizationAction} className="requestForm">
              <input type="hidden" name="id" value={editingOrganization.id} />
              <label className="checkboxLabel">
                <input name="clearProjectAssignments" type="checkbox" />
                Clear project organization assignments before delete
              </label>
              <button type="submit" className="tinyButton dangerButton">
                Delete Organization
              </button>
            </form>
          </div>
        </div>
      ) : null}

      {editingProject ? (
        <div className="modalOverlay" role="dialog" aria-modal="true" aria-label="Edit project">
          <div className="modalPanel">
            <h2>Edit Project</h2>
            <form action={updateProjectAction} className="requestForm">
              <input type="hidden" name="id" value={editingProject.id} />
              <label>
                Name
                <input name="name" defaultValue={editingProject.name} required />
              </label>
              <label>
                Season
                <input name="season" defaultValue={editingProject.season ?? ""} />
              </label>
              <label>
                Fiscal Year
                <select
                  name="fiscalYearId"
                  defaultValue={projects.find((project) => project.id === editingProject.id)?.fiscalYearId ?? ""}
                >
                  <option value="">No fiscal year</option>
                  {fiscalYears.map((fy) => (
                    <option key={fy.id} value={fy.id}>
                      {fy.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Organization
                <select
                  name="organizationId"
                  defaultValue={projects.find((project) => project.id === editingProject.id)?.organizationId ?? ""}
                >
                  <option value="">No organization</option>
                  {organizations.map((orgOption) => (
                    <option key={orgOption.id} value={orgOption.id}>
                      {orgOption.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="checkboxLabel">
                <input
                  name="planningRequestsEnabled"
                  type="checkbox"
                  defaultChecked={projects.find((project) => project.id === editingProject.id)?.planningRequestsEnabled ?? true}
                />
                Enable Planning Requests for this project
              </label>
              <div className="modalActions">
                <a className="tinyButton" href="/settings">
                  Cancel
                </a>
                <button type="submit" className="buttonLink buttonPrimary">
                  Save Project
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {editingLine ? (
        <div className="modalOverlay" role="dialog" aria-modal="true" aria-label="Edit budget line">
          <div className="modalPanel">
            <h2>Edit Budget Line</h2>
            <form action={updateBudgetLineAction} className="requestForm">
              <input type="hidden" name="id" value={editingLine.budgetLineId ?? ""} />
              <input type="hidden" name="currentProjectId" value={editingLine.projectId} />
              <label>
                Move to Project
                <select name="targetProjectId" defaultValue={editingLine.projectId}>
                  {projects
                    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
                    .map((project) => {
                      const orgLabel = organizations.find((org) => org.id === project.organizationId)?.label ?? "No org";
                      return (
                        <option key={project.id} value={project.id}>
                          {project.name} {project.season ? `(${project.season})` : ""} | {orgLabel}
                        </option>
                      );
                    })}
                </select>
              </label>
              <label>
                Department
                <select name="productionCategoryId" defaultValue="">
                  <option value="">(unchanged)</option>
                  {productionCategories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Allocated
                <input
                  name="allocatedAmount"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={editingLine.allocatedAmount ?? 0}
                  required
                />
              </label>
              <label>
                Active
                <select name="active" defaultValue={editingLine.budgetLineActive ? "on" : "off"}>
                  <option value="on">Yes</option>
                  <option value="off">No</option>
                </select>
              </label>
              <div className="modalActions">
                <a className="tinyButton" href="/settings">
                  Cancel
                </a>
                <button type="submit" className="buttonLink buttonPrimary">
                  Save Line
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {isAdmin && editingAccountCode ? (
        <div className="modalOverlay" role="dialog" aria-modal="true" aria-label="Edit account code">
          <div className="modalPanel">
            <h2>Edit Account Code</h2>
            <form action={updateAccountCodeAction} className="requestForm">
              <input type="hidden" name="id" value={editingAccountCode.id} />
              <label>
                Code
                <input name="code" defaultValue={editingAccountCode.code} required />
              </label>
              <label>
                Category
                <input name="category" defaultValue={editingAccountCode.category} required />
              </label>
              <label>
                Name
                <input name="name" defaultValue={editingAccountCode.name} required />
              </label>
              <label>
                Active
                <select name="active" defaultValue={editingAccountCode.active ? "true" : "false"}>
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              </label>
              <div className="modalActions">
                <a className="tinyButton" href="/settings">
                  Cancel
                </a>
                <button type="submit" className="buttonLink buttonPrimary">
                  Save Account Code
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {isAdmin && editingProductionCategory ? (
        <div className="modalOverlay" role="dialog" aria-modal="true" aria-label="Edit production category">
          <div className="modalPanel">
            <h2>Edit Production Category</h2>
            <form action={updateProductionCategoryAction} className="requestForm">
              <input type="hidden" name="id" value={editingProductionCategory.id} />
              <label>
                Name
                <input name="name" defaultValue={editingProductionCategory.name} required />
              </label>
              <label>
                Sort Order
                <input name="sortOrder" type="number" step="1" defaultValue={editingProductionCategory.sortOrder} />
              </label>
              <label>
                Active
                <select name="active" defaultValue={editingProductionCategory.active ? "true" : "false"}>
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              </label>
              <div className="modalActions">
                <a className="tinyButton" href="/settings">
                  Cancel
                </a>
                <button type="submit" className="buttonLink buttonPrimary">
                  Save Category
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  );
}
