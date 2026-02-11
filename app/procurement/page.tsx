import { createVendorAction } from "@/app/procurement/actions";
import { CreateOrderForm } from "@/app/procurement/create-order-form";
import { ProcurementTable } from "@/app/procurement/procurement-table";
import { getProcurementData } from "@/lib/db";

export default async function ProcurementPage({
  searchParams
}: {
  searchParams?: Promise<{ ok?: string; error?: string }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const okMessage = resolvedSearchParams?.ok;
  const errorMessage = resolvedSearchParams?.error;

  const { purchases, receipts, budgetLineOptions, projectOptions, vendors, accountCodeOptions, productionCategoryOptions, canManageProcurement } =
    await getProcurementData();

  return (
    <section>
      <header className="sectionHeader">
        <p className="eyebrow">Procurement</p>
        <h1>Order and Purchasing Workflow</h1>
        <p className="heroSubtitle">Track requisitions, PO progress, receipts, invoices, and payment alongside budget statuses.</p>
        {okMessage ? <p className="successNote">{okMessage}</p> : null}
        {errorMessage ? <p className="errorNote">{errorMessage}</p> : null}
      </header>

      {canManageProcurement ? (
        <div className="panelGrid">
          <article className="panel">
            <h2>Add Order</h2>
            <CreateOrderForm
              projectOptions={projectOptions}
              budgetLineOptions={budgetLineOptions}
              vendors={vendors}
              accountCodeOptions={accountCodeOptions}
              productionCategoryOptions={productionCategoryOptions}
            />
          </article>

          <article className="panel">
            <h2>Add Vendor</h2>
            <form action={createVendorAction} className="requestForm">
              <label>
                Vendor Name
                <input name="name" required placeholder="Ex: Home Depot" />
              </label>
              <button type="submit" className="buttonLink buttonPrimary">
                Save Vendor
              </button>
            </form>
          </article>
        </div>
      ) : null}

      <ProcurementTable
        purchases={purchases}
        receipts={receipts}
        vendors={vendors}
        budgetLineOptions={budgetLineOptions}
        projectOptions={projectOptions}
        accountCodeOptions={accountCodeOptions}
        productionCategoryOptions={productionCategoryOptions}
        canManageProcurement={canManageProcurement}
      />
    </section>
  );
}
