import { redirect } from "next/navigation";
import { getAccessContext } from "@/lib/access";
import { getProcurementTrackerData } from "@/lib/db";
import { formatCurrency } from "@/lib/format";

function procurementStatusLabel(value: string): string {
  if (value === "partial_received") return "Partially Received";
  if (value === "fully_received") return "Fully Received";
  if (value === "invoice_sent") return "Invoice Sent";
  if (value === "invoice_received") return "Invoice Received";
  if (value === "receipts_uploaded") return "Receipts Uploaded";
  if (value === "statement_paid") return "Statement Paid";
  if (value === "posted_to_account") return "Posted To Account";
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export default async function ProcurementTrackerPage({
  searchParams
}: {
  searchParams?: Promise<{ org?: string }>;
}) {
  const access = await getAccessContext();
  if (!access.userId) redirect("/login");
  if (access.role !== "procurement_tracker") redirect("/");

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const selectedOrgId = String(resolvedSearchParams?.org ?? "").trim();

  const { rows, orgOptions } = await getProcurementTrackerData();
  const filteredRows = selectedOrgId ? rows.filter((row) => row.organizationId === selectedOrgId) : rows;

  return (
    <section>
      <header className="sectionHeader">
        <p className="eyebrow">Procurement Tracker</p>
        <h1>External Procurement Status</h1>
        <p className="heroSubtitle">Read-only external procurement orders for your assigned organization scope.</p>
      </header>

      <article className="panel">
        <h2>Filters</h2>
        <form method="get" className="requestForm">
          <label>
            Organization
            <select name="org" defaultValue={selectedOrgId}>
              <option value="">All scoped organizations</option>
              {orgOptions.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.label}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="buttonLink buttonPrimary">
            Apply
          </button>
        </form>
      </article>

      <article className="panel">
        <h2>Orders</h2>
        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th>Org</th>
                <th>Req #</th>
                <th>PO #</th>
                <th>Invoice #</th>
                <th>Receiving Doc #</th>
                <th>Title</th>
                <th>Vendor</th>
                <th>Order Value</th>
                <th>Status</th>
                <th>Ordered</th>
                <th>Received</th>
                <th>Paid</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={13}>No external procurement rows in your scope.</td>
                </tr>
              ) : null}
              {filteredRows.map((row) => (
                <tr key={row.id}>
                  <td>{row.orgCode ? `${row.orgCode} | ${row.organizationName ?? ""}` : row.organizationName ?? "-"}</td>
                  <td>{row.requisitionNumber ?? "-"}</td>
                  <td>{row.poNumber ?? "-"}</td>
                  <td>{row.invoiceNumber ?? "-"}</td>
                  <td>{row.receivingDocCodes.length > 0 ? row.receivingDocCodes.join(", ") : "-"}</td>
                  <td>{row.title}</td>
                  <td>{row.vendorName ?? "-"}</td>
                  <td>{formatCurrency(row.orderValue)}</td>
                  <td>
                    <span className={`statusChip status-${row.procurementStatus}`}>{procurementStatusLabel(row.procurementStatus)}</span>
                  </td>
                  <td>{row.orderedOn ?? "-"}</td>
                  <td>{row.receivedOn ?? "-"}</td>
                  <td>{row.paidOn ?? "-"}</td>
                  <td>{row.notes ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}
