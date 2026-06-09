"use client";

import { useActionState } from "react";
import {
  addVarianceSourceLineAction,
  generateVarianceWorkbookAction,
  updateVarianceStatusAction,
  type ActionState
} from "@/app/variance/actions";

export type VarianceRow = {
  id: string;
  status: string;
  reason: string | null;
  totalTransferAmount: number;
  createdAt: string;
  purchaseTitle: string | null;
  projectName: string | null;
  fiscalYearName: string | null;
  targetOrganizationId: string | null;
  targetLabel: string | null;
  lineCount: number;
  generatedFileUrl: string | null;
};

export type SourceCandidate = {
  budgetPlanMonthId: string;
  organizationId: string | null;
  label: string;
  available: number;
  crossesTargetOrg: boolean;
};

type Props = {
  variances: VarianceRow[];
  sourceCandidates: SourceCandidate[];
  canApprove: boolean;
};

const initialState: ActionState = { ok: true, message: "", timestamp: 0 };

function statusLabel(status: string): string {
  return status
    .split("_")
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

function money(value: number): string {
  return value.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function SourceLineForm({ variance, sourceCandidates }: { variance: VarianceRow; sourceCandidates: SourceCandidate[] }) {
  const [state, action] = useActionState(addVarianceSourceLineAction, initialState);
  if (!["draft", "ready_for_review"].includes(variance.status)) return null;
  const sortedCandidates = [...sourceCandidates].sort((a, b) => {
    const aSameOrg = variance.targetOrganizationId && a.organizationId === variance.targetOrganizationId ? 0 : 1;
    const bSameOrg = variance.targetOrganizationId && b.organizationId === variance.targetOrganizationId ? 0 : 1;
    return aSameOrg - bSameOrg || b.available - a.available || a.label.localeCompare(b.label);
  });

  return (
    <form className="panelGrid" action={action}>
      <input type="hidden" name="varianceRequestId" value={variance.id} />
      <label>
        Source Bucket
        <select name="fromBudgetPlanMonthId" required>
          <option value="">Choose source</option>
          {sortedCandidates.map((candidate) => {
            const crossesTarget = Boolean(variance.targetOrganizationId && candidate.organizationId !== variance.targetOrganizationId);
            return (
              <option key={candidate.budgetPlanMonthId} value={candidate.budgetPlanMonthId}>
                {candidate.label} | {money(candidate.available)}
                {crossesTarget || candidate.crossesTargetOrg ? " | Cross-org" : ""}
              </option>
            );
          })}
        </select>
      </label>
      <label>
        Transfer Amount
        <input name="transferAmount" type="number" min="0.01" step="0.01" defaultValue={variance.totalTransferAmount.toFixed(2)} required />
      </label>
      <label>
        Narrative
        <input name="narrative" placeholder="Reason for moving funds" />
      </label>
      <label className="checkboxLabel">
        <input name="crossOrgOverride" type="checkbox" />
        Cross-org override
      </label>
      <button className="buttonLink" type="submit">
        Add Source
      </button>
      {state.message ? <p className={state.ok ? "successNote" : "errorNote"}>{state.message}</p> : null}
    </form>
  );
}

function StatusControls({ variance, canApprove }: { variance: VarianceRow; canApprove: boolean }) {
  const [state, action] = useActionState(updateVarianceStatusAction, initialState);
  const options = canApprove
    ? ["draft", "ready_for_review", "submitted", "approved", "denied", "posted"]
    : ["draft", "ready_for_review", "submitted"];

  return (
    <form className="inlineForm" action={action}>
      <input type="hidden" name="varianceRequestId" value={variance.id} />
      <select name="status" defaultValue={variance.status}>
        {options.map((status) => (
          <option key={status} value={status}>
            {statusLabel(status)}
          </option>
        ))}
      </select>
      <input name="note" placeholder="Status note" />
      <button className="tinyButton" type="submit">
        Update
      </button>
      {state.message ? <span className={state.ok ? "successNote" : "errorNote"}>{state.message}</span> : null}
    </form>
  );
}

function WorkbookControls({ variance }: { variance: VarianceRow }) {
  const [state, action] = useActionState(generateVarianceWorkbookAction, initialState);
  return (
    <div className="inlineForm">
      <form action={action} className="inlineForm">
        <input type="hidden" name="varianceRequestId" value={variance.id} />
        <button className="tinyButton" type="submit">
          Regenerate Workbook
        </button>
      </form>
      {variance.generatedFileUrl ? (
        <a className="tinyButton" href={variance.generatedFileUrl}>
          Download Excel
        </a>
      ) : null}
      {state.message ? <span className={state.ok ? "successNote" : "errorNote"}>{state.message}</span> : null}
    </div>
  );
}

export function VarianceCenterClient({ variances, sourceCandidates, canApprove }: Props) {
  const groups = ["draft", "ready_for_review", "submitted", "approved", "denied", "posted"];

  return (
    <div className="stackedPanels">
      {groups.map((status) => {
        const rows = variances.filter((variance) => variance.status === status);
        return (
          <article className="panel" key={status}>
            <h2>
              {statusLabel(status)} <span className="muted">({rows.length})</span>
            </h2>
            {rows.length === 0 ? <p className="heroSubtitle">No variances in this status.</p> : null}
            {rows.map((variance) => (
              <div className="budgetCard" key={variance.id}>
                <div>
                  <p className="eyebrow">{variance.fiscalYearName ?? "Fiscal Year"}</p>
                  <h3>{variance.purchaseTitle ?? "Institutional variance"}</h3>
                  <p className="heroSubtitle">
                    {variance.projectName ?? "Unassigned project"} | shortage {money(variance.totalTransferAmount)} | {variance.lineCount} source line
                    {variance.lineCount === 1 ? "" : "s"}
                  </p>
                  {variance.targetLabel ? <p className="helperText">To bucket: {variance.targetLabel}</p> : null}
                  {variance.reason ? <p>{variance.reason}</p> : null}
                </div>
                <SourceLineForm variance={variance} sourceCandidates={sourceCandidates} />
                <WorkbookControls variance={variance} />
                <StatusControls variance={variance} canApprove={canApprove} />
              </div>
            ))}
          </article>
        );
      })}
    </div>
  );
}
