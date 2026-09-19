import { CreateOrderForm } from "@/app/procurement/create-order-form";
import { QuickBatchAddForm } from "@/app/procurement/quick-batch-add-form";
import { ProcurementTable } from "@/app/procurement/procurement-table";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { FilterToolbar } from "@/components/ui/toolbars";
import { getFiscalYearOptions, getProcurementData } from "@/lib/db";
import { getAccessContext } from "@/lib/access";
import { resolveRequestedFiscalYearId } from "@/lib/fiscal-year-context";
import { redirect } from "next/navigation";

export default async function ProcurementPage({
  searchParams
}: {
  searchParams?: Promise<{ fiscalYearId?: string; pr_page?: string }>;
}) {
  const access = await getAccessContext();
  if (!access.userId) redirect("/login");
  if (!["admin", "project_manager"].includes(access.role)) redirect("/my-budget");

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const fiscalYearOptions = await getFiscalYearOptions();
  const selectedFiscalYearId = resolveRequestedFiscalYearId(
    fiscalYearOptions,
    (resolvedSearchParams?.fiscalYearId ?? "").trim()
  );
  const requestedPage = Math.max(Number.parseInt(resolvedSearchParams?.pr_page ?? "1", 10) || 1, 1);
  const {
    purchases,
    receipts,
    receivingDocs,
    budgetLineOptions,
    projectOptions,
    organizationOptions,
    vendors,
    accountCodeOptions,
    productionCategoryOptions,
    canManageProcurement,
    totalCount,
    page,
    pageSize
  } = await getProcurementData({ fiscalYearId: selectedFiscalYearId, page: requestedPage });
  const defaultFiscalYearId = selectedFiscalYearId;
  const totalPages = Math.max(Math.ceil(totalCount / pageSize), 1);
  const pageHref = (nextPage: number) => {
    const params = new URLSearchParams();
    params.set("fiscalYearId", selectedFiscalYearId);
    params.set("pr_page", String(nextPage));
    return `/procurement?${params.toString()}`;
  };

  return (
    <section>
      <header className="sectionHeader">
        <p className="eyebrow">Procurement</p>
        <h1>Order and Purchasing Workflow</h1>
        <p className="heroSubtitle">Track requisitions, PO progress, receipts, invoices, and payment alongside budget statuses.</p>
      </header>

      <article className="panel">
        <FilterToolbar label="Procurement filters">
          <form method="get" className="inlineFilters">
            <label>
              Fiscal Year
              <select name="fiscalYearId" defaultValue={selectedFiscalYearId}>
                {fiscalYearOptions.map((fiscalYear) => (
                  <option key={fiscalYear.id} value={fiscalYear.id}>{fiscalYear.name}</option>
                ))}
              </select>
            </label>
            <button className="buttonLink" type="submit">Apply</button>
          </form>
        </FilterToolbar>
      </article>

      {canManageProcurement ? (
        <div className="panelGrid">
          <article className="panel panelFull">
            <h2>Add Order</h2>
            <CreateOrderForm
              defaultFiscalYearId={defaultFiscalYearId}
              projectOptions={projectOptions}
              budgetLineOptions={budgetLineOptions}
              organizationOptions={organizationOptions}
              vendors={vendors}
              accountCodeOptions={accountCodeOptions}
              productionCategoryOptions={productionCategoryOptions}
            />
          </article>

          <article className="panel panelFull">
            <h2>Quick Batch Add</h2>
            <p className="heroSubtitle">Set shared context once, then add many requisition/CC rows at once.</p>
            <QuickBatchAddForm
              defaultFiscalYearId={defaultFiscalYearId}
              projectOptions={projectOptions}
              budgetLineOptions={budgetLineOptions}
              organizationOptions={organizationOptions}
              accountCodeOptions={accountCodeOptions}
              productionCategoryOptions={productionCategoryOptions}
            />
          </article>
        </div>
      ) : null}

      <ProcurementTable
        purchases={purchases}
        receipts={receipts}
        receivingDocs={receivingDocs}
        vendors={vendors}
        projectOptions={projectOptions}
        organizationOptions={organizationOptions}
        accountCodeOptions={accountCodeOptions}
        productionCategoryOptions={productionCategoryOptions}
        canManageProcurement={canManageProcurement}
      />
      <PaginationControls
        page={page}
        totalPages={totalPages}
        totalCount={totalCount}
        itemLabel="orders"
        hrefForPage={pageHref}
      />
    </section>
  );
}
