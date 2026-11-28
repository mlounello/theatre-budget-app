"use client";

import { useActionState, useState } from "react";
import { correctExpenseClaimNumberAction, type ExpenseClaimActionState } from "@/app/cc/expense-claim-actions";
import { adjustExpenseDetailsAction, deleteExpenseAction, moveExpenseToClaimAction } from "@/app/cc/actions/expenses";
import { SideDrawer } from "@/components/ui/side-drawer";
import { ActionNotice } from "@/components/ui/action-notice";
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

const correctionInitialState: ExpenseClaimActionState = { ok: true, message: "", timestamp: 0 };

function ExpenseClaimNumberEditor({ claimId, claimNumber }: { claimId: string; claimNumber: string }) {
  const [state, action, pending] = useActionState(correctExpenseClaimNumberAction, correctionInitialState);
  return (
    <form action={action} className="inlineEditForm expenseClaimNumberEditor">
      <input type="hidden" name="claimId" value={claimId} />
      <label>
        Correct EC Number
        <input name="newClaimNumber" defaultValue={claimNumber} pattern="EC[0-9]{6}" placeholder="EC######" required />
      </label>
      <button type="submit" className="tinyButton" disabled={pending}>{pending ? "Correcting…" : "Save EC Number"}</button>
      <span className="helperText">If that EC already exists for the same card, type, and month, these Expenses will be merged into it.</span>
      {state.message ? <span className={state.ok ? "successNote" : "errorNote"}>{state.message}</span> : null}
    </form>
  );
}

type AdjustTarget = { claim: ExpenseClaimView; expense: ExpenseClaimView["expenses"][number] };

function ExpenseAdjustDrawer({ target, onClose }: { target: AdjustTarget | null; onClose: () => void }) {
  const [detailsState, detailsAction, detailsPending] = useActionState(adjustExpenseDetailsAction, correctionInitialState);
  const [moveState, moveAction, movePending] = useActionState(moveExpenseToClaimAction, correctionInitialState);
  const [deleteState, deleteAction, deletePending] = useActionState(deleteExpenseAction, correctionInitialState);
  const deleted = deleteState.ok && deleteState.message !== "";
  const reconciliation = target?.claim.claimType === "monthly_reconciliation" && target.expense.stage === "actual";

  return (
    <>
    {deleted ? <ActionNotice tone="success">{deleteState.message}</ActionNotice> : null}
    <SideDrawer
      open={Boolean(target)}
      onClose={onClose}
      eyebrow="Adjust Expense"
      title={target ? `${target.expense.expenseNumber ?? "Expense"} · ${target.expense.title}` : "Expense"}
      description={target ? `${target.claim.claimNumber} · ${formatCurrency(target.expense.amount)}` : undefined}
      closeLabel="Close expense adjustment panel"
    >
      {target ? (
        <div className="varianceDrawerBody">
          {deleted ? (
            <section className="varianceDrawerSection">
              <p>Expense deleted.</p>
              <button type="button" className="buttonLink" onClick={onClose}>Close</button>
            </section>
          ) : (
            <>
              <section className="varianceDrawerSection">
                <h3>Correct EX number and title</h3>
                {detailsState.message ? <ActionNotice tone={detailsState.ok ? "success" : "error"}>{detailsState.message}</ActionNotice> : null}
                <form action={detailsAction} className="drawerFieldGrid" key={`details-${target.expense.id}`}>
                  <input type="hidden" name="purchaseId" value={target.expense.id} />
                  <label>EX Number<input name="expenseNumber" defaultValue={target.expense.expenseNumber ?? ""} pattern="EX[0-9]{6}" placeholder="EX######" required /></label>
                  <label>Title<input name="title" defaultValue={target.expense.title} maxLength={200} required /></label>
                  <div><button type="submit" className="buttonLink buttonPrimary" disabled={detailsPending}>{detailsPending ? "Saving…" : "Save Details"}</button></div>
                </form>
                <p className="helperText">To change the project, category, or Banner account, use Edit Budget on the expense row.</p>
              </section>

              {reconciliation ? (
                <>
                  <section className="varianceDrawerSection">
                    <h3>Move to another EC</h3>
                    <p className="helperText">Use this when the Expense is in the wrong claim. Enter an existing EC for the same card and month, or a new EC number to create it.</p>
                    {moveState.message ? <ActionNotice tone={moveState.ok ? "success" : "error"}>{moveState.message}</ActionNotice> : null}
                    <form action={moveAction} className="drawerFieldGrid" key={`move-${target.expense.id}`}>
                      <input type="hidden" name="purchaseId" value={target.expense.id} />
                      <label>EC Number<input name="claimNumber" pattern="EC[0-9]{6}" placeholder="EC######" required /></label>
                      <div><button type="submit" className="buttonLink" disabled={movePending}>{movePending ? "Moving…" : "Move Expense"}</button></div>
                    </form>
                  </section>

                  <section className="varianceDrawerSection">
                    <h3>Delete this Expense</h3>
                    <p className="helperText">
                      Removes {target.expense.expenseNumber ?? "this Expense"} and its budget impact. Its receipts return to the staged pool, where you can correct them and finalize again. This cannot be undone.
                    </p>
                    {deleteState.message && !deleteState.ok ? <ActionNotice tone="error">{deleteState.message}</ActionNotice> : null}
                    <form action={deleteAction} className="drawerFieldGrid" key={`delete-${target.expense.id}`}>
                      <input type="hidden" name="purchaseId" value={target.expense.id} />
                      <label className="checkboxLabel"><input type="checkbox" name="confirmDelete" value="yes" required />I understand this deletes {target.expense.expenseNumber ?? "this Expense"} from {target.claim.claimNumber}.</label>
                      <div><button type="submit" className="buttonLink" disabled={deletePending}>{deletePending ? "Deleting…" : "Delete Expense"}</button></div>
                    </form>
                  </section>
                </>
              ) : (
                <p className="helperText">Moving or deleting is available for reconciled Expenses in Monthly Card Reconciliation claims.</p>
              )}
            </>
          )}
        </div>
      ) : null}
    </SideDrawer>
    </>
  );
}

export function ExpenseClaimsPanel({
  claims,
  page,
  total,
  pageSize,
  hrefForPage,
  onCreate,
  onEditExpense
}: {
  claims: ExpenseClaimView[];
  page: number;
  total: number;
  pageSize: number;
  hrefForPage: (page: number) => string;
  onCreate: () => void;
  onEditExpense: (expenseId: string) => void;
}) {
  const [adjustId, setAdjustId] = useState<string | null>(null);
  const adjustTarget: AdjustTarget | null = (() => {
    if (!adjustId) return null;
    for (const claim of claims) {
      const expense = claim.expenses.find((candidate) => candidate.id === adjustId);
      if (expense) return { claim, expense };
    }
    return null;
  })();
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
                  <ExpenseClaimNumberEditor claimId={claim.id} claimNumber={claim.claimNumber} />
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
                      { key: "amount", label: "Amount", numeric: true, render: (expense) => formatCurrency(expense.amount) },
                      { key: "actions", label: "Actions", render: (expense) => (
                        <span className="buttonCluster">
                          <button type="button" className="tinyButton" onClick={() => onEditExpense(expense.id)}>Edit Budget</button>
                          <button type="button" className="tinyButton" onClick={() => setAdjustId(expense.id)}>Adjust</button>
                        </span>
                      ) }
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
      <ExpenseAdjustDrawer key={adjustId ?? "none"} target={adjustTarget} onClose={() => setAdjustId(null)} />
    </article>
  );
}
