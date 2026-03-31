import {
  assignReceiptsToStatementAction,
  createReimbursementRequestAction,
  createCreditCardAction,
  postStatementMonthToBannerAction,
  reopenStatementMonthAction,
  submitStatementMonthAction,
  unpostStatementMonthFromBannerAction,
  unassignReceiptFromStatementAction
} from "@/app/cc/actions";
import { CcAdminTables } from "@/app/cc/cc-admin-tables";
import { CreateStatementMonthForm } from "@/app/cc/create-statement-month-form";
import { getAccountCodeOptions, getCcPendingRows, getProductionCategoryOptions, getSettingsProjects } from "@/lib/db";
import { formatCurrency } from "@/lib/format";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { getAccessContext } from "@/lib/access";
import { redirect } from "next/navigation";

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

export default async function CreditCardPage({
  searchParams
}: {
  searchParams?: Promise<{
    ok?: string;
    error?: string;
    cc_month_card?: string;
    cc_month_state?: string;
    cc_month_q?: string;
    cc_pending_project?: string;
    cc_pending_card?: string;
    cc_pending_q?: string;
  }>;
}) {
  const access = await getAccessContext();
  if (!access.userId) redirect("/login");
  if (!["admin", "project_manager"].includes(access.role)) redirect("/my-budget");

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const okMessage = resolvedSearchParams?.ok;
  const errorMessage = resolvedSearchParams?.error;

  const supabase = await getSupabaseServerClient();
  const [
    rows,
    projects,
    cardsResponse,
    monthsResponse,
    receiptsResponse,
    pendingPurchasesResponse,
    statementLinesResponse,
    accountCodeOptions,
    productionCategoryOptions
  ] = await Promise.all([
    getCcPendingRows(),
    getSettingsProjects(),
    supabase.from("credit_cards").select("id, nickname, masked_number, active").order("nickname", { ascending: true }),
    supabase
      .from("cc_statement_months")
      .select("id, credit_card_id, statement_month, posted_at, posted_to_banner_at, credit_cards(nickname)")
      .order("statement_month", { ascending: false }),
    supabase
      .from("purchase_receipts")
      .select(
        "id, purchase_id, amount_received, note, created_at, cc_statement_month_id, purchases!inner(id, title, reference_number, requisition_number, pending_cc_amount, cc_statement_month_id, credit_card_id, status, request_type, is_credit_card, projects(name, season), production_categories(name), project_budget_lines(budget_code))"
      )
      .order("created_at", { ascending: true }),
    supabase
      .from("purchases")
      .select(
        "id, title, reference_number, requisition_number, pending_cc_amount, status, request_type, is_credit_card, cc_workflow_status, cc_statement_month_id, credit_card_id, projects(name, season), production_categories(name), project_budget_lines(budget_code), credit_cards(nickname)"
      )
      .eq("status", "pending_cc")
      .order("created_at", { ascending: false }),
    supabase
      .from("cc_statement_lines")
      .select(
        "id, statement_month_id, amount, note, matched_purchase_ids, project_budget_lines(budget_code, production_categories(name), projects(name, season))"
      ),
    getAccountCodeOptions(),
    getProductionCategoryOptions()
  ]);

  if (cardsResponse.error) throw cardsResponse.error;
  if (monthsResponse.error) throw monthsResponse.error;
  if (receiptsResponse.error) throw receiptsResponse.error;
  if (pendingPurchasesResponse.error) throw pendingPurchasesResponse.error;
  if (statementLinesResponse.error) throw statementLinesResponse.error;
  const hasGlobalAdmin = access.role === "admin";
  const manageableProjectIds = access.manageableProjectIds;

  const manageableProjects = hasGlobalAdmin ? projects : projects.filter((project) => manageableProjectIds.has(project.id));

  const cards = (cardsResponse.data ?? []).map((row) => ({
    id: row.id as string,
    nickname: row.nickname as string,
    maskedNumber: (row.masked_number as string | null) ?? null,
    active: Boolean(row.active as boolean | null)
  }));

  const statementMonths: StatementMonthRow[] = (monthsResponse.data ?? []).map((row) => {
    const card = row.credit_cards as { nickname?: string } | null;
    return {
      id: row.id as string,
      creditCardId: row.credit_card_id as string,
      creditCardName: card?.nickname ?? "Unknown Card",
      statementMonth: row.statement_month as string,
      postedAt: (row.posted_at as string | null) ?? null,
      postedToBannerAt: (row.posted_to_banner_at as string | null) ?? null
    };
  });

  const selectedMonthCard = (resolvedSearchParams?.cc_month_card ?? "").trim();
  const selectedMonthState = (resolvedSearchParams?.cc_month_state ?? "").trim();
  const selectedMonthQuery = (resolvedSearchParams?.cc_month_q ?? "").trim().toLowerCase();

  const filteredStatementMonths = statementMonths.filter((month) => {
    if (selectedMonthCard && month.creditCardId !== selectedMonthCard) return false;
    if (selectedMonthState === "open" && month.postedAt) return false;
    if (selectedMonthState === "statement_paid" && (!month.postedAt || month.postedToBannerAt)) return false;
    if (selectedMonthState === "posted_to_banner" && !month.postedToBannerAt) return false;
    if (selectedMonthQuery) {
      const hay = `${month.creditCardName} ${month.statementMonth.slice(0, 7)} ${month.postedAt ? "statement paid" : "open"} ${
        month.postedToBannerAt ? "posted to banner" : ""
      }`.toLowerCase();
      if (!hay.includes(selectedMonthQuery)) return false;
    }
    return true;
  });

  const statementLineDetails: StatementLineDetailRow[] = (statementLinesResponse.data ?? []).map((row) => {
    const budgetLine = row.project_budget_lines as
      | {
          budget_code?: string;
          production_categories?: { name?: string } | null;
          projects?: { name?: string; season?: string | null } | null;
        }
      | null;
    const project = budgetLine?.projects;
    const productionCategory = budgetLine?.production_categories;
    return {
      id: row.id as string,
      statementMonthId: row.statement_month_id as string,
      amount: Number(row.amount ?? 0),
      note: (row.note as string | null) ?? null,
      matchedPurchaseIds: Array.isArray(row.matched_purchase_ids)
        ? row.matched_purchase_ids.map((value) => String(value ?? "").trim()).filter(Boolean)
        : [],
      projectLabel: `${project?.name ?? "Unknown Project"}${project?.season ? ` (${project.season})` : ""}`,
      budgetLineLabel: `${budgetLine?.budget_code ?? "-"} | ${productionCategory?.name ?? "-"}`
    };
  });

  const statementMonthIdByMatchedPurchaseId = new Map<string, string>();
  for (const row of statementLineDetails) {
    const statementMonthId = row.statementMonthId;
    if (!statementMonthId) continue;
    const matchedPurchaseIds = row.matchedPurchaseIds;
    for (const purchaseId of matchedPurchaseIds) {
      if (!statementMonthIdByMatchedPurchaseId.has(purchaseId)) {
        statementMonthIdByMatchedPurchaseId.set(purchaseId, statementMonthId);
      }
    }
  }

  const pendingReceipts: PendingReceiptRow[] = (receiptsResponse.data ?? []).map((row) => {
    const purchase = row.purchases as
      | {
          id?: string;
          title?: string;
          reference_number?: string | null;
          requisition_number?: string | null;
          pending_cc_amount?: number | string | null;
          cc_statement_month_id?: string | null;
          credit_card_id?: string | null;
          status?: string;
          request_type?: string;
          is_credit_card?: boolean | null;
          projects?: { name?: string; season?: string | null } | null;
          production_categories?: { name?: string } | null;
          project_budget_lines?: { budget_code?: string } | null;
        }
      | null;
    const project = purchase?.projects;
    const productionCategory = purchase?.production_categories;
    const budgetLine = purchase?.project_budget_lines;
    const reqOrRef = (purchase?.requisition_number as string | null) ?? (purchase?.reference_number as string | null) ?? null;
    const purchaseId = (row.purchase_id as string) ?? ((purchase?.id as string | undefined) ?? "");
    return {
      id: row.id as string,
      purchaseId,
      amount: Number(row.amount_received ?? 0),
      note: (row.note as string | null) ?? null,
      receiptDate: (row.created_at as string) ?? "",
      requestTitle: purchase?.title ?? "Request",
      requestNumber: reqOrRef,
      purchasePendingCcAmount: Number(purchase?.pending_cc_amount ?? 0),
      purchaseCreditCardId: (purchase?.credit_card_id as string | null) ?? null,
      purchaseStatus: (purchase?.status as string | undefined) ?? "",
      purchaseRequestType: (purchase?.request_type as string | undefined) ?? "",
      purchaseIsCreditCard: Boolean(purchase?.is_credit_card as boolean | null | undefined),
      statementMonthId:
        (row.cc_statement_month_id as string | null) ??
        ((purchase?.cc_statement_month_id as string | null | undefined) ?? statementMonthIdByMatchedPurchaseId.get(purchaseId) ?? null),
      projectLabel: `${project?.name ?? "Unknown Project"}${project?.season ? ` (${project.season})` : ""}`,
      budgetLineLabel: `${budgetLine?.budget_code ?? "-"} | ${productionCategory?.name ?? "-"}`
    };
  });

  const receiptTotalsByPurchaseId = new Map<string, { total: number; count: number }>();
  for (const receipt of pendingReceipts) {
    const current = receiptTotalsByPurchaseId.get(receipt.purchaseId) ?? { total: 0, count: 0 };
    receiptTotalsByPurchaseId.set(receipt.purchaseId, {
      total: current.total + receipt.amount,
      count: current.count + 1
    });
  }

  const statementMonthLabelById = new Map(
    statementMonths.map((month) => [month.id, `${month.statementMonth.slice(0, 7)} | ${month.creditCardName}`])
  );

  const pendingPurchaseDetails: PendingPurchaseDetailRow[] = (pendingPurchasesResponse.data ?? []).map((row) => {
    const project = row.projects as { name?: string; season?: string | null } | null;
    const productionCategory = row.production_categories as { name?: string } | null;
    const budgetLine = row.project_budget_lines as { budget_code?: string } | null;
    const card = row.credit_cards as { nickname?: string } | null;
    const purchaseId = row.id as string;
    const receiptSummary = receiptTotalsByPurchaseId.get(purchaseId) ?? { total: 0, count: 0 };
    const requestType = (row.request_type as string | null) ?? "";
    const isCreditCard = Boolean(row.is_credit_card as boolean | null);
    const statementMonthId =
      (row.cc_statement_month_id as string | null) ?? statementMonthIdByMatchedPurchaseId.get(purchaseId) ?? null;

    let assignmentState = "Ready to assign";
    if (!isCreditCard || requestType !== "expense") {
      assignmentState = "Excluded from receipt assignment flow";
    } else if (receiptSummary.count === 0) {
      assignmentState = "Missing receipts";
    } else if (statementMonthId) {
      assignmentState = "Already linked to statement month";
    } else if (!row.credit_card_id) {
      assignmentState = "Unassigned card";
    }

    return {
      id: purchaseId,
      projectLabel: `${project?.name ?? "Unknown Project"}${project?.season ? ` (${project.season})` : ""}`,
      budgetLineLabel: `${budgetLine?.budget_code ?? "-"} | ${productionCategory?.name ?? "-"}`,
      requestType: requestType || "-",
      isCreditCard,
      requestTitle: (row.title as string) ?? "Request",
      requestNumber: (row.requisition_number as string | null) ?? (row.reference_number as string | null) ?? null,
      pendingCcAmount: Number(row.pending_cc_amount ?? 0),
      receiptTotal: receiptSummary.total,
      receiptCount: receiptSummary.count,
      creditCardName: card?.nickname ?? null,
      ccWorkflowStatus: (row.cc_workflow_status as string | null) ?? null,
      statementMonthLabel: statementMonthId ? statementMonthLabelById.get(statementMonthId) ?? statementMonthId : null,
      assignmentState
    };
  });

  const projectNameById = new Map(
    projects.map((project) => [project.id, `${project.name}${project.season ? ` (${project.season})` : ""}`])
  );
  const selectedPendingProject = (resolvedSearchParams?.cc_pending_project ?? "").trim();
  const selectedPendingCard = (resolvedSearchParams?.cc_pending_card ?? "").trim();
  const selectedPendingQuery = (resolvedSearchParams?.cc_pending_q ?? "").trim().toLowerCase();
  const filteredPendingRows = rows
    .filter((row) => {
      if (selectedPendingProject && row.projectId !== selectedPendingProject) return false;
      if (selectedPendingCard && (row.creditCardName ?? "") !== selectedPendingCard) return false;
      if (!selectedPendingQuery) return true;
      const hay = `${projectNameById.get(row.projectId) ?? row.projectId} ${row.budgetCode} ${row.creditCardName ?? "Unassigned"}`.toLowerCase();
      return hay.includes(selectedPendingQuery);
    })
    .sort((a, b) => b.pendingCcTotal - a.pendingCcTotal);

  return (
    <section>
      <header className="sectionHeader">
        <p className="eyebrow">Credit Cards</p>
        <h1>Statement Reconciliation</h1>
        <p className="heroSubtitle">Create monthly statements, assign receipts, then submit statement paid.</p>
        {okMessage ? <p className="successNote">{okMessage}</p> : null}
        {errorMessage ? <p className="errorNote">{errorMessage}</p> : null}
      </header>

      <div className="panelGrid">
        <article className="panel">
          <h2>Credit Cards</h2>
          <form action={createCreditCardAction} className="requestForm">
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
            <form action={createReimbursementRequestAction} className="requestForm">
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
                            <form action={unassignReceiptFromStatementAction} className="inlineEditForm">
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
                  <form action={assignReceiptsToStatementAction} className="requestForm">
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

                  <form action={submitStatementMonthAction} className="inlineEditForm" style={{ marginTop: "0.6rem" }}>
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
                    <form action={postStatementMonthToBannerAction} className="inlineEditForm" style={{ marginTop: "0.5rem" }}>
                      <input type="hidden" name="statementMonthId" value={month.id} />
                      <button type="submit" className="buttonLink buttonPrimary">
                        Post To Banner (Move Pending CC To YTD)
                      </button>
                    </form>
                  ) : (
                    <p className="successNote">Posted to Banner: {month.postedToBannerAt.slice(0, 10)}</p>
                  )}
                  {!month.postedToBannerAt ? (
                    <form action={reopenStatementMonthAction} className="inlineEditForm" style={{ marginTop: "0.4rem" }}>
                      <input type="hidden" name="statementMonthId" value={month.id} />
                      <button type="submit" className="tinyButton">
                        Reopen Statement Month
                      </button>
                    </form>
                  ) : (
                    <form action={unpostStatementMonthFromBannerAction} className="inlineEditForm" style={{ marginTop: "0.4rem" }}>
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
              {Array.from(new Map(rows.map((row) => [row.projectId, projectNameById.get(row.projectId) ?? row.projectId])).entries()).map(
                ([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                )
              )}
            </select>
          </label>
          <label>
            Card
            <select name="cc_pending_card" defaultValue={selectedPendingCard}>
              <option value="">All cards</option>
              {Array.from(new Set(rows.map((row) => row.creditCardName ?? "Unassigned"))).map((cardName) => (
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
                <td>{projectNameById.get(row.projectId) ?? row.projectId}</td>
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
    </section>
  );
}
