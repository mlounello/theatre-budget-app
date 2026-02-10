import { purchases, projects } from "@/lib/mock-data";
import { formatCurrency } from "@/lib/format";

export default function RequestsPage() {
  return (
    <section>
      <header className="sectionHeader">
        <p className="eyebrow">Buyer Queue</p>
        <h1>Purchase Requests</h1>
        <p className="heroSubtitle">
          Buyers submit estimated/requested amounts. PM/Admin move items to Encumbered, Pending CC, or Posted.
        </p>
      </header>

      <div className="tableWrap">
        <table>
          <thead>
            <tr>
              <th>Project</th>
              <th>Reference</th>
              <th>Title</th>
              <th>Status</th>
              <th>Estimated</th>
              <th>Requested</th>
              <th>ENC</th>
              <th>Pending CC</th>
              <th>Posted</th>
            </tr>
          </thead>
          <tbody>
            {purchases.map((purchase) => {
              const project = projects.find((item) => item.id === purchase.projectId);

              return (
                <tr key={purchase.id}>
                  <td>{project?.name ?? purchase.projectId}</td>
                  <td>{purchase.referenceNumber}</td>
                  <td>{purchase.title}</td>
                  <td>
                    <span className={`statusChip status-${purchase.status}`}>{purchase.status}</span>
                  </td>
                  <td>{formatCurrency(purchase.estimatedAmount)}</td>
                  <td>{formatCurrency(purchase.requestedAmount)}</td>
                  <td>{formatCurrency(purchase.encumberedAmount)}</td>
                  <td>{formatCurrency(purchase.pendingCcAmount)}</td>
                  <td>{formatCurrency(purchase.postedAmount)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
