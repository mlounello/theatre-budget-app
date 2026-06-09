"use client";

import { useActionState } from "react";
import {
  commitInstitutionalAllocationImportAction,
  previewInstitutionalAllocationImportAction,
  type InstitutionalAllocationImportActionState
} from "@/app/budget-planning/actions";
import { formatCurrency } from "@/lib/format";

type ActionState = {
  ok: boolean;
  message: string;
  timestamp: number;
};

const initialPreviewState: InstitutionalAllocationImportActionState = {
  ok: true,
  message: "",
  timestamp: 0,
  preview: null,
  previewPayload: ""
};

const initialCommitState: ActionState = { ok: true, message: "", timestamp: 0 };

function monthLabel(monthStart: string): string {
  const date = new Date(`${monthStart}T00:00:00Z`);
  return new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" }).format(date);
}

export function InstitutionalAllocationImportPanel() {
  const [previewState, previewAction] = useActionState(previewInstitutionalAllocationImportAction, initialPreviewState);
  const [commitState, commitAction] = useActionState(commitInstitutionalAllocationImportAction, initialCommitState);
  const preview = previewState.preview;
  const canCommit = Boolean(preview && preview.errors.length === 0 && preview.rows.length > 0);

  return (
    <article className="panel">
      <h2>Institutional Allocation Import</h2>
      <form action={previewAction} className="requestForm">
        <label>
          Fiscal Year
          <input name="fiscalYearName" defaultValue="FY27" required />
        </label>
        <label>
          Fiscal Year Start
          <input name="fiscalYearStartDate" type="date" defaultValue="2026-06-01" required />
        </label>
        <label>
          Fiscal Year End
          <input name="fiscalYearEndDate" type="date" defaultValue="2027-05-31" required />
        </label>
        <label>
          Expected Total (optional)
          <input name="expectedGrandTotal" type="number" min="0" step="0.01" placeholder="FY27 workbook: 78275" />
        </label>
        <label>
          Allocation Workbook
          <input name="allocationFile" type="file" accept=".xlsx" required />
        </label>
        <button className="buttonPrimary" type="submit">
          Preview Import
        </button>
        {previewState.message ? (
          <p className={previewState.ok ? "successNote" : "errorNote"} key={previewState.timestamp}>
            {previewState.message}
          </p>
        ) : null}
      </form>

      {preview ? (
        <div className="stackedDetails">
          <p className="helperText">
            {preview.fiscalYearName} runs {preview.fiscalYearStartDate} through {preview.fiscalYearEndDate}. Operating month total:{" "}
            <strong>{formatCurrency(preview.grandTotal)}</strong>
            {preview.expectedGrandTotal !== null ? <> / expected {formatCurrency(preview.expectedGrandTotal)}</> : null}.
          </p>

          {preview.errors.length > 0 ? (
            <div className="errorNote">
              {preview.errors.map((error) => (
                <div key={error}>{error}</div>
              ))}
            </div>
          ) : null}

          {preview.warnings.length > 0 ? (
            <div className="helperText">
              {preview.warnings.map((warning) => (
                <div key={warning}>{warning}</div>
              ))}
            </div>
          ) : null}

          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>Org</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(preview.totalsByOrg).map(([orgCode, total]) => (
                  <tr key={orgCode}>
                    <td>{orgCode}</td>
                    <td>{formatCurrency(total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(preview.totalsByMonth).map(([monthStart, total]) => (
                  <tr key={monthStart}>
                    <td>{monthLabel(monthStart)}</td>
                    <td>{formatCurrency(total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>Row</th>
                  <th>Org</th>
                  <th>Account</th>
                  <th>Name</th>
                  <th>Annual</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.slice(0, 30).map((row) => (
                  <tr key={`${row.orgCode}:${row.accountCode}:${row.sourceRow}`}>
                    <td>{row.sourceRow}</td>
                    <td>{row.orgCode}</td>
                    <td>{row.accountCode}</td>
                    <td>{row.accountName}</td>
                    <td>{formatCurrency(row.annualAmount)}</td>
                  </tr>
                ))}
                {preview.rows.length > 30 ? (
                  <tr>
                    <td colSpan={5}>Showing first 30 of {preview.rows.length} rows.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <form action={commitAction} className="inlineEditForm">
            <input type="hidden" name="previewPayload" value={previewState.previewPayload} />
            <button className="buttonPrimary" type="submit" disabled={!canCommit}>
              Commit Import
            </button>
            {commitState.message ? (
              <span className={commitState.ok ? "successNote" : "errorNote"} key={commitState.timestamp}>
                {commitState.message}
              </span>
            ) : null}
          </form>
        </div>
      ) : null}
    </article>
  );
}
