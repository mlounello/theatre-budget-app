import Link from "next/link";
import { ProcurementCreateDrawers } from "@/app/procurement/procurement-create-drawers";
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
  searchParams?: Promise<{
    fiscalYearId?: string;
    pr_page?: string;
    pr_queue?: string;
    pr_q?: string;
    pr_project?: string;
    pr_status?: string;
    pr_type?: string;
    pr_sort?: string;
    pr_dir?: string;
  }>;
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
  const requestedQueue = ["needs_attention", "open", "paid", "all"].includes(resolvedSearchParams?.pr_queue ?? "")
    ? resolvedSearchParams?.pr_queue as "needs_attention" | "open" | "paid" | "all"
    : "open";
  const searchQuery = (resolvedSearchParams?.pr_q ?? "").trim();
  const projectFilter = (resolvedSearchParams?.pr_project ?? "").trim();
  const procurementStatusFilter = (resolvedSearchParams?.pr_status ?? "").trim();
  const requestTypeFilter = (resolvedSearchParams?.pr_type ?? "").trim();
  const sortFilter = (resolvedSearchParams?.pr_sort ?? "").trim();
  const sortDirection = (resolvedSearchParams?.pr_dir ?? "").trim();
  const {
    purchases,
    receipts,
    receivingDocs,
    allocations,
    budgetLineOptions,
    projectOptions,
    organizationOptions,
    vendors,
    accountCodeOptions,
    productionCategoryOptions,
    canManageProcurement,
    totalCount,
    page,
    pageSize,
    queueCounts
  } = await getProcurementData({
    fiscalYearId: selectedFiscalYearId,
    page: requestedPage,
    pageSize: 25,
    queue: requestedQueue,
    query: searchQuery,
    projectId: projectFilter,
    procurementStatus: procurementStatusFilter,
    requestType: requestTypeFilter
  });
  const defaultFiscalYearId = selectedFiscalYearId;
  const totalPages = Math.max(Math.ceil(totalCount / pageSize), 1);
  const buildHref = (overrides: Record<string, string>) => {
    const params = new URLSearchParams();
    params.set("fiscalYearId", selectedFiscalYearId);
    params.set("pr_queue", requestedQueue);
    if (searchQuery) params.set("pr_q", searchQuery);
    if (projectFilter) params.set("pr_project", projectFilter);
    if (procurementStatusFilter) params.set("pr_status", procurementStatusFilter);
    if (requestTypeFilter) params.set("pr_type", requestTypeFilter);
    if (sortFilter) params.set("pr_sort", sortFilter);
    if (sortDirection) params.set("pr_dir", sortDirection);
    Object.entries(overrides).forEach(([key, value]) => {
      if (value) params.set(key, value);
      else params.delete(key);
    });
    return `/procurement?${params.toString()}`;
  };
  const pageHref = (nextPage: number) => {
    const params = new URLSearchParams(buildHref({}).split("?")[1] ?? "");
    params.set("pr_page", String(nextPage));
    return `/procurement?${params.toString()}`;
  };
  const queueHref = (queue: string) => buildHref({ pr_queue: queue, pr_page: "" });

  return (
    <section>
      <header className="sectionHeader">
        <p className="eyebrow">Procurement</p>
        <h1>Order and Purchasing Workflow</h1>
        <p className="heroSubtitle">Track requisitions, PO progress, receipts, invoices, and payment alongside budget statuses.</p>
        <p className="helperText">Purchase Orders do not use Expense Claim or receipt-reconciliation fields. Card claims and reimbursements are managed in Credit Cards.</p>
      </header>

      <div className="procurementHeaderActions">
        {canManageProcurement ? (
          <ProcurementCreateDrawers
            defaultFiscalYearId={defaultFiscalYearId}
            projectOptions={projectOptions}
            budgetLineOptions={budgetLineOptions}
            organizationOptions={organizationOptions}
            vendors={vendors}
            accountCodeOptions={accountCodeOptions}
            productionCategoryOptions={productionCategoryOptions}
          />
        ) : null}
      </div>

      <nav className="procurementQueues" aria-label="Procurement work queues">
        {[
          { value: "needs_attention", label: "Needs Attention", count: queueCounts.needsAttention },
          { value: "open", label: "Open", count: queueCounts.open },
          { value: "paid", label: "Paid", count: queueCounts.paid },
          { value: "all", label: "All", count: queueCounts.all }
        ].map((queue) => (
          <Link
            key={queue.value}
            className={requestedQueue === queue.value ? "procurementQueueCard active" : "procurementQueueCard"}
            href={queueHref(queue.value)}
            aria-current={requestedQueue === queue.value ? "page" : undefined}
          >
            <strong>{queue.count}</strong>
            <span>{queue.label}</span>
          </Link>
        ))}
      </nav>

      <article className="panel procurementFilterPanel">
        <FilterToolbar label="Procurement filters">
          <form method="get" className="inlineFilters">
            <input type="hidden" name="pr_queue" value={requestedQueue} />
            <label>
              Fiscal Year
              <select name="fiscalYearId" defaultValue={selectedFiscalYearId}>
                {fiscalYearOptions.map((fiscalYear) => (
                  <option key={fiscalYear.id} value={fiscalYear.id}>{fiscalYear.name}</option>
                ))}
              </select>
            </label>
            <label>
              Project / Budget
              <select name="pr_project" defaultValue={projectFilter}>
                <option value="">All</option>
                <option value="__organization_budget__">Organization budget</option>
                {projectOptions.map((project) => <option key={project.id} value={project.id}>{project.label}</option>)}
              </select>
            </label>
            <label>
              Status
              <select name="pr_status" defaultValue={procurementStatusFilter}>
                <option value="">All statuses</option>
                <option value="requested">Requested</option>
                <option value="ordered">Ordered</option>
                <option value="partial_received">Partially Received</option>
                <option value="fully_received">Fully Received</option>
                <option value="invoice_sent">Invoice Sent</option>
                <option value="invoice_received">Invoice Received</option>
                <option value="paid">Paid</option>
                <option value="cancelled">Cancelled</option>
                <option value="receipts_uploaded">Receipts Uploaded</option>
                <option value="statement_paid">Statement Paid</option>
                <option value="posted_to_account">Posted to Account</option>
              </select>
            </label>
            <label>
              Type
              <select name="pr_type" defaultValue={requestTypeFilter}>
                <option value="">All types</option>
                <option value="requisition">Requisition</option>
                <option value="expense">Expense / Credit Card</option>
                <option value="request">Budget Hold</option>
                <option value="budget_transfer">Budget Transfer</option>
              </select>
            </label>
            <label>
              Search
              <input name="pr_q" defaultValue={searchQuery} placeholder="Title, req, PO, invoice..." />
            </label>
            <button className="buttonLink buttonPrimary" type="submit">Apply</button>
            {(searchQuery || projectFilter || procurementStatusFilter || requestTypeFilter) ? (
              <Link className="buttonLink" href={buildHref({ pr_q: "", pr_project: "", pr_status: "", pr_type: "", pr_page: "" })}>Clear filters</Link>
            ) : null}
          </form>
        </FilterToolbar>
      </article>

      <p className="helperText">
        Artist contract payments and union pension or benefit-fund checks are tracked in Hiring &amp; Payments. They still count against their assigned budgets, projects, and departments.
      </p>

      <ProcurementTable
        purchases={purchases}
        receipts={receipts}
        receivingDocs={receivingDocs}
        allocations={allocations}
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
