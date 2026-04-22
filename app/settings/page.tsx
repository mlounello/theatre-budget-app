import { SettingsPageClient } from "@/app/settings/settings-page-client";
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
  getTemplateNames
} from "@/lib/db";
import { getAccessContext } from "@/lib/access";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const access = await getAccessContext();
  if (!access.userId) redirect("/login");
  if (!["admin", "project_manager"].includes(access.role)) redirect("/my-budget");
  const isAdmin = access.role === "admin";

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

  return (
    <SettingsPageClient
      isAdmin={isAdmin}
      accessUserId={access.userId}
      projects={projects}
      templates={templates}
      allAccountCodes={allAccountCodes}
      productionCategories={productionCategories}
      allProductionCategories={allProductionCategories}
      fiscalYears={fiscalYears}
      organizations={organizations}
      hierarchyRows={hierarchyRows}
      accessUsers={accessUsers}
      accessScopes={accessScopes}
      membershipUsers={membershipUsers}
      projectMemberships={projectMemberships}
    />
  );
}
