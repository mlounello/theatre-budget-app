"use client";

import { useActionState, useMemo, useState } from "react";
import { SideDrawer } from "@/components/ui/side-drawer";
import {
  importBannerAccountReconciliationAction,
  type ActionState
} from "@/app/procurement/actions";
import { rowsFromBannerCsv, type CsvInvoiceRow } from "@/app/procurement/invoice-csv-import";
import { formatCurrency } from "@/lib/format";
import type { BannerImportDuplicate, BannerPoMatchCandidate } from "@/lib/db";

type ReviewRow = CsvInvoiceRow & {
  disposition: "keep" | "skip";
  purchaseId: string;
};

const initialState: ActionState = { ok: true, message: "", timestamp: 0 };

export function BannerAccountReconciliation({
  candidates,
  duplicates
}: {
  candidates: BannerPoMatchCandidate[];
  duplicates: BannerImportDuplicate[];
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [parseError, setParseError] = useState("");
  const [filter, setFilter] = useState<"all" | "review" | "duplicate" | "skipped">("review");
  const [state, action, pending] = useActionState(importBannerAccountReconciliationAction, initialState);
  const duplicateByKey = useMemo(() => new Map(duplicates.map((duplicate) => [duplicate.sourceLineKey, duplicate])), [duplicates]);

  const reviewedRows = useMemo(() => rows.map((row) => {
    const duplicate = duplicateByKey.get(row.sourceLineKey) ?? null;
    const expenseLine = /^(EX|EC)\d+/i.test(row.documentNumber);
    const options = candidates.filter((candidate) => candidate.accountCode.toUpperCase() === row.accountCode.toUpperCase());
    return { row, duplicate, expenseLine, options };
  }), [candidates, duplicateByKey, rows]);
  const duplicateCount = reviewedRows.filter((entry) => entry.duplicate).length;
  const expenseCount = reviewedRows.filter((entry) => entry.expenseLine && !entry.duplicate).length;
  const readyCount = reviewedRows.filter((entry) => !entry.duplicate && !entry.expenseLine && entry.row.disposition === "keep" && entry.row.purchaseId && entry.row.purchaseAllocationId).length;
  const needsReviewCount = reviewedRows.filter((entry) => !entry.duplicate && !entry.expenseLine && entry.row.disposition === "keep" && (!entry.row.purchaseId || !entry.row.purchaseAllocationId)).length;
  const visibleRows = reviewedRows.filter((entry) => {
    if (filter === "duplicate") return Boolean(entry.duplicate);
    if (filter === "skipped") return entry.row.disposition === "skip" || entry.expenseLine;
    if (filter === "review") return !entry.duplicate && !entry.expenseLine && entry.row.disposition === "keep" && (!entry.row.purchaseId || !entry.row.purchaseAllocationId);
    return true;
  });
  const importRows = reviewedRows
    .filter((entry) => !entry.duplicate && !entry.expenseLine && entry.row.disposition === "keep" && entry.row.purchaseId && entry.row.purchaseAllocationId)
    .map(({ row }) => row);

  async function loadFile(file: File | undefined): Promise<void> {
    if (!file) return;
    setParseError("");
    try {
      const parsed = rowsFromBannerCsv(await file.text());
      const nextRows: ReviewRow[] = parsed.map((row) => {
        const duplicate = duplicateByKey.has(row.sourceLineKey);
        const expenseLine = /^(EX|EC)\d+/i.test(row.documentNumber);
        const options = candidates.filter((candidate) => candidate.accountCode.toUpperCase() === row.accountCode.toUpperCase());
        const automatic = options.length === 1 ? options[0] : null;
        return {
          ...row,
          disposition: duplicate || expenseLine ? "skip" : "keep",
          purchaseId: automatic?.purchaseId ?? "",
          purchaseAllocationId: automatic?.purchaseAllocationId ?? ""
        };
      });
      setRows(nextRows);
      setFilter("review");
    } catch (error) {
      setRows([]);
      setParseError(error instanceof Error ? error.message : "The CSV could not be read.");
    }
  }

  function updateRow(sourceLineKey: string, patch: Partial<ReviewRow>): void {
    setRows((current) => current.map((row) => row.sourceLineKey === sourceLineKey ? { ...row, ...patch } : row));
  }

  function chooseCandidate(sourceLineKey: string, value: string): void {
    const candidate = candidates.find((option) => option.purchaseAllocationId === value);
    updateRow(sourceLineKey, {
      purchaseAllocationId: candidate?.purchaseAllocationId ?? "",
      purchaseId: candidate?.purchaseId ?? ""
    });
  }

  return (
    <>
      <button type="button" className="buttonLink" onClick={() => setOpen(true)}>Reconcile Banner CSV</button>
      {open ? (
        <SideDrawer
          open
          onClose={() => setOpen(false)}
          eyebrow="Account reconciliation"
          title="Match Banner Lines to POs"
          description="Upload a full Banner account-code detail export. Review every line, attach PO activity to an eligible matching-account PO, or skip it."
          closeLabel="Close Banner reconciliation"
        >
          <article className="panel bannerReconciliationUpload">
            <label className="invoiceCsvUpload">
              Banner account detail CSV
              <input type="file" accept=".csv,text/csv" onChange={(event) => void loadFile(event.target.files?.[0])} />
            </label>
            <p className="helperText">Only unpaid requisition POs with the same Banner account code are offered. Fully paid and cancelled POs never appear.</p>
            {parseError ? <p className="errorNote" role="alert">{parseError}</p> : null}
            {state.message ? <p className={state.ok ? "successNote" : "errorNote"} role="status">{state.message}</p> : null}
          </article>

          {rows.length > 0 ? (
            <>
              <div className="bannerReconciliationSummary">
                <button type="button" className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}><strong>{rows.length}</strong><span>All lines</span></button>
                <button type="button" className={filter === "review" ? "active" : ""} onClick={() => setFilter("review")}><strong>{needsReviewCount}</strong><span>Need PO</span></button>
                <button type="button" className={filter === "duplicate" ? "active" : ""} onClick={() => setFilter("duplicate")}><strong>{duplicateCount}</strong><span>Duplicates</span></button>
                <button type="button" className={filter === "skipped" ? "active" : ""} onClick={() => setFilter("skipped")}><strong>{reviewedRows.filter((entry) => entry.row.disposition === "skip" || entry.expenseLine).length}</strong><span>Skipped / Expenses</span></button>
              </div>

              <div className="bannerReconciliationRows">
                {visibleRows.length === 0 ? <div className="emptyStateCompact">No lines in this view.</div> : null}
                {visibleRows.map(({ row, duplicate, expenseLine, options }) => (
                  <article className={`bannerReconciliationRow${duplicate ? " isDuplicate" : ""}`} key={row.sourceLineKey}>
                    <header>
                      <span>
                        <strong>{row.documentNumber}</strong>
                        <small>{row.transactionDate} · Account {row.accountCode || "—"}</small>
                      </span>
                      <strong className={row.amount < 0 ? "creditAmount" : ""}>{formatCurrency(row.amount)}</strong>
                    </header>
                    <p>{row.description || "Banner transaction"}</p>
                    {duplicate ? (
                      <div className="bannerDuplicateNotice">
                        <span className="statusChip status-receipts_uploaded">Duplicate</span>
                        Already imported to {duplicate.poNumber ?? "PO"} · {duplicate.title}. This line will be skipped.
                      </div>
                    ) : expenseLine ? (
                      <div className="bannerExpenseNotice">
                        <span className="statusChip status-statement_paid">Expense</span>
                        {row.documentNumber} is handled through the Credit Cards expense workflow and is skipped here.
                      </div>
                    ) : (
                      <div className="bannerReconciliationControls">
                        <label>
                          Decision
                          <select value={row.disposition} onChange={(event) => updateRow(row.sourceLineKey, { disposition: event.target.value as "keep" | "skip" })}>
                            <option value="keep">Keep and attach to PO</option>
                            <option value="skip">Skip this line</option>
                          </select>
                        </label>
                        {row.disposition === "keep" ? (
                          <label>
                            Matching unpaid PO
                            <select value={row.purchaseAllocationId} onChange={(event) => chooseCandidate(row.sourceLineKey, event.target.value)}>
                              <option value="">{options.length === 0 ? `No unpaid PO for account ${row.accountCode}` : "Select PO"}</option>
                              {options.map((candidate) => (
                                <option key={candidate.purchaseAllocationId} value={candidate.purchaseAllocationId}>{candidate.label}</option>
                              ))}
                            </select>
                          </label>
                        ) : <span className="bannerSkippedLabel">This Banner line will not be imported.</span>}
                      </div>
                    )}
                  </article>
                ))}
              </div>

              <form action={action} className="bannerReconciliationFooter">
                <input type="hidden" name="rowsJson" value={JSON.stringify(importRows)} />
                <span><strong>{readyCount}</strong> ready to import · <strong>{needsReviewCount}</strong> still need a PO · <strong>{duplicateCount}</strong> duplicate{duplicateCount === 1 ? "" : "s"} · <strong>{expenseCount}</strong> expense line{expenseCount === 1 ? "" : "s"}</span>
                <button type="submit" className="buttonLink buttonPrimary" disabled={pending || importRows.length === 0 || needsReviewCount > 0}>
                  {pending ? "Importing…" : "Import reviewed lines"}
                </button>
              </form>
            </>
          ) : null}
        </SideDrawer>
      ) : null}
    </>
  );
}
