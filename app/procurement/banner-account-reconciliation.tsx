"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { SideDrawer } from "@/components/ui/side-drawer";
import {
  finalizeBannerReconciliationAction,
  importBannerAccountReconciliationAction,
  type ActionState
} from "@/app/procurement/actions";
import { rowsFromBannerCsv, type CsvInvoiceRow } from "@/app/procurement/invoice-csv-import";
import {
  parseArgosEncControlCsv,
  parseArgosYtdControlCsv,
  parseBannerFinanceEncWorkbook,
  type ArgosEncControl,
  type ArgosYtdControl,
  type BannerFinanceEncReport
} from "@/lib/banner-reconciliation-files";
import { formatCurrency } from "@/lib/format";
import type { BannerImportDuplicate, BannerPoMatchCandidate, BannerReconciliationPeriod } from "@/lib/db";

type ReviewRow = CsvInvoiceRow & { disposition: "keep" | "skip"; purchaseId: string };
const initialState: ActionState = { ok: true, message: "", timestamp: 0 };
const centsEqual = (left: number, right: number) => Math.abs(left - right) <= 0.01;

export function BannerAccountReconciliation({ fiscalYearId, candidates, duplicates, periods }: {
  fiscalYearId: string;
  candidates: BannerPoMatchCandidate[];
  duplicates: BannerImportDuplicate[];
  periods: BannerReconciliationPeriod[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [ytdControl, setYtdControl] = useState<ArgosYtdControl | null>(null);
  const [encControl, setEncControl] = useState<ArgosEncControl | null>(null);
  const [encReport, setEncReport] = useState<BannerFinanceEncReport | null>(null);
  const [encAssignments, setEncAssignments] = useState<Record<string, string>>({});
  const [parseError, setParseError] = useState("");
  const [ytdImported, setYtdImported] = useState(false);
  const [importState, importAction, importPending] = useActionState(importBannerAccountReconciliationAction, initialState);
  const [finalState, finalAction, finalPending] = useActionState(finalizeBannerReconciliationAction, initialState);
  const duplicateByKey = useMemo(() => new Map(duplicates.map((item) => [item.sourceLineKey, item])), [duplicates]);

  const reviewedRows = useMemo(() => rows.map((row) => {
    const duplicate = duplicateByKey.get(row.sourceLineKey) ?? null;
    const expenseLine = /^(EX|EC)\d+/i.test(row.documentNumber);
    const options = candidates.filter((candidate) => candidate.accountCode.toUpperCase() === row.accountCode.toUpperCase());
    return { row, duplicate, expenseLine, options };
  }), [candidates, duplicateByKey, rows]);
  const documentGroups = useMemo(() => {
    const groups = new Map<string, typeof reviewedRows>();
    for (const entry of reviewedRows) groups.set(entry.row.documentNumber, [...(groups.get(entry.row.documentNumber) ?? []), entry]);
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [reviewedRows]);
  const duplicateCount = reviewedRows.filter((entry) => entry.duplicate).length;
  const expenseCount = reviewedRows.filter((entry) => entry.expenseLine && !entry.duplicate).length;
  const readyCount = reviewedRows.filter((entry) => !entry.duplicate && !entry.expenseLine && entry.row.disposition === "keep" && entry.row.purchaseId && entry.row.purchaseAllocationId).length;
  const needsReviewCount = reviewedRows.filter((entry) => !entry.duplicate && !entry.expenseLine && entry.row.disposition === "keep" && (!entry.row.purchaseId || !entry.row.purchaseAllocationId)).length;
  const importRows = reviewedRows.filter((entry) => !entry.duplicate && !entry.expenseLine && entry.row.disposition === "keep" && entry.row.purchaseId && entry.row.purchaseAllocationId).map(({ row }) => row);
  const candidateByAllocation = useMemo(() => new Map(candidates.map((candidate) => [candidate.purchaseAllocationId, candidate])), [candidates]);
  const duplicatePurchasesByDocument = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const duplicate of duplicates) {
      const key = duplicate.documentNumber.toUpperCase();
      const current = map.get(key) ?? new Set<string>();
      current.add(duplicate.purchaseId);
      map.set(key, current);
    }
    return map;
  }, [duplicates]);
  const encOptions = useMemo(() => candidates.filter((candidate) => candidate.accountCode === encReport?.accountCode), [candidates, encReport]);
  const unresolvedEncDocuments = useMemo(() => (encReport?.documents ?? []).filter((document) => Math.abs(document.amount) > 0.001 && !encAssignments[document.documentNumber]), [encAssignments, encReport]);
  const expectedEncByAllocation = useMemo(() => {
    const totals = new Map<string, number>();
    for (const document of encReport?.documents ?? []) {
      const allocationId = encAssignments[document.documentNumber];
      if (!allocationId) continue;
      totals.set(allocationId, Math.round(((totals.get(allocationId) ?? 0) + document.amount) * 100) / 100);
    }
    return [...totals.entries()].flatMap(([allocationId, expected]) => {
      const candidate = candidateByAllocation.get(allocationId);
      return candidate ? [{ candidate, expected }] : [];
    });
  }, [candidateByAllocation, encAssignments, encReport]);

  useEffect(() => {
    if (importState.ok && importState.timestamp) setYtdImported(true);
  }, [importState]);
  useEffect(() => {
    if (finalState.ok && finalState.timestamp) router.refresh();
  }, [finalState, router]);

  function candidateForValue(value: string) {
    return candidates.find((option) => option.purchaseAllocationId === value);
  }
  function chooseCandidate(sourceLineKey: string, value: string) {
    const candidate = candidateForValue(value);
    setRows((current) => current.map((row) => row.sourceLineKey === sourceLineKey ? { ...row, purchaseAllocationId: candidate?.purchaseAllocationId ?? "", purchaseId: candidate?.purchaseId ?? "" } : row));
    setYtdImported(false);
  }
  function assignDocument(documentNumber: string, value: string) {
    const candidate = candidateForValue(value);
    setRows((current) => current.map((row) => row.documentNumber === documentNumber ? { ...row, purchaseAllocationId: candidate?.purchaseAllocationId ?? "", purchaseId: candidate?.purchaseId ?? "" } : row));
    setYtdImported(false);
  }

  async function loadYtdFile(file: File | undefined) {
    if (!file) return;
    setParseError("");
    setYtdImported(false);
    try {
      const text = await file.text();
      const control = parseArgosYtdControlCsv(text);
      const parsed = rowsFromBannerCsv(text);
      const nextRows: ReviewRow[] = parsed.map((row) => {
        const duplicate = duplicateByKey.has(row.sourceLineKey);
        const expenseLine = /^(EX|EC)\d+/i.test(row.documentNumber);
        const options = candidates.filter((candidate) => candidate.accountCode.toUpperCase() === row.accountCode.toUpperCase());
        const mappedPurchases = duplicatePurchasesByDocument.get(row.documentNumber) ?? new Set<string>();
        const mappedOptions = options.filter((option) => mappedPurchases.has(option.purchaseId));
        const automatic = mappedOptions.length === 1 ? mappedOptions[0] : options.length === 1 ? options[0] : null;
        return { ...row, disposition: duplicate || expenseLine ? "skip" : "keep", purchaseId: automatic?.purchaseId ?? "", purchaseAllocationId: automatic?.purchaseAllocationId ?? "" };
      });
      setYtdControl(control);
      setRows(nextRows);
      setYtdImported(nextRows.every((row) => duplicateByKey.has(row.sourceLineKey) || /^(EX|EC)\d+/i.test(row.documentNumber)));
    } catch (error) {
      setRows([]);
      setYtdControl(null);
      setParseError(error instanceof Error ? error.message : "The YTD CSV could not be read.");
    }
  }
  async function loadEncControlFile(file: File | undefined) {
    if (!file) return;
    setParseError("");
    try { setEncControl(parseArgosEncControlCsv(await file.text())); }
    catch (error) { setEncControl(null); setParseError(error instanceof Error ? error.message : "The ENC control CSV could not be read."); }
  }
  async function loadEncDetailFile(file: File | undefined) {
    if (!file) return;
    setParseError("");
    try {
      const report = parseBannerFinanceEncWorkbook(await file.arrayBuffer());
      const assignments: Record<string, string> = {};
      for (const document of report.documents) {
        if (Math.abs(document.amount) <= 0.001) continue;
        const exactPo = candidates.filter((candidate) => candidate.accountCode === report.accountCode && candidate.poNumber.toUpperCase() === document.documentNumber);
        if (exactPo.length === 1) { assignments[document.documentNumber] = exactPo[0].purchaseAllocationId; continue; }
        const purchaseIds = duplicatePurchasesByDocument.get(document.documentNumber) ?? new Set<string>();
        const mapped = candidates.filter((candidate) => candidate.accountCode === report.accountCode && purchaseIds.has(candidate.purchaseId));
        if (mapped.length === 1) assignments[document.documentNumber] = mapped[0].purchaseAllocationId;
      }
      setEncReport(report);
      setEncAssignments(assignments);
    } catch (error) {
      setEncReport(null);
      setEncAssignments({});
      setParseError(error instanceof Error ? error.message : "The Banner Finance ENC workbook could not be read.");
    }
  }

  const scopesMatch = Boolean(ytdControl && encControl && encReport && ytdControl.fiscalYear === encReport.fiscalYear && ytdControl.accountCode === encControl.accountCode && ytdControl.accountCode === encReport.accountCode && ytdControl.organizationCode === encReport.organizationCode);
  const encControlsMatch = Boolean(encControl && encReport && centsEqual(encControl.total, encReport.total) && (encReport.reportedTotal === null || centsEqual(encReport.total, encReport.reportedTotal)));
  const canFinalize = Boolean(ytdImported && scopesMatch && encControlsMatch && unresolvedEncDocuments.length === 0 && needsReviewCount === 0);

  return <>
    <button type="button" className="buttonLink" onClick={() => setOpen(true)}>Reconcile Banner</button>
    {open ? <SideDrawer open onClose={() => setOpen(false)} eyebrow="Account reconciliation" title="Banner Month End Reconciliation" description="Import Argos YTD, validate the Banner Finance ENC detail, compare the Argos ENC control, and save a dated reconciliation only when every balance agrees." closeLabel="Close Banner reconciliation"><div className="bannerReconciliationWorkflow">
      <form action={finalAction} className="bannerReconciliationFiles">
        <input type="hidden" name="fiscalYearId" value={fiscalYearId} />
        <article className="panel bannerStepFiles">
          <h3>1. Load the three month-end files</h3>
          <div className="bannerFileGrid">
            <label className="invoiceCsvUpload">Evisions Argos YTD CSV<input name="ytdFile" type="file" accept=".csv,text/csv" onChange={(event) => void loadYtdFile(event.target.files?.[0])} required /><small>{ytdControl ? `${ytdControl.rowCount} lines · ${ytdControl.organizationCode} ${ytdControl.accountCode} · ${formatCurrency(ytdControl.total)}` : "Imports YTD transaction detail."}</small></label>
            <label className="invoiceCsvUpload">Evisions Argos ENC control CSV<input name="encControlFile" type="file" accept=".csv,text/csv" onChange={(event) => void loadEncControlFile(event.target.files?.[0])} required /><small>{encControl ? `${encControl.accountCode} control · ${formatCurrency(encControl.total)}` : "Supplies the independent ending ENC total."}</small></label>
            <label className="invoiceCsvUpload">Banner Finance ENC detail<input name="encDetailFile" type="file" accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => void loadEncDetailFile(event.target.files?.[0])} required /><small>{encReport ? `${encReport.rows.length} lines · ${encReport.documents.length} documents · ${formatCurrency(encReport.total)} · as of ${encReport.asOfDate}` : "Accepts the Banner Finance XLS or XLSX export."}</small></label>
          </div>
          {parseError ? <p className="errorNote" role="alert">{parseError}</p> : null}
          {!scopesMatch && ytdControl && encControl && encReport ? <p className="errorNote">The files do not describe the same organization and Banner account.</p> : null}
          {!encControlsMatch && encControl && encReport ? <p className="errorNote">Banner Finance ENC {formatCurrency(encReport.total)} does not match the Argos ENC control {formatCurrency(encControl.total)}.</p> : null}
        </article>
        {encReport ? <article className="panel bannerStepEnc">
          <div className="invoiceTransactionEntryHeader"><div><h3>3. Verify encumbrance documents</h3><p className="helperText">PO documents map automatically by PO number. Invoice and credit documents reuse the PO chosen in the YTD import. Resolve only the remaining exceptions.</p></div><span className={unresolvedEncDocuments.length === 0 ? "statusChip status-paid" : "statusChip status-needs_attention"}>{unresolvedEncDocuments.length} Unresolved ENC documents</span></div>
          <div className="bannerEncDocuments">{encReport.documents.filter((document) => Math.abs(document.amount) > 0.001).map((document) => <div className="bannerEncDocument" key={document.documentNumber}><span><strong>{document.documentNumber}</strong><small>{document.lineCount} line{document.lineCount === 1 ? "" : "s"} · {document.ruleClassCodes.join(", ") || "No rule class"}</small></span><strong className={document.amount < 0 ? "creditAmount" : ""}>{formatCurrency(document.amount)}</strong><select aria-label={`PO for ENC document ${document.documentNumber}`} value={encAssignments[document.documentNumber] ?? ""} onChange={(event) => setEncAssignments((current) => ({ ...current, [document.documentNumber]: event.target.value }))}><option value="">Select matching PO</option>{encOptions.map((candidate) => <option key={candidate.purchaseAllocationId} value={candidate.purchaseAllocationId}>{candidate.label}</option>)}</select></div>)}</div>
          {expectedEncByAllocation.length > 0 ? <div className="bannerEncComparison"><strong>ENC by PO</strong>{expectedEncByAllocation.map(({ candidate, expected }) => <span key={candidate.purchaseAllocationId} className={centsEqual(candidate.encumberedAmount, expected) ? "isMatch" : "isMismatch"}>{candidate.poNumber}: Banner {formatCurrency(expected)} · App {formatCurrency(candidate.encumberedAmount)}</span>)}</div> : null}
        </article> : null}
        <article className="panel bannerFinalizePanel bannerStepFinalize"><h3>4. Save the reconciled period</h3><p className="helperText">The server rechecks the complete account, including card expenses, before it saves. A period cannot close with a YTD or ENC difference.</p>{finalState.message ? <p className={finalState.ok ? "successNote" : "errorNote"} role="status">{finalState.message}</p> : null}<button type="submit" className="buttonLink buttonPrimary" disabled={finalPending || !canFinalize}>{finalPending ? "Checking totals…" : "Save reconciled period"}</button>{!canFinalize ? <small>Load matching files, import the reviewed YTD lines, and resolve every non-zero ENC document first.</small> : null}</article>
      </form>
      {rows.length > 0 ? <article className="panel bannerYtdReview bannerStepYtd">
        <div className="invoiceTransactionEntryHeader"><div><h3>2. Match YTD documents to POs</h3><p className="helperText">Choose a PO once for the entire document. Expand a document only when individual lines truly need different allocations.</p></div><span>{readyCount} ready · {needsReviewCount} need PO · {duplicateCount} duplicates · {expenseCount} expenses</span></div>
        <div className="bannerDocumentGroups">{documentGroups.map(([documentNumber, entries]) => {
          const active = entries.filter((entry) => !entry.duplicate && !entry.expenseLine && entry.row.disposition === "keep");
          const options = entries[0]?.options ?? [];
          const assignments = new Set(active.map((entry) => entry.row.purchaseAllocationId).filter(Boolean));
          const selected = assignments.size === 1 ? [...assignments][0] : "";
          const total = entries.reduce((sum, entry) => sum + entry.row.amount, 0);
          return <details className="bannerDocumentGroup" key={documentNumber}><summary><span><strong>{documentNumber}</strong><small>{entries.length} line{entries.length === 1 ? "" : "s"} · Account {entries[0]?.row.accountCode || "—"}</small></span><strong className={total < 0 ? "creditAmount" : ""}>{formatCurrency(total)}</strong>{active.length === 0 ? <span className="statusChip status-statement_paid">Already handled</span> : <label onClick={(event) => event.stopPropagation()}>Assign entire document<select value={selected} onChange={(event) => assignDocument(documentNumber, event.target.value)}><option value="">Select PO</option>{options.map((candidate) => <option key={candidate.purchaseAllocationId} value={candidate.purchaseAllocationId}>{candidate.label}</option>)}</select></label>}</summary><div className="bannerDocumentLines">{entries.map(({ row, duplicate, expenseLine, options: lineOptions }) => <div className="bannerDocumentLine" key={row.sourceLineKey}><span>{row.transactionDate}<small>{row.description || "Banner transaction"} · {row.ruleClassCode || "No rule class"}</small></span><strong className={row.amount < 0 ? "creditAmount" : ""}>{formatCurrency(row.amount)}</strong>{duplicate ? <span>Duplicate · {duplicate.poNumber ?? "PO"}</span> : expenseLine ? <span>Credit Cards workflow</span> : <select aria-label={`PO for ${row.documentNumber} ${row.description}`} value={row.purchaseAllocationId} onChange={(event) => chooseCandidate(row.sourceLineKey, event.target.value)}><option value="">Select PO</option>{lineOptions.map((candidate) => <option key={candidate.purchaseAllocationId} value={candidate.purchaseAllocationId}>{candidate.label}</option>)}</select>}</div>)}</div></details>;
        })}</div>
        <form action={importAction} className="bannerReconciliationFooter"><input type="hidden" name="rowsJson" value={JSON.stringify(importRows)} /><span><strong>{readyCount}</strong> ready · <strong>{needsReviewCount}</strong> still need a PO</span><button type="submit" className="buttonLink buttonPrimary" disabled={importPending || importRows.length === 0 || needsReviewCount > 0}>{importPending ? "Importing…" : "Import reviewed YTD lines"}</button></form>
        {importState.message ? <p className={importState.ok ? "successNote" : "errorNote"} role="status">{importState.message}</p> : null}{ytdImported ? <p className="successNote">YTD import is ready for the final server comparison.</p> : null}
      </article> : null}
      {periods.length > 0 ? <article className="panel bannerStepHistory"><h3>Recent reconciled periods</h3><div className="bannerPeriodHistory">{periods.slice(0, 12).map((period) => <span key={period.id}><strong>{period.organizationCode} {period.accountCode}</strong><small>{period.asOfDate} · YTD {formatCurrency(period.appYtdTotal)} · ENC {formatCurrency(period.appEncTotal)}</small><span className="statusChip status-paid">Reconciled</span></span>)}</div></article> : null}
    </div></SideDrawer> : null}
  </>;
}
