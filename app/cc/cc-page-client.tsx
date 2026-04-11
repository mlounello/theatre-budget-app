"use client";

import { useActionState } from "react";
import {
  assignReceiptsToStatementAction,
  createCreditCardAction,
  createReimbursementRequestAction,
  postStatementMonthToBannerAction,
  reopenStatementMonthAction,
  submitStatementMonthAction,
  unpostStatementMonthFromBannerAction,
  unassignReceiptFromStatementAction,
  type ActionState
} from "@/app/cc/actions";
import { CcAdminTables } from "@/app/cc/cc-admin-tables";
import { CreateStatementMonthForm } from "@/app/cc/create-statement-month-form";
import { formatCurrency } from "@/lib/format";

type StatementMonthRow = {
  id: string;
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

type PendingCcRow = { projectId: string; budgetCode: string; creditCardName: string | null; pendingCcTotal: number };

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
  projectNameById: Array<[string, string]>;
  manageableProjects: ProjectRow[];
  hasGlobalAdmin: boolean;
  accountCodeOptions: AccountCodeOption[];
  productionCategoryOptions: ProductionCategoryOption[];
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
  projectNameById,
  manageableProjects,
  hasGlobalAdmin,
  accountCodeOptions,
  productionCategoryOptions
}: Props) {
  const [createCardState, createCardAction] = useActionState(createCreditCardAction, initialState);
  const [reimbursementState, reimbursementAction] = useActionState(createReimbursementRequestAction, initialState);
  const [assignState, assignAction] = useActionState(assignReceiptsToStatementAction, initialState);
  const [unassignState, unassignAction] = useActionState(unassignReceiptFromStatementAction, initialState);
  const [submitState, submitAction] = useActionState(submitStatementMonthAction, initialState);
  const [postState, postAction] = useActionState(postStatementMonthToBannerAction, initialState);
  const [reopenState, reopenAction] = useActionState(reopenStatementMonthAction, initialState);
  const [unpostState, unpostAction] = useActionState(unpostStatementMonthFromBannerAction, initialState);

  const projectNameMap = new Map(projectNameById);

  return (
    <>
      <div className="panelGrid">
        <article className="panel">
          <h2>Credit Cards</h2>
          <form action={createCardAction} className="requestForm">
            {createCardState.message ? (
              <p className={createCardState.ok ? "successNote" : "errorNote"} key={createCardState.timestamp}>
                {createCardState.message}
              </p>
            ) : null}
            <label>
              Card Nickname
              <input name="nickname" required placeholder="Theatre Card A" />
            </label>
            <label>
              Masked Number
              <input name="maskedNumber" placeholder="****1234" />
            </label>
            <label className="checkboxLabel">
              <input name="active" type="checkbox" defaultChecked />
              Active
            </label>
            <button type="submit" className="buttonLink buttonPrimary">
              Save Card
            </button>
          </form>

          <CcAdminTables cards={cards} statementMonths={statementMonths} />
        </article>

        <article className="panel">
          <h2>Open Statement Month</h2>
          <CreateStatementMonthForm cards={cards} />
          {manageableProjects.length === 0 && !hasGlobalAdmin ? (
            <p className="errorNote">You need Admin or Project Manager access to manage statements.</p>
          ) : null}
        </article>

        {manageableProjects.length > 0 || hasGlobalAdmin ? (
          <article className="panel">
            <h2>Add Reimbursement</h2>
            <form action={reimbursementAction} className="requestForm">
              {reimbursementState.message ? (
                <p className={reimbursementState.ok ? "successNote" : "errorNote"} key={reimbursementState.timestamp}>
                  {reimbursementState.message}
                </p>
              ) : null}
              <label>
                Project
                <select name="projectId" required>
                  <option value="">Select project</option>
                  {manageableProjects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                      {project.season ? ` (${project.season})` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Department
                <select name="productionCategoryId" required>
                  <option value="">Select department</option>
                  {productionCategoryOptions.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Banner Code
                <select name="bannerAccountCodeId" defaultValue="">
                  <option value="">Unassigned</option>
                  {accountCodeOptions.map((accountCode) => (
                    <option key={accountCode.id} value={accountCode.id}>
                      {accountCode.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Title
                <input name="title" required placeholder="Reimbursement request title" />
              </label>
              <label>
                Reference (optional)
                <input name="referenceNumber" placeholder="Receipt / claim reference" />
              </label>
              <label>
                Amount
                <input name="amount" type="number" step="0.01" required />
              </label>
              <button type="submit" className="buttonLink buttonPrimary">
                Save Reimbursement
              </button>
            </form>
          </article>
        ) : null}
      </div>

      <article className="panel panelFull">
        <h2>Statement Months</h2>
        <p className="heroSubtitle">
          Use the bulk table above to edit/delete statement months. Expand a month below to assign receipts, mark statement paid, then
          post to Banner.
        </p>
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

        <form method="get" className="requestForm inlineFilterForm" style={{ marginBottom: "0.6rem" }}>
          <label>
            Card
            <select name="cc_month_card" defaultValue={selectedMonthCard}>
              <option value="">All cards</option>
              {cards.map((card) => (
                <option key={card.id} value={card.id}>
                  {card.nickname}
                </option>
              ))}
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
          <label>
            Search
            <input name="cc_month_q" defaultValue={selectedMonthQuery} placeholder="Card or month" />
          </label>
          <button type="submit" className="tinyButton">
            Filter
          </button>
        </form>
        {filteredStatementMonths.length === 0 ? <p>No statement months match the current filter.</p> : null}

        {filteredStatementMonths.map((month) => {
          const assignedReceipts = pendingReceipts.filter((receipt) => receipt.statementMonthId === month.id);
          const statementLineRows = statementLineDetails.filter((line) => line.statementMonthId === month.id);
          const visibleRows =
            assignedReceipts.length > 0
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
              : statementLineRows.map((line) => ({
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
              (receipt.purchaseCreditCardId === month.creditCardId || receipt.purchaseCreditCardId === null)
          );
          const assignedTotal = assignedReceipts.reduce((sum, receipt) => sum + receipt.amount, 0);
          return (
            <details key={month.id} className="treeNode" open>
              <summary>
                <strong>{month.statementMonth.slice(0, 7)}</strong> | {month.creditCardName} |{" "}
                {month.postedToBannerAt ? "Posted To Banner" : month.postedAt ? "Statement Paid" : "Open"}
              </summary>

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
                    {visibleRows.length === 0 ? (
                      <tr>
                        <td colSpan={7}>No receipts or statement lines assigned to this statement month.</td>
                      </tr>
                    ) : null}
                    {visibleRows.map((row) => (
                      <tr key={row.id}>
                        <td>{row.projectLabel}</td>
                        <td>{row.budgetLineLabel}</td>
                        <td>{row.requestNumber ?? "-"}</td>
                        <td>{row.requestTitle}</td>
                        <td>{row.sourceLabel}</td>
                        <td>{formatCurrency(row.amount)}</td>
                        <td>
                          {!month.postedAt && row.canRemove && row.receiptId ? (
                            <form action={unassignAction} className="inlineEditForm">
                              <input type="hidden" name="statementMonthId" value={month.id} />
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

              {!month.postedAt ? (
                <>
                  <form action={assignAction} className="requestForm">
                    <input type="hidden" name="statementMonthId" value={month.id} />
                    <div className="checkboxStack">
                      {unassignedCandidates.map((receipt) => (
                        <label key={receipt.id} className="checkboxLabel">
                          <input type="checkbox" name="receiptId" value={receipt.id} />
                          {receipt.projectLabel} | {receipt.budgetLineLabel} | {receipt.requestNumber ?? receipt.id.slice(0, 8)} |{" "}
                          {receipt.requestTitle} | {formatCurrency(receipt.amount)}
                        </label>
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
                    <input type="hidden" name="statementMonthId" value={month.id} />
                    <button type="submit" className="buttonLink buttonPrimary">
                      Submit Statement (Mark Statement Paid)
                    </button>
                  </form>
                </>
              ) : (
                <>
                  <p className="successNote">Statement submitted and linked receipts marked as Statement Paid.</p>
                  {!month.postedToBannerAt ? (
                    <form action={postAction} className="inlineEditForm" style={{ marginTop: "0.5rem" }}>
                      <input type="hidden" name="statementMonthId" value={month.id} />
                      <button type="submit" className="buttonLink buttonPrimary">
                        Post To Banner (Move Pending CC To YTD)
                      </button>
                    </form>
                  ) : (
                    <p className="successNote">Posted to Banner: {month.postedToBannerAt.slice(0, 10)}</p>
                  )}
                  {!month.postedToBannerAt ? (
                    <form action={reopenAction} className="inlineEditForm" style={{ marginTop: "0.4rem" }}>
                      <input type="hidden" name="statementMonthId" value={month.id} />
                      <button type="submit" className="tinyButton">
                        Reopen Statement Month
                      </button>
                    </form>
                  ) : (
                    <form action={unpostAction} className="inlineEditForm" style={{ marginTop: "0.4rem" }}>
                      <input type="hidden" name="statementMonthId" value={month.id} />
                      <button type="submit" className="tinyButton dangerButton">
                        Unpost From Banner
                      </button>
                    </form>
                  )}
                </>
              )}
            </details>
          );
        })}
      </article>

      <article className="panel panelFull">
        <h2>Current Pending CC by Budget Code</h2>
        <p className="heroSubtitle">Live pending balances still waiting to be posted.</p>
        <form method="get" className="requestForm inlineFilterForm" style={{ marginTop: "0.6rem" }}>
          <label>
            Project
            <select name="cc_pending_project" defaultValue={selectedPendingProject}>
              <option value="">All projects</option>
              {Array.from(
                new Map(
                  filteredPendingRows.map((row) => [row.projectId, projectNameMap.get(row.projectId) ?? row.projectId])
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
              <th>Project</th>
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
              <tr key={`${row.projectId}-${row.budgetCode}-${row.creditCardName ?? "na"}-${idx}`}>
                <td>{projectNameMap.get(row.projectId) ?? row.projectId}</td>
                <td>{row.budgetCode}</td>
                <td>{row.creditCardName ?? "Unassigned"}</td>
                <td>{formatCurrency(row.pendingCcTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <article className="panel panelFull" style={{ marginTop: "1rem" }}>
        <h2>Pending CC Purchase Detail</h2>
        <p className="heroSubtitle">
          Raw pending purchase rows behind the budget-line rollups, including whether each row has receipts and a statement link.
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
              </tr>
            </thead>
            <tbody>
              {pendingPurchaseDetails.length === 0 ? (
                <tr>
                  <td colSpan={11}>No pending CC purchases found.</td>
                </tr>
              ) : null}
              {pendingPurchaseDetails.map((purchase) => (
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </>
  );
}
