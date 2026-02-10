import { createProcurementOrderAction, createVendorAction } from "@/app/procurement/actions";
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

  const { purchases, receipts, budgetLineOptions, vendors, canManageProcurement } = await getProcurementData();

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
            <form action={createProcurementOrderAction} className="requestForm">
              <label>
                Budget Line
                <select name="budgetLineId" required>
                  <option value="">Select budget line</option>
                  {budgetLineOptions.map((line) => (
                    <option key={line.id} value={line.id}>
                      {line.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Title
                <input name="title" placeholder="Order title" required />
              </label>
              <label>
                Order Value
                <input name="orderValue" type="number" min="0.01" step="0.01" required />
              </label>
              <label>
                Reference #
                <input name="referenceNumber" placeholder="Optional" />
              </label>
              <label>
                Requisition #
                <input name="requisitionNumber" placeholder="Optional" />
              </label>
              <label>
                PO #
                <input name="poNumber" placeholder="Optional" />
              </label>
              <label>
                Vendor
                <select name="vendorId" defaultValue="">
                  <option value="">No vendor</option>
                  {vendors.map((vendor) => (
                    <option key={vendor.id} value={vendor.id}>
                      {vendor.name}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" className="buttonLink buttonPrimary">
                Create Procurement Order
              </button>
            </form>
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
        canManageProcurement={canManageProcurement}
      />
    </section>
  );
}
