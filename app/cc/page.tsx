import { getCcPendingRows } from "@/lib/db";
import { formatCurrency } from "@/lib/format";

export default async function CreditCardPage() {
  const rows = await getCcPendingRows();

  return (
    <section>
      <header className="sectionHeader">
        <p className="eyebrow">Credit Cards</p>
        <h1>Pending Credit Card Totals</h1>
        <p className="heroSubtitle">Monthly card posting support by project, budget code, and card.</p>
      </header>

      <div className="tableWrap">
        <table>
          <thead>
            <tr>
              <th>Project ID</th>
              <th>Budget Code</th>
              <th>Card</th>
              <th>Pending CC Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4}>No pending credit card balances.</td>
              </tr>
            ) : null}
            {rows.map((row, idx) => (
              <tr key={`${row.projectId}-${row.budgetCode}-${row.creditCardName ?? "na"}-${idx}`}>
                <td>{row.projectId}</td>
                <td>{row.budgetCode}</td>
                <td>{row.creditCardName ?? "Unassigned"}</td>
                <td>{formatCurrency(row.pendingCcTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
