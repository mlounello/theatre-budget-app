"use client";

import { PaginationControls } from "@/components/ui/pagination-controls";
import { ResponsiveDataTable } from "@/components/ui/responsive-data-table";
import { formatCurrency } from "@/lib/format";

export type ExpenseClaimView = {
  id: string;
  claimNumber: string;
  claimType: string;
  claimMonth: string | null;
  status: string;
  authorizedAmount: number;
  settledAmount: number;
  authorizationClaimId: string | null;
  overageExplanation: string | null;
  projectLabel: string;
  cardLabel: string | null;
  expenses: Array<{ id: string; expenseNumber: string | null; title: string; amount: number; stage: string | null; budgetLabel: string; accountCode: string | null }>;
};

export function ExpenseClaimsPanel({
  claims,
  page,
  total,
  pageSize,
  hrefForPage,
  onCreate
}: {
  claims: ExpenseClaimView[];
  page: number;
  total: number;
  pageSize: number;
  hrefForPage: (page: number) => string;
  onCreate: () => void;
}) {
  return (
    <article className="panel panelFull">
      <div className="ccWorkspaceHeader">
        <div>
          <p className="eyebrow">Expense Claims</p>
          <h2>EC Claims &amp; EX Expenses</h2>
          <p className="heroSubtitle">Funding requests hold the authorized maximum. Reconciliations and reimbursements record each purchase as its own Expense.</p>
        </div>
        <button type="button" className="buttonLink buttonPrimary" onClick={onCreate}>New Expense Claim</button>
      </div>
      {claims.length === 0 ? <p className="emptyState">No Expense Claims exist in this fiscal year.</p> : (
        <div className="expenseClaimList">
          {claims.map((claim) => {
            const typeLabel = claim.claimType === "funding_request" ? "Card Funding Request" : claim.claimType === "monthly_reconciliation" ? "Monthly Card Reconciliation" : "Reimbursement";
            const remaining = Math.max(claim.authorizedAmount - claim.settledAmount, 0);
            return (
              <details className="contractCardDetails expenseClaimRecord" key={claim.id}>
                <summary>
                  <span><strong>{claim.claimNumber}</strong> · {typeLabel} · {claim.projectLabel}</span>
                  <small>{claim.cardLabel ?? "No card"} · {claim.claimMonth?.slice(0, 7) ?? "No month"} · {claim.status.replaceAll("_", " ")}</small>
                </summary>
                <div className="expenseClaimRecordBody">
                  {claim.claimType === "funding_request" ? <p><strong>Authorized:</strong> {formatCurrency(claim.authorizedAmount)} · <strong>Reconciled:</strong> {formatCurrency(claim.settledAmount)} · <strong>Remaining hold:</strong> {formatCurrency(remaining)}</p> : <p><strong>Claim total:</strong> {formatCurrency(claim.settledAmount || claim.expenses.reduce((sum, expense) => sum + expense.amount, 0))}</p>}
                  {claim.overageExplanation ? <p className="errorNote"><strong>Overage explanation:</strong> {claim.overageExplanation}</p> : null}
                  <ResponsiveDataTable
                    label={`${claim.claimNumber} expenses`}
                    rows={claim.expenses}
                    rowKey={(expense) => expense.id}
                    emptyMessage="No Expenses are linked to this claim."
                    columns={[
                      { key: "number", label: "Expense", render: (expense) => expense.expenseNumber ?? "-" },
                      { key: "purchase", label: "Purchase", render: (expense) => expense.title },
                      { key: "budget", label: "Budget / Category", render: (expense) => expense.budgetLabel },
                      { key: "account", label: "Account", render: (expense) => expense.accountCode ?? "-" },
                      { key: "stage", label: "Stage", render: (expense) => expense.stage?.replaceAll("_", " ") ?? "-" },
                      { key: "amount", label: "Amount", numeric: true, render: (expense) => formatCurrency(expense.amount) }
                    ]}
                  />
                </div>
              </details>
            );
          })}
        </div>
      )}
      {total > pageSize ? (
        <PaginationControls
          page={page}
          totalPages={Math.max(Math.ceil(total / pageSize), 1)}
          totalCount={total}
          itemLabel="Expense Claims"
          hrefForPage={hrefForPage}
        />
      ) : null}
    </article>
  );
}
