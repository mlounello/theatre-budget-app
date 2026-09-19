"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  assignReceiptsToStatementAction,
  createCreditCardAction,
  postStatementMonthToBannerAction,
  reconcileCcPurchaseToReceiptsAction,
  reopenStatementMonthAction,
  submitStatementMonthAction,
  unpostStatementMonthFromBannerAction,
  unassignReceiptFromStatementAction,
  updateCcAttentionPurchaseAction,
  type ActionState
} from "@/app/cc/actions";
import { addProcurementReceiptAction, deleteProcurementReceiptAction } from "@/app/procurement/actions";
import { CcAdminTables } from "@/app/cc/cc-admin-tables";
import { CreateStatementMonthForm } from "@/app/cc/create-statement-month-form";
import { ExpenseClaimForm } from "@/app/cc/expense-claim-form";
import { ExpenseClaimsPanel, type ExpenseClaimView } from "@/app/cc/expense-claims-panel";
import { SideDrawer } from "@/components/ui/side-drawer";
import { StatusPill } from "@/components/ui/status-controls";
import { formatCurrency } from "@/lib/format";

type StatementMonthRow = {
  id: string;
  fiscalYearId: string;
  fiscalYearName: string;
  creditCardId: string;
  creditCardName: string;
  statementMonth: string;
  postedAt: string | null;
  postedToBannerAt: string | null;
};

type PendingReceiptRow = {
  id: string;
  purchaseId: string;
  amount: number;
  note: string | null;
  receiptDate: string;
  requestTitle: string;
  requestNumber: string | null;
  purchasePendingCcAmount: number;
  purchaseCreditCardId: string | null;
  purchaseStatus: string;
  purchaseRequestType: string;
  purchaseIsCreditCard: boolean;
  statementMonthId: string | null;
  projectLabel: string;
  budgetLineLabel: string;
};

type PendingPurchaseDetailRow = {
  id: string;
  projectLabel: string;
  budgetLineLabel: string;
  requestType: string;
  isCreditCard: boolean;
  requestTitle: string;
  requestNumber: string | null;
  pendingCcAmount: number;
  receiptTotal: number;
  receiptCount: number;
  creditCardId: string | null;
  creditCardName: string | null;
  ccWorkflowStatus: string | null;
  statementMonthLabel: string | null;
  assignmentState: string;
};

type StatementLineDetailRow = {
  id: string;
  statementMonthId: string;
  amount: number;
  note: string | null;
  matchedPurchaseIds: string[];
  projectLabel: string;
  budgetLineLabel: string;
};

type ProjectRow = { id: string; name: string; season?: string | null };
type CardRow = { id: string; nickname: string; maskedNumber: string | null; active: boolean };
type AccountCodeOption = { id: string; label: string };
type ProductionCategoryOption = { id: string; name: string };
type FiscalYearOption = { id: string; name: string };
type OrganizationOption = { id: string; name: string; orgCode: string };

type PendingCcRow = {
  scopeId: string;
  projectId: string | null;
  scopeLabel: string;
  budgetCode: string;
  creditCardName: string | null;
  pendingCcTotal: number;
};

type FundingClaim = {
  id: string;
  claimNumber: string;
  authorizedAmount: number;
  settledAmount: number;
  projectId: string | null;
  organizationId: string;
  creditCardId: string | null;
};

type Props = {
  cards: CardRow[];
  statementMonths: StatementMonthRow[];
  pendingReceipts: PendingReceiptRow[];
  statementLineDetails: StatementLineDetailRow[];
  pendingPurchaseDetails: PendingPurchaseDetailRow[];
  filteredStatementMonths: StatementMonthRow[];
  filteredPendingRows: PendingCcRow[];
  selectedMonthCard: string;
  selectedMonthState: string;
  selectedMonthQuery: string;
  selectedPendingProject: string;
  selectedPendingCard: string;
  selectedPendingQuery: string;
  scopedProjects: ProjectRow[];
  hasGlobalAdmin: boolean;
  accountCodeOptions: AccountCodeOption[];
  productionCategoryOptions: ProductionCategoryOption[];
  fiscalYearOptions: FiscalYearOption[];
  selectedFiscalYearId: string;
  organizationOptions: OrganizationOption[];
  selectedView: "current" | "claims" | "exceptions" | "history" | "setup";
  requestedStatementId: string;
  fundingClaims: FundingClaim[];
  expenseClaims: ExpenseClaimView[];
  expenseClaimPage: number;
  expenseClaimTotal: number;
  expenseClaimPageSize: number;
};

const initialState: ActionState = { ok: true, message: "", timestamp: 0 };

export function CcPageClient({
  cards,
  statementMonths,
  pendingReceipts,
  statementLineDetails,
  pendingPurchaseDetails,
  filteredStatementMonths,
  filteredPendingRows,
  selectedMonthCard,
  selectedMonthState,
  selectedMonthQuery,
  selectedPendingProject,
  selectedPendingCard,
  selectedPendingQuery,
  scopedProjects,
  hasGlobalAdmin,
  accountCodeOptions,
  productionCategoryOptions,
  fiscalYearOptions,
  selectedFiscalYearId,
  organizationOptions,
  selectedView,
  requestedStatementId,
  fundingClaims,
  expenseClaims,
  expenseClaimPage,
  expenseClaimTotal,
  expenseClaimPageSize
}: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [createCardState, createCardAction] = useActionState(createCreditCardAction, initialState);
  const [assignState, assignAction] = useActionState(assignReceiptsToStatementAction, initialState);
  const [unassignState, unassignAction] = useActionState(unassignReceiptFromStatementAction, initialState);
  const [submitState, submitAction] = useActionState(submitStatementMonthAction, initialState);
  const [postState, postAction] = useActionState(postStatementMonthToBannerAction, initialState);
  const [reopenState, reopenAction] = useActionState(reopenStatementMonthAction, initialState);
  const [unpostState, unpostAction] = useActionState(unpostStatementMonthFromBannerAction, initialState);
  const [attentionUpdateState, attentionUpdateAction] = useActionState(updateCcAttentionPurchaseAction, initialState);
  const [attentionReconcileState, attentionReconcileAction] = useActionState(reconcileCcPurchaseToReceiptsAction, initialState);
  const [attentionReceiptState, attentionReceiptAction] = useActionState(addProcurementReceiptAction, initialState);
  const [attentionDeleteReceiptState, attentionDeleteReceiptAction] = useActionState(deleteProcurementReceiptAction, initialState);
  const [openDrawer, setOpenDrawer] = useState<"claim" | "statement" | "card" | null>(null);
  const selectedStatement = useMemo(
    () =>
      statementMonths.find((month) => month.id === requestedStatementId) ??
      statementMonths.find((month) => !month.postedAt) ??
      statementMonths.find((month) => !month.postedToBannerAt) ??
      statementMonths[0] ??
      null,
    [requestedStatementId, statementMonths]
  );
  const assignedReceipts = selectedStatement
    ? pendingReceipts.filter((receipt) => receipt.statementMonthId === selectedStatement.id)
    : [];
  const selectedStatementLines = selectedStatement
    ? statementLineDetails.filter((line) => line.statementMonthId === selectedStatement.id)
    : [];
  const currentStatementRows = assignedReceipts.length > 0
    ? assignedReceipts.map((receipt) => ({
        id: `receipt:${receipt.id}`,
        projectLabel: receipt.projectLabel,
        budgetLineLabel: receipt.budgetLineLabel,
        requestNumber: receipt.requestNumber,
        requestTitle: receipt.requestTitle,
        amount: receipt.amount,
        canRemove: true,
        receiptId: receipt.id,
        sourceLabel: "Receipt"
      }))
    : selectedStatementLines.map((line) => ({
        id: `statement-line:${line.id}`,
        projectLabel: line.projectLabel,
        budgetLineLabel: line.budgetLineLabel,
        requestNumber: null,
        requestTitle: line.note?.trim() || "Statement line",
        amount: line.amount,
        canRemove: false,
        receiptId: null,
        sourceLabel: "Statement line"
      }));
  const unassignedCandidates = pendingReceipts.filter(
    (receipt) =>
      !receipt.statementMonthId &&
      receipt.purchaseStatus === "pending_cc" &&
      receipt.purchaseRequestType === "expense" &&
      receipt.purchaseIsCreditCard &&
      (!selectedStatement || !receipt.purchaseCreditCardId || receipt.purchaseCreditCardId === selectedStatement.creditCardId)
  );
  const assignedTotal = assignedReceipts.reduce((sum, receipt) => sum + receipt.amount, 0);
  const exceptionRows = pendingPurchaseDetails.filter(
    (purchase) => !["Ready to assign", "Already linked to statement month"].includes(purchase.assignmentState)
  );
  const missingReceiptCount = exceptionRows.filter((purchase) => purchase.assignmentState === "Missing receipts").length;
  const unassignedCardCount = exceptionRows.filter((purchase) => purchase.assignmentState === "Unassigned card").length;
  const activeAttentionPurchase = pendingPurchaseDetails.find((purchase) => purchase.id === searchParams.get("cc_purchase")) ?? null;
  const activeAttentionReceipts = activeAttentionPurchase
    ? pendingReceipts.filter((receipt) => receipt.purchaseId === activeAttentionPurchase.id)
    : [];
  const workspaceHref = (view: Props["selectedView"], statementId?: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("cc_view", view);
    if (statementId) params.set("cc_statement", statementId);
    else if (view !== "current") params.delete("cc_statement");
    return `${pathname}?${params.toString()}`;
  };
  const expenseClaimHref = (page: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("cc_view", "claims");
    if (page > 1) params.set("cc_claim_page", String(page));
    else params.delete("cc_claim_page");
    return `${pathname}?${params.toString()}`;
  };
  const setActiveAttentionPurchase = (purchaseId: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (purchaseId) {
      params.set("cc_purchase", purchaseId);
    } else {
      params.delete("cc_purchase");
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return (
    <>
      <nav className="ccWorkspaceNav" aria-label="Credit Card workspace">
        {[
          { value: "current", label: "Current Statement", meta: selectedStatement ? `${selectedStatement.statementMonth.slice(0, 7)} · ${selectedStatement.creditCardName}` : "No statement" },
          { value: "claims", label: "Expense Claims", meta: `${expenseClaims.length} EC records` },
          { value: "exceptions", label: "Exceptions", meta: `${exceptionRows.length} need attention` },
          { value: "history", label: "Statement History", meta: `${statementMonths.length} statements` },
          { value: "setup", label: "Cards & Setup", meta: `${cards.filter((card) => card.active).length} active cards` }
        ].map((view) => (
          <Link
            key={view.value}
            href={workspaceHref(view.value as Props["selectedView"])}
            className={selectedView === view.value ? "ccWorkspaceTab active" : "ccWorkspaceTab"}
            aria-current={selectedView === view.value ? "page" : undefined}
          >
            <strong>{view.label}</strong>
            <span>{view.meta}</span>
          </Link>
        ))}
      </nav>

      <SideDrawer
        open={openDrawer === "claim"}
        onClose={() => setOpenDrawer(null)}
        eyebrow="Credit Cards"
        title="New Expense Claim"
        description="Create a Card Funding Request, Monthly Card Reconciliation, or Reimbursement with EC###### and EX###### identifiers."
      >
        <ExpenseClaimForm
          fiscalYearId={selectedFiscalYearId}
          projects={scopedProjects}
          organizations={organizationOptions}
          cards={cards}
          accountCodes={accountCodeOptions}
          productionCategories={productionCategoryOptions}
          fundingClaims={fundingClaims}
          onCancel={() => setOpenDrawer(null)}
        />
      </SideDrawer>

      <SideDrawer open={openDrawer === "statement"} onClose={() => setOpenDrawer(null)} eyebrow="Credit Cards" title="Open Statement Month">
        <CreateStatementMonthForm cards={cards} fiscalYearOptions={fiscalYearOptions} defaultFiscalYearId={selectedFiscalYearId} />
      </SideDrawer>

      <SideDrawer open={openDrawer === "card"} onClose={() => setOpenDrawer(null)} eyebrow="Credit Cards" title="Add Credit Card">
        <form action={createCardAction} className="requestForm">
          {createCardState.message ? (
            <p className={createCardState.ok ? "successNote" : "errorNote"} key={createCardState.timestamp}>{createCardState.message}</p>
          ) : null}
          <label>Card Nickname<input name="nickname" required placeholder="Theatre Card A" /></label>
          <label>Masked Number<input name="maskedNumber" placeholder="****1234" /></label>
          <label className="checkboxLabel"><input name="active" type="checkbox" defaultChecked />Active</label>
          <button type="submit" className="buttonLink buttonPrimary">Save Card</button>
        </form>
      </SideDrawer>

      <SideDrawer
        open={Boolean(activeAttentionPurchase)}
        onClose={() => setActiveAttentionPurchase(null)}
        eyebrow="Transaction needing attention"
        title={activeAttentionPurchase?.requestTitle ?? "Credit-card transaction"}
        description={activeAttentionPurchase ? `${activeAttentionPurchase.projectLabel} · ${activeAttentionPurchase.assignmentState}` : undefined}
        closeLabel="Close transaction editor"
      >
        {activeAttentionPurchase ? (
          <div className="varianceDrawerBody">
            <section className="varianceDrawerSection">
              <h3>Reconciliation summary</h3>
              <p><strong>Authorized cap:</strong> {formatCurrency(activeAttentionPurchase.pendingCcAmount)}</p>
              <p><strong>Receipt total:</strong> {formatCurrency(activeAttentionPurchase.receiptTotal)} across {activeAttentionPurchase.receiptCount} receipt{activeAttentionPurchase.receiptCount === 1 ? "" : "s"}</p>
              <p><strong>Unused authorization:</strong> {formatCurrency(Math.max(activeAttentionPurchase.pendingCcAmount - activeAttentionPurchase.receiptTotal, 0))}</p>
              <p className="helperText">The authorization is a ceiling, not a spending target. Reconcile at actual to release an unused balance after all receipts are present.</p>
              {attentionReconcileState.message ? <p className={attentionReconcileState.ok ? "successNote" : "errorNote"}>{attentionReconcileState.message}</p> : null}
              <form action={attentionReconcileAction}>
                <input type="hidden" name="purchaseId" value={activeAttentionPurchase.id} />
                <button type="submit" className="buttonLink buttonPrimary" disabled={activeAttentionPurchase.receiptCount === 0 || activeAttentionPurchase.receiptTotal > activeAttentionPurchase.pendingCcAmount + 0.005}>
                  Reconcile at actual ({formatCurrency(activeAttentionPurchase.receiptTotal)})
                </button>
              </form>
            </section>

            <section className="varianceDrawerSection">
              <h3>Edit transaction</h3>
              {attentionUpdateState.message ? <p className={attentionUpdateState.ok ? "successNote" : "errorNote"}>{attentionUpdateState.message}</p> : null}
              <form action={attentionUpdateAction} className="requestForm">
                <input type="hidden" name="purchaseId" value={activeAttentionPurchase.id} />
                <label>Credit Card<select name="creditCardId" defaultValue={activeAttentionPurchase.creditCardId ?? ""} required><option value="">Select card</option>{cards.filter((card) => card.active || card.id === activeAttentionPurchase.creditCardId).map((card) => <option key={card.id} value={card.id}>{card.nickname}{card.maskedNumber ? ` (${card.maskedNumber})` : ""}</option>)}</select></label>
                <label>Authorized Cap<input name="pendingCcAmount" type="number" min="0.01" step="0.01" defaultValue={activeAttentionPurchase.pendingCcAmount.toFixed(2)} required /></label>
                <button type="submit" className="tinyButton">Save Transaction</button>
              </form>
            </section>

            <section className="varianceDrawerSection">
              <h3>Receipts</h3>
              {attentionReceiptState.message ? <p className={attentionReceiptState.ok ? "successNote" : "errorNote"}>{attentionReceiptState.message}</p> : null}
              {attentionDeleteReceiptState.message ? <p className={attentionDeleteReceiptState.ok ? "successNote" : "errorNote"}>{attentionDeleteReceiptState.message}</p> : null}
              <form action={attentionReceiptAction} className="requestForm">
                <input type="hidden" name="purchaseId" value={activeAttentionPurchase.id} />
                <label>Receipt Description<input name="note" placeholder="Vendor or purchase description" /></label>
                <label>Receipt Amount<input name="amountReceived" type="number" min="0.01" step="0.01" required /></label>
                <label>Receipt Link<input name="attachmentUrl" type="url" placeholder="Optional receipt URL" /></label>
                <input type="hidden" name="fullyReceived" value="on" />
                <button type="submit" className="tinyButton">Add Receipt</button>
              </form>
              <ul>
                {activeAttentionReceipts.map((receipt) => (
                  <li key={receipt.id}>{receipt.note ?? "Receipt"} · {formatCurrency(receipt.amount)}
                    <form action={attentionDeleteReceiptAction} className="inlineEditForm">
                      <input type="hidden" name="id" value={receipt.id} />
                      <button type="submit" className="tinyButton dangerButton">Remove</button>
                    </form>
                  </li>
                ))}
                {activeAttentionReceipts.length === 0 ? <li>No receipts recorded.</li> : null}
              </ul>
            </section>
          </div>
        ) : null}
      </SideDrawer>

      {selectedView === "current" ? (
      <article className="panel panelFull ccCurrentStatement">
        <div className="ccWorkspaceHeader">
          <div>
            <p className="eyebrow">Current Statement</p>
            <h2>{selectedStatement ? `${selectedStatement.statementMonth.slice(0, 7)} · ${selectedStatement.creditCardName}` : "No statement month"}</h2>
            <p className="heroSubtitle">Assign receipts, mark the statement paid, then post it to Banner.</p>
          </div>
          <div className="buttonCluster">
            {(scopedProjects.length > 0 || organizationOptions.length > 0 || hasGlobalAdmin) ? (
              <button type="button" className="buttonLink buttonPrimary" onClick={() => setOpenDrawer("claim")}>New Expense Claim</button>
            ) : null}
            <button type="button" className="buttonLink" onClick={() => setOpenDrawer("statement")}>Open Statement Month</button>
          </div>
        </div>
        {statementMonths.length > 0 ? (
          <div className="ccStatementPicker" aria-label="Select statement month">
            {statementMonths.map((month) => (
              <Link key={month.id} href={workspaceHref("current", month.id)} className={selectedStatement?.id === month.id ? "active" : ""}>
                <span>{month.statementMonth.slice(0, 7)} · {month.creditCardName}</span>
                <StatusPill tone={month.postedToBannerAt ? "success" : month.postedAt ? "info" : "warning"}>
                  {month.postedToBannerAt ? "Posted" : month.postedAt ? "Statement Paid" : "Open"}
                </StatusPill>
              </Link>
            ))}
          </div>
        ) : (
          <div className="emptyState">
            <p>No statement month exists for this fiscal year.</p>
            <button type="button" className="buttonLink buttonPrimary" onClick={() => setOpenDrawer("statement")}>Open the first statement</button>
          </div>
        )}
        {assignState.message ? (
          <p className={assignState.ok ? "successNote" : "errorNote"} key={assignState.timestamp}>
            {assignState.message}
          </p>
        ) : null}
        {unassignState.message ? (
          <p className={unassignState.ok ? "successNote" : "errorNote"} key={unassignState.timestamp}>
            {unassignState.message}
          </p>
        ) : null}
        {submitState.message ? (
          <p className={submitState.ok ? "successNote" : "errorNote"} key={submitState.timestamp}>
            {submitState.message}
          </p>
        ) : null}
        {postState.message ? (
          <p className={postState.ok ? "successNote" : "errorNote"} key={postState.timestamp}>
            {postState.message}
          </p>
        ) : null}
        {reopenState.message ? (
          <p className={reopenState.ok ? "successNote" : "errorNote"} key={reopenState.timestamp}>
            {reopenState.message}
          </p>
        ) : null}
        {unpostState.message ? (
          <p className={unpostState.ok ? "successNote" : "errorNote"} key={unpostState.timestamp}>
            {unpostState.message}
          </p>
        ) : null}

        {selectedStatement ? (
          <div className="ccStatementBody">
              <div className="tableWrap">
                <table>
                  <thead>
                    <tr>
                      <th>Project</th>
                      <th>Budget Line</th>
                      <th>Req/Ref #</th>
                      <th>Title</th>
                      <th>Source</th>
                      <th>Amount</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentStatementRows.length === 0 ? (
                      <tr>
                        <td colSpan={7}>No receipts or statement lines assigned to this statement month.</td>
                      </tr>
                    ) : null}
                    {currentStatementRows.map((row) => (
                      <tr key={row.id}>
                        <td>{row.projectLabel}</td>
                        <td>{row.budgetLineLabel}</td>
                        <td>{row.requestNumber ?? "-"}</td>
                        <td>{row.requestTitle}</td>
                        <td>{row.sourceLabel}</td>
                        <td>{formatCurrency(row.amount)}</td>
                        <td>
                          {!selectedStatement.postedAt && row.canRemove && row.receiptId ? (
                            <form action={unassignAction} className="inlineEditForm">
                              <input type="hidden" name="statementMonthId" value={selectedStatement.id} />
                              <input type="hidden" name="receiptId" value={row.receiptId} />
                              <button type="submit" className="tinyButton dangerButton">
                                Remove
                              </button>
                            </form>
                          ) : (
                            "-"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="heroSubtitle">Assigned Total: {formatCurrency(assignedTotal)}</p>

              {!selectedStatement.postedAt ? (
                <>
                  <form action={assignAction} className="requestForm">
                    <input type="hidden" name="statementMonthId" value={selectedStatement.id} />
                    <div className="checkboxStack">
                      {unassignedCandidates.map((receipt) => (
                        <div key={receipt.id} className="ccCandidateRow">
                          <label className="checkboxLabel">
                            <input type="checkbox" name="receiptId" value={receipt.id} />
                            {receipt.projectLabel} | {receipt.budgetLineLabel} | {receipt.requestNumber ?? receipt.id.slice(0, 8)} |{" "}
                            {receipt.requestTitle} | {formatCurrency(receipt.amount)}
                          </label>
                          <button type="button" className="tinyButton" onClick={() => setActiveAttentionPurchase(receipt.purchaseId)}>Review &amp; Reconcile</button>
                        </div>
                      ))}
                      {unassignedCandidates.length === 0 ? <p>No unassigned Pending CC receipts for this card.</p> : null}
                    </div>
                    {unassignedCandidates.length > 0 ? (
                      <button type="submit" className="tinyButton">
                        Add Selected Receipts
                      </button>
                    ) : null}
                  </form>

                  <form action={submitAction} className="inlineEditForm" style={{ marginTop: "0.6rem" }}>
                    <input type="hidden" name="statementMonthId" value={selectedStatement.id} />
                    <button type="submit" className="buttonLink buttonPrimary">
                      Submit Statement (Mark Statement Paid)
                    </button>
                  </form>
                </>
              ) : (
                <>
                  <p className="successNote">Statement submitted and linked receipts marked as Statement Paid.</p>
                  {!selectedStatement.postedToBannerAt ? (
                    <form action={postAction} className="inlineEditForm" style={{ marginTop: "0.5rem" }}>
                      <input type="hidden" name="statementMonthId" value={selectedStatement.id} />
                      <button type="submit" className="buttonLink buttonPrimary">
                        Post To Banner (Move Pending CC To YTD)
                      </button>
                    </form>
                  ) : (
                    <p className="successNote">Posted to Banner: {selectedStatement.postedToBannerAt.slice(0, 10)}</p>
                  )}
                  {!selectedStatement.postedToBannerAt ? (
                    <form action={reopenAction} className="inlineEditForm" style={{ marginTop: "0.4rem" }}>
                      <input type="hidden" name="statementMonthId" value={selectedStatement.id} />
                      <button type="submit" className="tinyButton">
                        Reopen Statement Month
                      </button>
                    </form>
                  ) : (
                    <form action={unpostAction} className="inlineEditForm" style={{ marginTop: "0.4rem" }}>
                      <input type="hidden" name="statementMonthId" value={selectedStatement.id} />
                      <button type="submit" className="tinyButton dangerButton">
                        Unpost From Banner
                      </button>
                    </form>
                  )}
                </>
              )}
          </div>
        ) : null}
      </article>
      ) : null}

      {selectedView === "claims" ? (
        <ExpenseClaimsPanel
          claims={expenseClaims}
          page={expenseClaimPage}
          total={expenseClaimTotal}
          pageSize={expenseClaimPageSize}
          hrefForPage={expenseClaimHref}
          onCreate={() => setOpenDrawer("claim")}
        />
      ) : null}

      {selectedView === "exceptions" ? (
      <>
      <div className="ccExceptionSummary" aria-label="Credit card exception summary">
        <article><span>Missing Receipts</span><strong>{missingReceiptCount}</strong></article>
        <article><span>Unassigned Card</span><strong>{unassignedCardCount}</strong></article>
        <article><span>Other Exceptions</span><strong>{Math.max(exceptionRows.length - missingReceiptCount - unassignedCardCount, 0)}</strong></article>
        <article><span>Pending Total Lines</span><strong>{filteredPendingRows.length}</strong></article>
      </div>
      <article className="panel panelFull">
        <h2>Current Pending CC by Budget Code</h2>
        <p className="heroSubtitle">Live pending balances still waiting to be posted.</p>
        <form method="get" className="requestForm inlineFilterForm" style={{ marginTop: "0.6rem" }}>
          <input type="hidden" name="fiscalYearId" value={selectedFiscalYearId} />
          <input type="hidden" name="cc_view" value="exceptions" />
          <label>
            Project or Organization
            <select name="cc_pending_project" defaultValue={selectedPendingProject}>
              <option value="">All scopes</option>
              {Array.from(
                new Map(
                  filteredPendingRows.map((row) => [row.scopeId, row.scopeLabel])
                ).entries()
              ).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Card
            <select name="cc_pending_card" defaultValue={selectedPendingCard}>
              <option value="">All cards</option>
              {Array.from(new Set(filteredPendingRows.map((row) => row.creditCardName ?? "Unassigned"))).map((cardName) => (
                <option key={cardName} value={cardName}>
                  {cardName}
                </option>
              ))}
            </select>
          </label>
          <label>
            Search
            <input name="cc_pending_q" defaultValue={selectedPendingQuery} placeholder="Project or budget code" />
          </label>
          <button type="submit" className="tinyButton">
            Filter
          </button>
        </form>
      </article>

      <div className="tableWrap">
        <table>
          <thead>
            <tr>
              <th>Project / Organization</th>
              <th>Budget Code</th>
              <th>Card</th>
              <th>Pending CC Total</th>
            </tr>
          </thead>
          <tbody>
            {filteredPendingRows.length === 0 ? (
              <tr>
                <td colSpan={4}>No pending credit card balances.</td>
              </tr>
            ) : null}
            {filteredPendingRows.map((row, idx) => (
              <tr key={`${row.scopeId}-${row.budgetCode}-${row.creditCardName ?? "na"}-${idx}`}>
                <td>{row.scopeLabel}</td>
                <td>{row.budgetCode}</td>
                <td>{row.creditCardName ?? "Unassigned"}</td>
                <td>{formatCurrency(row.pendingCcTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <article className="panel panelFull" style={{ marginTop: "1rem" }}>
        <h2>Transactions Needing Attention</h2>
        <p className="heroSubtitle">
          Pending card transactions that are missing receipts, missing a card, or cannot enter the normal assignment flow.
        </p>
        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th>Project</th>
                <th>Budget Line</th>
                <th>Req/Ref #</th>
                <th>Title</th>
                <th>Type</th>
                <th>Card</th>
                <th>Pending CC</th>
                <th>Receipts</th>
                <th>Workflow</th>
                <th>Statement</th>
                <th>Where It Is</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {exceptionRows.length === 0 ? (
                <tr>
                  <td colSpan={12}>No credit card exceptions found.</td>
                </tr>
              ) : null}
              {exceptionRows.map((purchase) => (
                <tr key={purchase.id}>
                  <td>{purchase.projectLabel}</td>
                  <td>{purchase.budgetLineLabel}</td>
                  <td>{purchase.requestNumber ?? "-"}</td>
                  <td>{purchase.requestTitle}</td>
                  <td>{purchase.isCreditCard ? "CC Expense" : purchase.requestType}</td>
                  <td>{purchase.creditCardName ?? "Unassigned"}</td>
                  <td>{formatCurrency(purchase.pendingCcAmount)}</td>
                  <td>
                    {purchase.receiptCount} | {formatCurrency(purchase.receiptTotal)}
                  </td>
                  <td>{purchase.ccWorkflowStatus ?? "-"}</td>
                  <td>{purchase.statementMonthLabel ?? "-"}</td>
                  <td>{purchase.assignmentState}</td>
                  <td><button type="button" className="tinyButton" onClick={() => setActiveAttentionPurchase(purchase.id)}>Review &amp; Edit</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
      </>
      ) : null}

      {selectedView === "history" ? (
        <article className="panel panelFull">
          <div className="ccWorkspaceHeader">
            <div>
              <p className="eyebrow">Statement History</p>
              <h2>All Statement Months</h2>
              <p className="heroSubtitle">Filter, edit, reopen, or remove statement months without expanding their transaction detail.</p>
            </div>
            <button type="button" className="buttonLink" onClick={() => setOpenDrawer("statement")}>Open Statement Month</button>
          </div>
          <form method="get" className="requestForm inlineFilterForm" style={{ marginBottom: "0.6rem" }}>
            <input type="hidden" name="fiscalYearId" value={selectedFiscalYearId} />
            <input type="hidden" name="cc_view" value="history" />
            <label>
              Card
              <select name="cc_month_card" defaultValue={selectedMonthCard}>
                <option value="">All cards</option>
                {cards.map((card) => <option key={card.id} value={card.id}>{card.nickname}</option>)}
              </select>
            </label>
            <label>
              State
              <select name="cc_month_state" defaultValue={selectedMonthState}>
                <option value="">All states</option>
                <option value="open">Open</option>
                <option value="statement_paid">Statement Paid</option>
                <option value="posted_to_banner">Posted To Banner</option>
              </select>
            </label>
            <label>Search<input name="cc_month_q" defaultValue={selectedMonthQuery} placeholder="Card or month" /></label>
            <button type="submit" className="tinyButton">Filter</button>
          </form>
          <CcAdminTables cards={cards} statementMonths={filteredStatementMonths} section="months" />
        </article>
      ) : null}

      {selectedView === "setup" ? (
        <article className="panel panelFull">
          <div className="ccWorkspaceHeader">
            <div>
              <p className="eyebrow">Cards & Setup</p>
              <h2>Credit Card Setup</h2>
              <p className="heroSubtitle">Maintain card labels and availability. Statement-month creation is kept separate from card maintenance.</p>
            </div>
            <div className="buttonCluster">
              <button type="button" className="buttonLink buttonPrimary" onClick={() => setOpenDrawer("card")}>Add Credit Card</button>
              <button type="button" className="buttonLink" onClick={() => setOpenDrawer("statement")}>Open Statement Month</button>
            </div>
          </div>
          {scopedProjects.length === 0 && organizationOptions.length === 0 && !hasGlobalAdmin ? (
            <p className="errorNote">You need Admin or Project Manager access to manage statements.</p>
          ) : null}
          <CcAdminTables cards={cards} statementMonths={statementMonths} section="cards" />
        </article>
      ) : null}
    </>
  );
}
