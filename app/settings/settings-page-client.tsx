"use client";

import { useActionState, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  addProjectMembershipAction,
  addBudgetLineAction,
  createAccountCodeAction,
  createUserAccessScopeAction,
  archiveUserProfileAction,
  deleteFiscalYearAction,
  deleteOrganizationAction,
  deleteProductionCategoryAction,
  deleteAccountCodeAction,
  deleteUserAccessScopeAction,
  updateUserAccessScopeAction,
  removeProjectMembershipAction,
  importHierarchyCsvAction,
  updateProductionCategoryAction,
  updateAccountCodeAction,
  updateBudgetLineAction,
  updateFiscalYearAction,
  updateOrganizationAction,
  updateProjectAction,
  syncAppUsersAction,
  type ActionState
} from "@/app/settings/actions";
import { AddEntityPanel } from "@/app/settings/add-entity-panel";
import { BudgetLineReorder } from "@/app/settings/budget-line-reorder";
import { FiscalYearReorder } from "@/app/settings/fiscal-year-reorder";
import { HierarchyTreeControls } from "@/app/settings/hierarchy-tree-controls";
import { OrganizationReorder } from "@/app/settings/organization-reorder";
import { ProjectReorder } from "@/app/settings/project-reorder";
import type {
  AccountCodeAdminRow,
  FiscalYearOption,
  HierarchyRow,
  OrganizationOption,
  ProductionCategoryAdminRow,
  ProductionCategoryOption,
  SettingsProject,
  SettingsAccessScopeRow,
  SettingsUserRow,
  SettingsProjectMembershipRow,
  SettingsUserRow as SettingsProjectMembershipUser
} from "@/lib/db";
import { formatCurrency } from "@/lib/format";

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

type Props = {
  isAdmin: boolean;
  accessUserId: string;
  projects: SettingsProject[];
  templates: string[];
  allAccountCodes: AccountCodeAdminRow[];
  productionCategories: ProductionCategoryOption[];
  allProductionCategories: ProductionCategoryAdminRow[];
  fiscalYears: FiscalYearOption[];
  organizations: OrganizationOption[];
  hierarchyRows: HierarchyRow[];
  accessUsers: SettingsUserRow[];
  accessScopes: SettingsAccessScopeRow[];
  membershipUsers: SettingsProjectMembershipUser[];
  projectMemberships: SettingsProjectMembershipRow[];
};

const initialState: ActionState = { ok: true, message: "", timestamp: 0 };

export function SettingsPageClient({
  isAdmin,
  accessUserId,
  projects,
  templates,
  allAccountCodes,
  productionCategories,
  allProductionCategories,
  fiscalYears,
  organizations,
  hierarchyRows,
  accessUsers,
  accessScopes,
  membershipUsers,
  projectMemberships
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editType = (searchParams.get("editType") ?? "") as "fy" | "org" | "project" | "line" | "account" | "production_category" | "";
  const editId = searchParams.get("editId") ?? "";
  const scopeEditId = searchParams.get("scopeEditId") ?? "";

  const [syncState, syncAction] = useActionState(syncAppUsersAction, initialState);
  const [importState, importAction] = useActionState(importHierarchyCsvAction, initialState);
  const [addBudgetLineState, addBudgetLineActionForm] = useActionState(addBudgetLineAction, initialState);
  const [createAccountCodeState, createAccountCodeActionForm] = useActionState(createAccountCodeAction, initialState);
  const [addProjectMembershipState, addProjectMembershipActionForm] = useActionState(addProjectMembershipAction, initialState);
  const [removeProjectMembershipState, removeProjectMembershipActionForm] = useActionState(removeProjectMembershipAction, initialState);
  const [createScopeState, createScopeActionForm] = useActionState(createUserAccessScopeAction, initialState);
  const [deleteScopeState, deleteScopeActionForm] = useActionState(deleteUserAccessScopeAction, initialState);
  const [updateScopeState, updateScopeActionForm] = useActionState(updateUserAccessScopeAction, initialState);
  const [archiveUserState, archiveUserActionForm] = useActionState(archiveUserProfileAction, initialState);

  const [deleteOrganizationInlineState, deleteOrganizationInlineAction] = useActionState(deleteOrganizationAction, initialState);
  const [deleteProductionCategoryState, deleteProductionCategoryActionForm] = useActionState(deleteProductionCategoryAction, initialState);
  const [deleteAccountCodeState, deleteAccountCodeActionForm] = useActionState(deleteAccountCodeAction, initialState);

  const [updateFiscalYearState, updateFiscalYearActionForm] = useActionState(updateFiscalYearAction, initialState);
  const [deleteFiscalYearState, deleteFiscalYearActionForm] = useActionState(deleteFiscalYearAction, initialState);
  const [updateOrganizationState, updateOrganizationActionForm] = useActionState(updateOrganizationAction, initialState);
  const [deleteOrganizationModalState, deleteOrganizationModalAction] = useActionState(deleteOrganizationAction, initialState);
  const [updateProjectState, updateProjectActionForm] = useActionState(updateProjectAction, initialState);
  const [updateBudgetLineState, updateBudgetLineActionForm] = useActionState(updateBudgetLineAction, initialState);
  const [updateAccountCodeState, updateAccountCodeActionForm] = useActionState(updateAccountCodeAction, initialState);
  const [updateProductionCategoryState, updateProductionCategoryActionForm] = useActionState(updateProductionCategoryAction, initialState);

  const [lastDeleted, setLastDeleted] = useState<{ type: string; id: string } | null>(null);

  const noFiscalYearKey = "__no_fy__";

  const groupedByFiscalYear = useMemo(() => {
    const grouped = new Map<string, FiscalYearGroup>();
    for (const row of hierarchyRows) {
      const fyId = row.fiscalYearId ?? noFiscalYearKey;
      const fyName = row.fiscalYearName ?? "No Fiscal Year";
      if (!grouped.has(fyId)) {
        grouped.set(fyId, {
          id: fyId,
          name: fyName,
          startDate: row.fiscalYearStartDate,
          endDate: row.fiscalYearEndDate,
          sortOrder: row.fiscalYearSortOrder ?? 0,
          organizations: new Map()
        });
      }
      const fy = grouped.get(fyId)!;

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
    return grouped;
  }, [hierarchyRows]);

  const fiscalYearGroups = useMemo(() => {
    return Array.from(groupedByFiscalYear.values()).sort(
      (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)
    );
  }, [groupedByFiscalYear]);

  const fiscalYearLookup = useMemo(() => {
    return new Map(
      fiscalYearGroups.filter((fy) => fy.id !== noFiscalYearKey).map((fy) => [fy.id, fy] as const)
    );
  }, [fiscalYearGroups]);

  const organizationLookup = useMemo(() => {
    return new Map(
      organizations.map((org) => [org.id, { id: org.id, name: org.name, orgCode: org.orgCode, fiscalYearId: org.fiscalYearId }] as const)
    );
  }, [organizations]);

  const projectLookup = useMemo(() => {
    return new Map(
      fiscalYearGroups.flatMap((fy) =>
        Array.from(fy.organizations.values()).flatMap((org) =>
          Array.from(org.projects.values()).map((project) => [project.id, project] as const)
        )
      )
    );
  }, [fiscalYearGroups]);

  const budgetLineLookup = useMemo(() => {
    return new Map(
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
  }, [fiscalYearGroups]);

  const editingFiscalYear = editType === "fy" && editId ? fiscalYearLookup.get(editId) : null;
  const editingOrganization = editType === "org" && editId ? organizationLookup.get(editId) : null;
  const editingProject = editType === "project" && editId ? projectLookup.get(editId) : null;

  const settingsProjectById = useMemo(() => new Map(projects.map((project) => [project.id, project] as const)), [projects]);

  const projectCountByFiscalYear = useMemo(() => {
    const map = new Map<string, number>();
    for (const project of projects) {
      if (!project.fiscalYearId) continue;
      map.set(project.fiscalYearId, (map.get(project.fiscalYearId) ?? 0) + 1);
    }
    return map;
  }, [projects]);

  const editingFiscalYearProjectCount = editingFiscalYear ? projectCountByFiscalYear.get(editingFiscalYear.id) ?? 0 : 0;
  const editingLine = editType === "line" && editId ? budgetLineLookup.get(editId) : null;

  const accountCodeLookup = useMemo(() => new Map(allAccountCodes.map((row) => [row.id, row] as const)), [allAccountCodes]);
  const editingAccountCode = editType === "account" && editId ? accountCodeLookup.get(editId) : null;

  const productionCategoryLookup = useMemo(() => new Map(allProductionCategories.map((row) => [row.id, row] as const)), [allProductionCategories]);
  const editingProductionCategory = editType === "production_category" && editId ? productionCategoryLookup.get(editId) : null;

  const editingScope = scopeEditId ? accessScopes.find((scope) => scope.id === scopeEditId) ?? null : null;

  const [fyForm, setFyForm] = useState({ name: "", startDate: "", endDate: "" });
  const [orgForm, setOrgForm] = useState({ name: "", orgCode: "" });
  const [projectForm, setProjectForm] = useState({
    name: "",
    season: "",
    fiscalYearId: "",
    organizationId: "",
    planningRequestsEnabled: true
  });
  const [lineForm, setLineForm] = useState({
    targetProjectId: "",
    productionCategoryId: "",
    allocatedAmount: "",
    active: "on"
  });
  const [accountCodeForm, setAccountCodeForm] = useState({
    code: "",
    category: "",
    name: "",
    active: "true",
    isRevenue: "false"
  });
  const [productionCategoryForm, setProductionCategoryForm] = useState({
    name: "",
    sortOrder: "",
    active: "true"
  });
  const [scopeForm, setScopeForm] = useState({
    scopeRole: "buyer",
    projectId: "",
    productionCategoryId: "",
    fiscalYearId: "",
    organizationId: "",
    active: "true"
  });
  const lastFiscalYearIdRef = useRef<string | null>(null);
  const lastOrganizationIdRef = useRef<string | null>(null);
  const lastProjectIdRef = useRef<string | null>(null);
  const lastLineIdRef = useRef<string | null>(null);
  const lastAccountCodeIdRef = useRef<string | null>(null);
  const lastProductionCategoryIdRef = useRef<string | null>(null);
  const lastScopeIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!editingFiscalYear) {
      lastFiscalYearIdRef.current = null;
      return;
    }
    if (lastFiscalYearIdRef.current === editingFiscalYear.id) return;
    lastFiscalYearIdRef.current = editingFiscalYear.id;
    setFyForm({
      name: editingFiscalYear.name ?? "",
      startDate: editingFiscalYear.startDate ?? "",
      endDate: editingFiscalYear.endDate ?? ""
    });
  }, [editingFiscalYear]);

  useEffect(() => {
    if (!editingOrganization) {
      lastOrganizationIdRef.current = null;
      return;
    }
    if (lastOrganizationIdRef.current === editingOrganization.id) return;
    lastOrganizationIdRef.current = editingOrganization.id;
    setOrgForm({
      name: editingOrganization.name ?? "",
      orgCode: editingOrganization.orgCode ?? ""
    });
  }, [editingOrganization]);

  useEffect(() => {
    if (!editingProject) {
      lastProjectIdRef.current = null;
      return;
    }
    if (lastProjectIdRef.current === editingProject.id) return;
    lastProjectIdRef.current = editingProject.id;
    const projectRecord = settingsProjectById.get(editingProject.id);
    setProjectForm({
      name: editingProject.name ?? "",
      season: editingProject.season ?? "",
      fiscalYearId: projectRecord?.fiscalYearId ?? "",
      organizationId: projectRecord?.organizationId ?? "",
      planningRequestsEnabled: projectRecord?.planningRequestsEnabled ?? true
    });
  }, [editingProject, settingsProjectById]);

  useEffect(() => {
    if (!editingLine) {
      lastLineIdRef.current = null;
      return;
    }
    if (lastLineIdRef.current === editingLine.budgetLineId) return;
    lastLineIdRef.current = editingLine.budgetLineId ?? null;
    setLineForm({
      targetProjectId: editingLine.projectId ?? "",
      productionCategoryId: "",
      allocatedAmount: String(editingLine.allocatedAmount ?? 0),
      active: editingLine.budgetLineActive ? "on" : "off"
    });
  }, [editingLine]);

  useEffect(() => {
    if (!editingAccountCode) {
      lastAccountCodeIdRef.current = null;
      return;
    }
    if (lastAccountCodeIdRef.current === editingAccountCode.id) return;
    lastAccountCodeIdRef.current = editingAccountCode.id;
    setAccountCodeForm({
      code: editingAccountCode.code ?? "",
      category: editingAccountCode.category ?? "",
      name: editingAccountCode.name ?? "",
      active: editingAccountCode.active ? "true" : "false",
      isRevenue: editingAccountCode.isRevenue ? "true" : "false"
    });
  }, [editingAccountCode]);

  useEffect(() => {
    if (!editingProductionCategory) {
      lastProductionCategoryIdRef.current = null;
      return;
    }
    if (lastProductionCategoryIdRef.current === editingProductionCategory.id) return;
    lastProductionCategoryIdRef.current = editingProductionCategory.id;
    setProductionCategoryForm({
      name: editingProductionCategory.name ?? "",
      sortOrder: String(editingProductionCategory.sortOrder ?? 0),
      active: editingProductionCategory.active ? "true" : "false"
    });
  }, [editingProductionCategory]);

  useEffect(() => {
    if (!editingScope) {
      lastScopeIdRef.current = null;
      return;
    }
    if (lastScopeIdRef.current === editingScope.id) return;
    lastScopeIdRef.current = editingScope.id;
    setScopeForm({
      scopeRole: editingScope.scopeRole ?? "buyer",
      projectId: editingScope.projectId ?? "",
      productionCategoryId: editingScope.productionCategoryId ?? "",
      fiscalYearId: editingScope.fiscalYearId ?? "",
      organizationId: editingScope.organizationId ?? "",
      active: editingScope.active ? "true" : "false"
    });
  }, [editingScope]);

  const closeEditor = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("editType");
    params.delete("editId");
    params.delete("scopeEditId");
    const query = params.toString();
    router.replace(query ? `/settings?${query}` : "/settings");
  }, [router, searchParams]);

  useEffect(() => {
    if (deleteFiscalYearState.ok && deleteFiscalYearState.message && editType === "fy" && editId) {
      closeEditor();
    }
  }, [closeEditor, deleteFiscalYearState, editType, editId]);

  useEffect(() => {
    if (deleteOrganizationModalState.ok && deleteOrganizationModalState.message && editType === "org" && editId) {
      closeEditor();
    }
  }, [closeEditor, deleteOrganizationModalState, editType, editId]);

  useEffect(() => {
    if (lastDeleted?.type === "org" && deleteOrganizationInlineState.ok && deleteOrganizationInlineState.message) {
      if (editType === "org" && editId === lastDeleted.id) closeEditor();
    }
  }, [closeEditor, deleteOrganizationInlineState, lastDeleted, editType, editId]);

  useEffect(() => {
    if (lastDeleted?.type === "account" && deleteAccountCodeState.ok && deleteAccountCodeState.message) {
      if (editType === "account" && editId === lastDeleted.id) closeEditor();
    }
  }, [closeEditor, deleteAccountCodeState, lastDeleted, editType, editId]);

  useEffect(() => {
    if (lastDeleted?.type === "production_category" && deleteProductionCategoryState.ok && deleteProductionCategoryState.message) {
      if (editType === "production_category" && editId === lastDeleted.id) closeEditor();
    }
  }, [closeEditor, deleteProductionCategoryState, lastDeleted, editType, editId]);

  useEffect(() => {
    if (lastDeleted?.type === "scope" && deleteScopeState.ok && deleteScopeState.message) {
      if (scopeEditId && scopeEditId === lastDeleted.id) closeEditor();
    }
  }, [closeEditor, deleteScopeState, lastDeleted, scopeEditId]);

  const accountCodeFormRef = useRef<HTMLFormElement | null>(null);
  useEffect(() => {
    if (createAccountCodeState.ok && createAccountCodeState.message) {
      accountCodeFormRef.current?.reset();
    }
  }, [createAccountCodeState]);

  const membershipFormRef = useRef<HTMLFormElement | null>(null);
  useEffect(() => {
    if (addProjectMembershipState.ok && addProjectMembershipState.message) {
      membershipFormRef.current?.reset();
    }
  }, [addProjectMembershipState]);

  const scopeFormRef = useRef<HTMLFormElement | null>(null);
  useEffect(() => {
    if (createScopeState.ok && createScopeState.message) {
      scopeFormRef.current?.reset();
    }
  }, [createScopeState]);

  const importFormRef = useRef<HTMLFormElement | null>(null);
  useEffect(() => {
    if (importState.ok && importState.message) {
      importFormRef.current?.reset();
    }
  }, [importState]);

  return (
    <section>
      <header className="sectionHeader">
        <p className="eyebrow">{isAdmin ? "Admin" : "Project Manager"}</p>
        <h1>Settings</h1>
      </header>

      <div className="panelGrid">
        <article className="panel panelFull">
          <h2>How To Use This Page</h2>
          <p>
            Step 1: Add or import structure. Step 2: Expand the hierarchy and edit inline. Step 3: Open each Reorder panel only when you
            need to change display order.
          </p>
          <p className="heroSubtitle">
            Hierarchy: Fiscal Year - Organization - Project - Budget Line. Reorder controls are collapsed to reduce clutter.
          </p>
        </article>

        {isAdmin ? (
          <article className="panel panelFull">
            <h2>Admin Sync</h2>
            <p className="heroSubtitle">Sync all app users to the central control room.</p>
            {syncState.message ? (
              <p className={syncState.ok ? "successNote" : "errorNote"} key={syncState.timestamp}>
                {syncState.message}
              </p>
            ) : null}
            <form className="inlineEditForm" action={syncAction}>
              <button type="submit" className="buttonLink buttonPrimary">
                Sync Users Now
              </button>
            </form>
          </article>
        ) : null}

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
            {importState.message ? (
              <p className={importState.ok ? "successNote" : "errorNote"} key={importState.timestamp}>
                {importState.message}
              </p>
            ) : null}
            <form className="requestForm" action={importAction} ref={importFormRef}>
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
          <HierarchyTreeControls containerId="settingsHierarchyTree" />
          {isAdmin ? (
            <FiscalYearReorder
              items={fiscalYearGroups.filter((fy) => fy.id !== noFiscalYearKey).map((fy) => ({ id: fy.id, label: fy.name }))}
            />
          ) : null}

          {fiscalYearGroups.length === 0 ? <p>(none)</p> : null}

          {addBudgetLineState.message ? (
            <p className={addBudgetLineState.ok ? "successNote" : "errorNote"} key={addBudgetLineState.timestamp}>
              {addBudgetLineState.message}
            </p>
          ) : null}

          <div id="settingsHierarchyTree">
            {fiscalYearGroups.map((fy) => (
              <details key={fy.id} className="treeNode">
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

                {isAdmin ? (
                  <OrganizationReorder
                    fiscalYearId={fy.id === noFiscalYearKey ? null : fy.id}
                    items={Array.from(fy.organizations.values())
                      .filter((orgItem) => !orgItem.id.startsWith("__no_org__"))
                      .sort((a, b) => a.sortOrder - b.sortOrder || a.orgCode.localeCompare(b.orgCode))
                      .map((orgItem) => ({ id: orgItem.id, label: `${orgItem.orgCode} - ${orgItem.name}` }))}
                  />
                ) : null}

                {Array.from(fy.organizations.values())
                  .sort((a, b) => a.sortOrder - b.sortOrder || a.orgCode.localeCompare(b.orgCode))
                  .map((org) => (
                    <details key={org.id} className="treeNode childNode">
                      <summary>
                        <strong>Org:</strong> {org.orgCode} - {org.name}
                      </summary>
                      {isAdmin && !org.id.startsWith("__no_org__") ? (
                        <div className="inlineActionRow">
                          <a className="tinyButton" href={`/settings?editType=org&editId=${org.id}`}>
                            Edit Org
                          </a>
                          <form
                            action={deleteOrganizationInlineAction}
                            onSubmit={() => setLastDeleted({ type: "org", id: org.id })}
                          >
                            <input type="hidden" name="id" value={org.id} />
                            <button type="submit" className="tinyButton dangerButton">
                              Delete Org
                            </button>
                          </form>
                        </div>
                      ) : null}

                      {isAdmin ? (
                        <ProjectReorder
                          organizationId={org.id.startsWith("__no_org__") ? null : org.id}
                          items={Array.from(org.projects.values())
                            .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
                            .map((projectItem) => ({
                              id: projectItem.id,
                              label: `${projectItem.name}${projectItem.season ? ` (${projectItem.season})` : ""}`
                            }))}
                        />
                      ) : null}

                      {Array.from(org.projects.values())
                        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
                        .map((project) => (
                          <details key={project.id} className="treeNode childNode" id={`project-${project.id}`}>
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
                                      <form action={addBudgetLineActionForm} className="inlineEditForm">
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
          </div>
        </article>

        {isAdmin ? (
          <article className="panel panelFull">
            <h2>Current Organizations</h2>
            {deleteOrganizationInlineState.message ? (
              <p className={deleteOrganizationInlineState.ok ? "successNote" : "errorNote"} key={deleteOrganizationInlineState.timestamp}>
                {deleteOrganizationInlineState.message}
              </p>
            ) : null}
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
                        <form
                          action={deleteOrganizationInlineAction}
                          onSubmit={() => setLastDeleted({ type: "org", id: orgOption.id })}
                        >
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
            {deleteProductionCategoryState.message ? (
              <p className={deleteProductionCategoryState.ok ? "successNote" : "errorNote"} key={deleteProductionCategoryState.timestamp}>
                {deleteProductionCategoryState.message}
              </p>
            ) : null}
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
                        <form
                          action={deleteProductionCategoryActionForm}
                          onSubmit={() => setLastDeleted({ type: "production_category", id: category.id })}
                        >
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
            {deleteAccountCodeState.message ? (
              <p className={deleteAccountCodeState.ok ? "successNote" : "errorNote"} key={deleteAccountCodeState.timestamp}>
                {deleteAccountCodeState.message}
              </p>
            ) : null}
            <div className="tableWrap">
              <table>
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Category</th>
                    <th>Name</th>
                    <th>Revenue</th>
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
                      <td>{ac.isRevenue ? "Yes" : "No"}</td>
                      <td>{ac.active ? "Yes" : "No"}</td>
                      <td>
                        <a className="tinyButton" href={`/settings?editType=account&editId=${ac.id}`}>
                          Edit
                        </a>
                      </td>
                      <td>
                        <form action={deleteAccountCodeActionForm} onSubmit={() => setLastDeleted({ type: "account", id: ac.id })}>
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
                      <td colSpan={7}>(none)</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            {createAccountCodeState.message ? (
              <p className={createAccountCodeState.ok ? "successNote" : "errorNote"} key={createAccountCodeState.timestamp}>
                {createAccountCodeState.message}
              </p>
            ) : null}
            <form action={createAccountCodeActionForm} className="requestForm" ref={accountCodeFormRef}>
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
              <label className="checkboxLabel">
                <input name="isRevenue" type="checkbox" />
                Revenue Account
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
          {addProjectMembershipState.message ? (
            <p className={addProjectMembershipState.ok ? "successNote" : "errorNote"} key={addProjectMembershipState.timestamp}>
              {addProjectMembershipState.message}
            </p>
          ) : null}
          <form action={addProjectMembershipActionForm} className="requestForm" ref={membershipFormRef}>
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
          {removeProjectMembershipState.message ? (
            <p className={removeProjectMembershipState.ok ? "successNote" : "errorNote"} key={removeProjectMembershipState.timestamp}>
              {removeProjectMembershipState.message}
            </p>
          ) : null}
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
                      <form action={removeProjectMembershipActionForm}>
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
          {createScopeState.message ? (
            <p className={createScopeState.ok ? "successNote" : "errorNote"} key={createScopeState.timestamp}>
              {createScopeState.message}
            </p>
          ) : null}
          <form action={createScopeActionForm} className="requestForm" ref={scopeFormRef}>
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
                {isAdmin ? <option value="procurement_tracker">Procurement Tracker</option> : null}
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
          {deleteScopeState.message ? (
            <p className={deleteScopeState.ok ? "successNote" : "errorNote"} key={deleteScopeState.timestamp}>
              {deleteScopeState.message}
            </p>
          ) : null}
          <div className="tableWrap" style={{ marginTop: "0.8rem" }}>
            <table>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Project</th>
                  <th>Category</th>
                  <th>Active</th>
                  <th>Edit</th>
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
                      <a className="tinyButton" href={`/settings?scopeEditId=${scope.id}`}>
                        Edit
                      </a>
                    </td>
                    <td>
                      <form action={deleteScopeActionForm} onSubmit={() => setLastDeleted({ type: "scope", id: scope.id })}>
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
                    <td colSpan={7}>(none)</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </article>

        {isAdmin ? (
          <article className="panel panelFull">
            <h2>User Profiles</h2>
            <p className="heroSubtitle">
              Archive removes this app&apos;s memberships/scopes and hides the user from assignment lists while preserving historical records.
            </p>
            {archiveUserState.message ? (
              <p className={archiveUserState.ok ? "successNote" : "errorNote"} key={archiveUserState.timestamp}>
                {archiveUserState.message}
              </p>
            ) : null}
            <div className="tableWrap" style={{ marginTop: "0.8rem" }}>
              <table>
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Archive</th>
                  </tr>
                </thead>
                <tbody>
                  {accessUsers.map((userRow) => (
                    <tr key={`user-archive-${userRow.id}`}>
                      <td>{userRow.fullName}</td>
                      <td>
                        {userRow.id === accessUserId ? (
                          <span>(current account)</span>
                        ) : (
                          <form action={archiveUserActionForm}>
                            <input type="hidden" name="userId" value={userRow.id} />
                            <button type="submit" className="tinyButton dangerButton">
                              Archive User
                            </button>
                          </form>
                        )}
                      </td>
                    </tr>
                  ))}
                  {accessUsers.length === 0 ? (
                    <tr>
                      <td colSpan={2}>(none)</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </article>
        ) : null}
      </div>

      {isAdmin && editingFiscalYear ? (
        <div className="modalOverlay" role="dialog" aria-modal="true" aria-label="Edit fiscal year">
          <div className="modalPanel">
            <h2>Edit Fiscal Year</h2>
            {updateFiscalYearState.message ? (
              <p className={updateFiscalYearState.ok ? "successNote" : "errorNote"} key={updateFiscalYearState.timestamp}>
                {updateFiscalYearState.message}
              </p>
            ) : null}
            <form action={updateFiscalYearActionForm} className="requestForm">
              <input type="hidden" name="id" value={editingFiscalYear.id} />
              <label>
                Name
                <input
                  name="name"
                  value={fyForm.name}
                  onChange={(event) => setFyForm((prev) => ({ ...prev, name: event.target.value }))}
                  required
                />
              </label>
              <label>
                Start Date
                <input
                  name="startDate"
                  type="date"
                  value={fyForm.startDate}
                  onChange={(event) => setFyForm((prev) => ({ ...prev, startDate: event.target.value }))}
                />
              </label>
              <label>
                End Date
                <input
                  name="endDate"
                  type="date"
                  value={fyForm.endDate}
                  onChange={(event) => setFyForm((prev) => ({ ...prev, endDate: event.target.value }))}
                />
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
            {deleteFiscalYearState.message ? (
              <p className={deleteFiscalYearState.ok ? "successNote" : "errorNote"} key={deleteFiscalYearState.timestamp}>
                {deleteFiscalYearState.message}
              </p>
            ) : null}
            <form action={deleteFiscalYearActionForm} className="requestForm">
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
            {updateOrganizationState.message ? (
              <p className={updateOrganizationState.ok ? "successNote" : "errorNote"} key={updateOrganizationState.timestamp}>
                {updateOrganizationState.message}
              </p>
            ) : null}
            <form action={updateOrganizationActionForm} className="requestForm">
              <input type="hidden" name="id" value={editingOrganization.id} />
              <label>
                Name
                <input
                  name="name"
                  value={orgForm.name}
                  onChange={(event) => setOrgForm((prev) => ({ ...prev, name: event.target.value }))}
                  required
                />
              </label>
              <label>
                Org Code
                <input
                  name="orgCode"
                  value={orgForm.orgCode}
                  onChange={(event) => setOrgForm((prev) => ({ ...prev, orgCode: event.target.value }))}
                  required
                />
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
            {deleteOrganizationModalState.message ? (
              <p className={deleteOrganizationModalState.ok ? "successNote" : "errorNote"} key={deleteOrganizationModalState.timestamp}>
                {deleteOrganizationModalState.message}
              </p>
            ) : null}
            <form action={deleteOrganizationModalAction} className="requestForm">
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
            {updateProjectState.message ? (
              <p className={updateProjectState.ok ? "successNote" : "errorNote"} key={updateProjectState.timestamp}>
                {updateProjectState.message}
              </p>
            ) : null}
            <form action={updateProjectActionForm} className="requestForm">
              <input type="hidden" name="id" value={editingProject.id} />
              <label>
                Name
                <input
                  name="name"
                  value={projectForm.name}
                  onChange={(event) => setProjectForm((prev) => ({ ...prev, name: event.target.value }))}
                  required
                />
              </label>
              <label>
                Season
                <input
                  name="season"
                  value={projectForm.season}
                  onChange={(event) => setProjectForm((prev) => ({ ...prev, season: event.target.value }))}
                />
              </label>
              <label>
                Fiscal Year
                <select
                  name="fiscalYearId"
                  value={projectForm.fiscalYearId}
                  onChange={(event) => setProjectForm((prev) => ({ ...prev, fiscalYearId: event.target.value }))}
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
                  value={projectForm.organizationId}
                  onChange={(event) => setProjectForm((prev) => ({ ...prev, organizationId: event.target.value }))}
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
                  checked={projectForm.planningRequestsEnabled}
                  onChange={(event) => setProjectForm((prev) => ({ ...prev, planningRequestsEnabled: event.target.checked }))}
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
            {updateBudgetLineState.message ? (
              <p className={updateBudgetLineState.ok ? "successNote" : "errorNote"} key={updateBudgetLineState.timestamp}>
                {updateBudgetLineState.message}
              </p>
            ) : null}
            <form action={updateBudgetLineActionForm} className="requestForm">
              <input type="hidden" name="id" value={editingLine.budgetLineId ?? ""} />
              <input type="hidden" name="currentProjectId" value={editingLine.projectId} />
              <label>
                Move to Project
                <select
                  name="targetProjectId"
                  value={lineForm.targetProjectId}
                  onChange={(event) => setLineForm((prev) => ({ ...prev, targetProjectId: event.target.value }))}
                >
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
                <select
                  name="productionCategoryId"
                  value={lineForm.productionCategoryId}
                  onChange={(event) => setLineForm((prev) => ({ ...prev, productionCategoryId: event.target.value }))}
                >
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
                  value={lineForm.allocatedAmount}
                  onChange={(event) => setLineForm((prev) => ({ ...prev, allocatedAmount: event.target.value }))}
                  required
                />
              </label>
              <label>
                Active
                <select
                  name="active"
                  value={lineForm.active}
                  onChange={(event) => setLineForm((prev) => ({ ...prev, active: event.target.value }))}
                >
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
            {updateAccountCodeState.message ? (
              <p className={updateAccountCodeState.ok ? "successNote" : "errorNote"} key={updateAccountCodeState.timestamp}>
                {updateAccountCodeState.message}
              </p>
            ) : null}
            <form action={updateAccountCodeActionForm} className="requestForm">
              <input type="hidden" name="id" value={editingAccountCode.id} />
              <label>
                Code
                <input
                  name="code"
                  value={accountCodeForm.code}
                  onChange={(event) => setAccountCodeForm((prev) => ({ ...prev, code: event.target.value }))}
                  required
                />
              </label>
              <label>
                Category
                <input
                  name="category"
                  value={accountCodeForm.category}
                  onChange={(event) => setAccountCodeForm((prev) => ({ ...prev, category: event.target.value }))}
                  required
                />
              </label>
              <label>
                Name
                <input
                  name="name"
                  value={accountCodeForm.name}
                  onChange={(event) => setAccountCodeForm((prev) => ({ ...prev, name: event.target.value }))}
                  required
                />
              </label>
              <label>
                Active
                <select
                  name="active"
                  value={accountCodeForm.active}
                  onChange={(event) => setAccountCodeForm((prev) => ({ ...prev, active: event.target.value }))}
                >
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              </label>
              <label>
                Revenue Account
                <select
                  name="isRevenue"
                  value={accountCodeForm.isRevenue}
                  onChange={(event) => setAccountCodeForm((prev) => ({ ...prev, isRevenue: event.target.value }))}
                >
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
            {updateProductionCategoryState.message ? (
              <p className={updateProductionCategoryState.ok ? "successNote" : "errorNote"} key={updateProductionCategoryState.timestamp}>
                {updateProductionCategoryState.message}
              </p>
            ) : null}
            <form action={updateProductionCategoryActionForm} className="requestForm">
              <input type="hidden" name="id" value={editingProductionCategory.id} />
              <label>
                Name
                <input
                  name="name"
                  value={productionCategoryForm.name}
                  onChange={(event) => setProductionCategoryForm((prev) => ({ ...prev, name: event.target.value }))}
                  required
                />
              </label>
              <label>
                Sort Order
                <input
                  name="sortOrder"
                  type="number"
                  step="1"
                  value={productionCategoryForm.sortOrder}
                  onChange={(event) => setProductionCategoryForm((prev) => ({ ...prev, sortOrder: event.target.value }))}
                />
              </label>
              <label>
                Active
                <select
                  name="active"
                  value={productionCategoryForm.active}
                  onChange={(event) => setProductionCategoryForm((prev) => ({ ...prev, active: event.target.value }))}
                >
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

      {editingScope ? (
        <div className="modalOverlay" role="dialog" aria-modal="true" aria-label="Edit user access scope">
          <div className="modalPanel">
            <h2>Edit User Access Scope</h2>
            {updateScopeState.message ? (
              <p className={updateScopeState.ok ? "successNote" : "errorNote"} key={updateScopeState.timestamp}>
                {updateScopeState.message}
              </p>
            ) : null}
            <form action={updateScopeActionForm} className="requestForm">
              <input type="hidden" name="id" value={editingScope.id} />
              <label>
                Role
                <select
                  name="scopeRole"
                  value={scopeForm.scopeRole}
                  onChange={(event) => setScopeForm((prev) => ({ ...prev, scopeRole: event.target.value }))}
                >
                  {isAdmin ? <option value="admin">Admin</option> : null}
                  {isAdmin ? <option value="project_manager">Project Manager</option> : null}
                  <option value="buyer">Buyer</option>
                  <option value="viewer">Viewer</option>
                  {isAdmin ? <option value="procurement_tracker">Procurement Tracker</option> : null}
                </select>
              </label>
              <label>
                Project
                <select
                  name="projectId"
                  value={scopeForm.projectId}
                  onChange={(event) => setScopeForm((prev) => ({ ...prev, projectId: event.target.value }))}
                >
                  <option value="">(optional)</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                      {project.season ? ` (${project.season})` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Department
                <select
                  name="productionCategoryId"
                  value={scopeForm.productionCategoryId}
                  onChange={(event) => setScopeForm((prev) => ({ ...prev, productionCategoryId: event.target.value }))}
                >
                  <option value="">All categories</option>
                  {productionCategories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Fiscal Year
                <select
                  name="fiscalYearId"
                  value={scopeForm.fiscalYearId}
                  onChange={(event) => setScopeForm((prev) => ({ ...prev, fiscalYearId: event.target.value }))}
                >
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
                <select
                  name="organizationId"
                  value={scopeForm.organizationId}
                  onChange={(event) => setScopeForm((prev) => ({ ...prev, organizationId: event.target.value }))}
                >
                  <option value="">(optional)</option>
                  {organizations.map((organization) => (
                    <option key={organization.id} value={organization.id}>
                      {organization.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Active
                <select
                  name="active"
                  value={scopeForm.active}
                  onChange={(event) => setScopeForm((prev) => ({ ...prev, active: event.target.value }))}
                >
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              </label>
              <div className="modalActions">
                <a className="tinyButton" href="/settings">
                  Cancel
                </a>
                <button type="submit" className="buttonLink buttonPrimary">
                  Save Scope
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  );
}
