import { getRequestsData } from "@/lib/db";
import { CreateRequestForm } from "@/app/requests/create-request-form";
import { RequestsTable } from "@/app/requests/requests-table";
import { getAccessContext } from "@/lib/access";
import { redirect } from "next/navigation";

export default async function RequestsPage() {
  const access = await getAccessContext();
  if (!access.userId) redirect("/login");
  if (!["admin", "project_manager", "buyer"].includes(access.role)) redirect("/my-budget");

  const { purchases, receipts, budgetLineOptions, projectOptions, accountCodeOptions, productionCategoryOptions, canManageSplits } =
    await getRequestsData();

  if (projectOptions.length === 0) {
    return (
      <section>
        <header className="sectionHeader">
          <p className="eyebrow">Planning</p>
          <h1>Planning Requests</h1>
          <p className="heroSubtitle">
            No projects currently have Planning Requests enabled. Turn it on per project in Settings if you want estimate tracking.
          </p>
        </header>
      </section>
    );
  }

  return (
    <section>
      <header className="sectionHeader">
        <p className="eyebrow">Planning</p>
        <h1>Planning Requests</h1>
        <p className="heroSubtitle">
          Optional estimate tracking only. Procurement remains the source of truth for final budget-impacting amounts.
        </p>
      </header>

      <article className="panel requestFormPanel">
        <h2>Create Planning Entry</h2>
        <CreateRequestForm
          budgetLineOptions={budgetLineOptions}
          projectOptions={projectOptions}
          accountCodeOptions={accountCodeOptions}
          productionCategoryOptions={productionCategoryOptions}
          canManageSplits={canManageSplits}
        />
      </article>

      <RequestsTable
        purchases={purchases}
        receipts={receipts}
        accountCodeOptions={accountCodeOptions}
        projectOptions={projectOptions}
        productionCategoryOptions={productionCategoryOptions}
      />
    </section>
  );
}
