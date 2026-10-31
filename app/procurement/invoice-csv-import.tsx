"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import {
  importPurchaseInvoiceTransactionsAction,
  type ActionState
} from "@/app/procurement/actions";
import { formatCurrency } from "@/lib/format";

type AllocationChoice = {
  id: string;
  label: string;
  accountCode: string | null;
};

type CsvInvoiceRow = {
  sourceLineKey: string;
  documentNumber: string;
  transactionDate: string;
  description: string;
  amount: number;
  accountCode: string;
  purchaseAllocationId: string;
};

const initialState: ActionState = { ok: true, message: "", timestamp: 0 };

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        value += character;
      }
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === ",") {
      row.push(value);
      value = "";
    } else if (character === "\n") {
      row.push(value.replace(/\r$/, ""));
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
      value = "";
    } else value += character;
  }
  row.push(value.replace(/\r$/, ""));
  if (row.some((cell) => cell.trim())) rows.push(row);
  return rows;
}

function bannerDate(value: string): string | null {
  const trimmed = value.trim();
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const us = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!us) return null;
  return `${us[3]}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`;
}

function normalizeKeyPart(value: string): string {
  return value.trim().replaceAll("|", "/").replace(/\s+/g, " ").toUpperCase();
}

function rowsFromBannerCsv(text: string, allocations: AllocationChoice[]): CsvInvoiceRow[] {
  const parsed = parseCsv(text);
  if (parsed.length < 2) throw new Error("The CSV does not contain any transaction lines.");
  const headers = parsed[0].map((header) => header.trim().toUpperCase().replace(/^\uFEFF/, ""));
  const column = (name: string): number => headers.indexOf(name);
  const required = ["DOC_CODE", "TRANS_DATE", "TRANS_AMT"];
  if (required.some((name) => column(name) < 0)) {
    throw new Error("This does not look like a Banner detail CSV. DOC_CODE, TRANS_DATE, and TRANS_AMT are required.");
  }

  const occurrences = new Map<string, number>();
  const rows: CsvInvoiceRow[] = [];
  for (const cells of parsed.slice(1)) {
    const get = (name: string): string => cells[column(name)]?.trim() ?? "";
    const documentNumber = get("DOC_CODE").toUpperCase();
    const transactionDate = bannerDate(get("TRANS_DATE"));
    const rawAmount = Number.parseFloat(get("TRANS_AMT").replaceAll(",", "").replaceAll("$", ""));
    if (!documentNumber || !transactionDate || !Number.isFinite(rawAmount) || rawAmount === 0) continue;
    const amount = get("DR_CR_IND") === "-" ? -Math.abs(rawAmount) : rawAmount;
    const accountCode = get("ACCT_CODE").toUpperCase();
    const matchingAllocations = allocations.filter((allocation) => allocation.accountCode?.toUpperCase() === accountCode);
    const purchaseAllocationId = allocations.length === 1
      ? allocations[0].id
      : matchingAllocations.length === 1
        ? matchingAllocations[0].id
        : "";
    const canonical = [
      get("FISCAL_YEAR"), get("ORGN_CODE"), get("FUND_CODE"), accountCode, get("PROG_CODE"),
      documentNumber, get("TRANS_DATE"), get("ACTIVITY_DATE"), get("RUCL_CODE"),
      String(Math.round(amount * 100) / 100), get("DR_CR_IND"), get("TRANS_DESC")
    ].map(normalizeKeyPart).join("|");
    const occurrence = (occurrences.get(canonical) ?? 0) + 1;
    occurrences.set(canonical, occurrence);
    rows.push({
      sourceLineKey: `banner|${canonical}|${occurrence}`,
      documentNumber,
      transactionDate,
      description: get("TRANS_DESC"),
      amount: Math.round(amount * 100) / 100,
      accountCode,
      purchaseAllocationId
    });
  }
  if (rows.length === 0) throw new Error("No non-zero Banner transaction lines were found in this CSV.");
  return rows;
}

export function InvoiceCsvImport({
  purchaseId,
  allocations
}: {
  purchaseId: string;
  allocations: AllocationChoice[];
}) {
  const [rows, setRows] = useState<CsvInvoiceRow[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [parseError, setParseError] = useState("");
  const [state, action, pending] = useActionState(importPurchaseInvoiceTransactionsAction, initialState);

  const groups = useMemo(() => {
    const result = new Map<string, CsvInvoiceRow[]>();
    for (const row of rows) result.set(row.documentNumber, [...(result.get(row.documentNumber) ?? []), row]);
    return [...result.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows]);
  const selectedRows = rows.filter((row) => selectedKeys.has(row.sourceLineKey));
  const missingAllocationCount = selectedRows.filter((row) => !row.purchaseAllocationId).length;

  useEffect(() => {
    if (!state.ok || !state.timestamp) return;
    setSelectedKeys(new Set());
  }, [state]);

  async function loadFile(file: File | undefined): Promise<void> {
    if (!file) return;
    setParseError("");
    try {
      const nextRows = rowsFromBannerCsv(await file.text(), allocations);
      const documentCount = new Set(nextRows.map((row) => row.documentNumber)).size;
      setRows(nextRows);
      setSelectedKeys(documentCount === 1 ? new Set(nextRows.map((row) => row.sourceLineKey)) : new Set());
    } catch (error) {
      setRows([]);
      setSelectedKeys(new Set());
      setParseError(error instanceof Error ? error.message : "The CSV could not be read.");
    }
  }

  function toggleRows(keys: string[], checked: boolean): void {
    setSelectedKeys((current) => {
      const next = new Set(current);
      for (const key of keys) {
        if (checked) next.add(key);
        else next.delete(key);
      }
      return next;
    });
  }

  function setAllocation(sourceLineKey: string, purchaseAllocationId: string): void {
    setRows((current) => current.map((row) => row.sourceLineKey === sourceLineKey ? { ...row, purchaseAllocationId } : row));
  }

  return (
    <article className="panel invoiceCsvImporter">
      <div className="invoiceTransactionEntryHeader">
        <div>
          <h3>Import Banner CSV</h3>
          <p className="helperText">Upload the Banner detail export, select the invoice or credit documents for this PO, and import. Previously imported lines are skipped automatically.</p>
        </div>
      </div>
      <label className="invoiceCsvUpload">
        Banner detail CSV
        <input type="file" accept=".csv,text/csv" onChange={(event) => void loadFile(event.target.files?.[0])} />
      </label>
      {parseError ? <p className="errorNote" role="alert">{parseError}</p> : null}
      {state.message ? <p className={state.ok ? "successNote" : "errorNote"} role="status">{state.message}</p> : null}
      {rows.length > 0 ? (
        <>
          <div className="invoiceCsvToolbar">
            <span>{rows.length} line{rows.length === 1 ? "" : "s"} across {groups.length} document{groups.length === 1 ? "" : "s"}</span>
            <div>
              <button type="button" className="tinyButton" onClick={() => setSelectedKeys(new Set(rows.map((row) => row.sourceLineKey)))}>Select all</button>
              <button type="button" className="tinyButton" onClick={() => setSelectedKeys(new Set())}>Clear</button>
            </div>
          </div>
          <div className="invoiceCsvGroups">
            {groups.map(([documentNumber, documentRows]) => {
              const selectedCount = documentRows.filter((row) => selectedKeys.has(row.sourceLineKey)).length;
              const total = documentRows.reduce((sum, row) => sum + row.amount, 0);
              return (
                <details className="invoiceCsvGroup" key={documentNumber} open={groups.length === 1}>
                  <summary>
                    <label onClick={(event) => event.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedCount === documentRows.length}
                        ref={(element) => { if (element) element.indeterminate = selectedCount > 0 && selectedCount < documentRows.length; }}
                        onChange={(event) => toggleRows(documentRows.map((row) => row.sourceLineKey), event.target.checked)}
                      />
                      <span><strong>{documentNumber}</strong><small>{documentRows[0]?.transactionDate} · {documentRows.length} line{documentRows.length === 1 ? "" : "s"}</small></span>
                    </label>
                    <strong className={total < 0 ? "creditAmount" : ""}>{formatCurrency(total)}</strong>
                  </summary>
                  <div className="invoiceCsvRows">
                    {documentRows.map((row) => (
                      <div className="invoiceCsvRow" key={row.sourceLineKey}>
                        <input
                          aria-label={`Select ${row.documentNumber} ${row.description || "line"}`}
                          type="checkbox"
                          checked={selectedKeys.has(row.sourceLineKey)}
                          onChange={(event) => toggleRows([row.sourceLineKey], event.target.checked)}
                        />
                        <span><strong>{row.description || "Banner line"}</strong><small>{row.accountCode || "No account code"}</small></span>
                        {allocations.length > 1 ? (
                          <select
                            aria-label={`Budget allocation for ${row.documentNumber} ${row.description || "line"}`}
                            value={row.purchaseAllocationId}
                            onChange={(event) => setAllocation(row.sourceLineKey, event.target.value)}
                          >
                            <option value="">Choose allocation</option>
                            {allocations.map((allocation) => <option key={allocation.id} value={allocation.id}>{allocation.label}</option>)}
                          </select>
                        ) : <span className="invoiceCsvAutoAllocation">Allocation set automatically</span>}
                        <strong className={row.amount < 0 ? "creditAmount" : ""}>{formatCurrency(row.amount)}</strong>
                      </div>
                    ))}
                  </div>
                </details>
              );
            })}
          </div>
          <form action={action} className="invoiceCsvImportAction">
            <input type="hidden" name="purchaseId" value={purchaseId} />
            <input type="hidden" name="rowsJson" value={JSON.stringify(selectedRows)} />
            <span>{selectedRows.length} selected{missingAllocationCount > 0 ? ` · ${missingAllocationCount} need an allocation` : ""}</span>
            <button type="submit" className="buttonLink buttonPrimary" disabled={pending || selectedRows.length === 0 || missingAllocationCount > 0}>
              {pending ? "Importing…" : "Import selected lines"}
            </button>
          </form>
        </>
      ) : null}
    </article>
  );
}
