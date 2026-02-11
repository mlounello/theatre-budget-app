import { getRequestsData } from "@/lib/db";
import { CreateRequestForm } from "@/app/requests/create-request-form";
import { RequestsTable } from "@/app/requests/requests-table";

export default async function RequestsPage() {
  const { purchases, receipts, budgetLineOptions, accountCodeOptions, canManageSplits } = await getRequestsData();

  return (
    <section>
      <header className="sectionHeader">
        <p className="eyebrow">Buyer Queue</p>
        <h1>Purchase Requests</h1>
        <p className="heroSubtitle">
          Buyers submit estimated/requested amounts. PM/Admin move items to Encumbered, Pending CC, or Posted.
        </p>
      </header>

      <article className="panel requestFormPanel">
        <h2>Create Request</h2>
        <CreateRequestForm
          budgetLineOptions={budgetLineOptions}
          accountCodeOptions={accountCodeOptions}
          canManageSplits={canManageSplits}
        />
      </article>

      <RequestsTable purchases={purchases} receipts={receipts} budgetLineOptions={budgetLineOptions} />
    </section>
  );
}
