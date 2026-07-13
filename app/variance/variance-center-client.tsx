"use client";

import type { ReactNode } from "react";
import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  addVarianceSourceLineAction,
  deleteVarianceDraftAction,
  deleteVarianceSourceLineAction,
  generateVarianceWorkbookAction,
  updateVarianceStatusAction,
  type ActionState
} from "@/app/variance/actions";

export type VarianceSourceLine = {
  id: string;
  budgetPlanMonthId: string;
  targetBudgetPlanMonthId: string;
  label: string;
  targetLabel: string;
  amount: number;
  narrative: string | null;
  crossOrgOverride: boolean;
};

export type VarianceTargetLine = {
  id: string;
  budgetPlanMonthId: string;
  fiscalYearId: string | null;
  organizationId: string | null;
  label: string;
  shortageAmount: number;
};

export type VarianceRow = {
  id: string;
  status: string;
  reason: string | null;
  totalTransferAmount: number;
  targetShortage: number;
  totalSourced: number;
  createdAt: string;
  purchaseTitle: string | null;
  projectName: string | null;
  fiscalYearName: string | null;
  targetFiscalYearId: string | null;
  targetOrganizationId: string | null;
  targetLabel: string | null;
  targetLines: VarianceTargetLine[];
  lineCount: number;
  sourceLines: VarianceSourceLine[];
  generatedFileUrl: string | null;
};

export type SourceCandidate = {
  budgetPlanMonthId: string;
  fiscalYearId: string | null;
  fiscalYearName: string | null;
  organizationId: string | null;
  orgCode: string | null;
  organizationName: string | null;
  accountCode: string | null;
  accountName: string | null;
  monthStart: string | null;
  label: string;
  available: number;
  projectedAvailable: number;
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

function SubmitButton({ children, className = "buttonLink", disabled = false }: { children: ReactNode; className?: string; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button className={className} type="submit" disabled={pending || disabled}>
      {pending ? "Saving..." : children}
    </button>
  );
}

function StateMessage({ state }: { state: ActionState }) {
  if (!state.message) return null;
  return (
    <p className={state.ok ? "successNote varianceAlert" : "errorNote varianceAlert"} key={state.timestamp}>
      {state.message}
    </p>
  );
}

function FundingSummary({ variance }: { variance: VarianceRow }) {
  const remaining = Math.max(variance.targetShortage - variance.totalSourced, 0);
  const over = variance.totalSourced > variance.targetShortage;
  return (
    <div className="varianceFundingGrid">
      <div>
        <span>Target shortage</span>
        <strong>{money(variance.targetShortage)}</strong>
      </div>
      <div>
        <span>Total sourced</span>
        <strong>{money(variance.totalSourced)}</strong>
      </div>
      <div>
        <span>Remaining</span>
        <strong className={remaining === 0 ? "positive" : "negative"}>{money(remaining)}</strong>
      </div>
      {over ? <p className="errorNote varianceAlert">Total sourced is greater than the target shortage.</p> : null}
    </div>
  );
}

function TargetLineList({ variance }: { variance: VarianceRow }) {
  if (variance.targetLines.length === 0) return null;
  return (
    <div className="sourceLineList targetLineList">
      <p className="eyebrow">Target shortages</p>
      {variance.targetLines.map((target) => {
        const sourced = variance.sourceLines
          .filter((line) => line.targetBudgetPlanMonthId === target.budgetPlanMonthId)
          .reduce((sum, line) => sum + line.amount, 0);
        const remaining = Math.max(target.shortageAmount - sourced, 0);
        return (
          <div className="sourceLineRow" key={target.id}>
            <div>
              <strong>{target.label}</strong>
              <p className="helperText">
                Need {money(target.shortageAmount)} | Sourced {money(sourced)} | Remaining {money(remaining)}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SourcePicker({
  variance,
  targetLine,
  sourceCandidates,
  remaining
}: {
  variance: VarianceRow;
  targetLine: VarianceTargetLine;
  sourceCandidates: SourceCandidate[];
  remaining: number;
}) {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [crossOrgOverride, setCrossOrgOverride] = useState(false);
  const normalizedSearch = search.trim().toLowerCase();
  const sortedCandidates = useMemo(() => {
    const existingSourceIds = new Set(
      variance.sourceLines
        .filter((line) => line.targetBudgetPlanMonthId === targetLine.budgetPlanMonthId)
        .map((line) => line.budgetPlanMonthId)
    );
    return sourceCandidates
      .filter((candidate) => !existingSourceIds.has(candidate.budgetPlanMonthId))
      .filter((candidate) => crossOrgOverride || !targetLine.organizationId || candidate.organizationId === targetLine.organizationId)
      .filter((candidate) => {
        if (!normalizedSearch) return true;
        return [candidate.fiscalYearName, candidate.orgCode, candidate.organizationName, candidate.accountCode, candidate.accountName, candidate.monthStart]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(normalizedSearch);
      })
      .sort((a, b) => {
        const aSameFy = targetLine.fiscalYearId && a.fiscalYearId === targetLine.fiscalYearId ? 0 : 1;
        const bSameFy = targetLine.fiscalYearId && b.fiscalYearId === targetLine.fiscalYearId ? 0 : 1;
        const aSameOrg = targetLine.organizationId && a.organizationId === targetLine.organizationId ? 0 : 1;
        const bSameOrg = targetLine.organizationId && b.organizationId === targetLine.organizationId ? 0 : 1;
        const aEnough = a.projectedAvailable >= remaining ? 0 : 1;
        const bEnough = b.projectedAvailable >= remaining ? 0 : 1;
        return aSameFy - bSameFy || aSameOrg - bSameOrg || aEnough - bEnough || b.projectedAvailable - a.projectedAvailable || a.label.localeCompare(b.label);
      })
      .slice(0, 24);
  }, [crossOrgOverride, normalizedSearch, remaining, sourceCandidates, targetLine, variance.sourceLines]);

  const selected = sortedCandidates.find((candidate) => candidate.budgetPlanMonthId === selectedId);

  return (
    <div className="sourcePicker">
      <label>
        Search source buckets
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Org, account, month, or FY" />
      </label>
      <label className="checkboxLabel">
        <input checked={crossOrgOverride} onChange={(event) => setCrossOrgOverride(event.target.checked)} type="checkbox" />
        Cross-org override
      </label>
      <input type="hidden" name="fromBudgetPlanMonthId" value={selectedId} />
      <input type="hidden" name="crossOrgOverride" value={crossOrgOverride ? "on" : ""} />
      <div className="sourceCandidateList">
        {sortedCandidates.map((candidate) => {
          const sameOrg = targetLine.organizationId && candidate.organizationId === targetLine.organizationId;
          const enough = candidate.projectedAvailable >= remaining;
          return (
            <button
              className={candidate.budgetPlanMonthId === selectedId ? "sourceCandidate selected" : "sourceCandidate"}
              key={candidate.budgetPlanMonthId}
              onClick={() => setSelectedId(candidate.budgetPlanMonthId)}
              type="button"
            >
              <span>
                <strong>
                  {candidate.orgCode ?? "Org"} / {candidate.accountCode ?? "Account"}
                </strong>
                <small>{[candidate.accountName, candidate.monthStart ? String(candidate.monthStart).slice(0, 7) : null].filter(Boolean).join(" | ")}</small>
              </span>
              <span className={enough ? "positive sourceCandidateAmount" : "negative sourceCandidateAmount"}>
                {money(candidate.projectedAvailable)}
                <small>after pending</small>
              </span>
              {!sameOrg ? <em>Cross-org</em> : null}
            </button>
          );
        })}
        {sortedCandidates.length === 0 ? <p className="helperText">No matching source buckets.</p> : null}
      </div>
      {selected ? (
        <p className="helperText">
          Selected: {selected.label}. Official {money(selected.available)}, after pending {money(selected.projectedAvailable)}.
        </p>
      ) : null}
    </div>
  );
}

function SourceLineList({ variance }: { variance: VarianceRow }) {
  const [state, action] = useActionState(deleteVarianceSourceLineAction, initialState);
  const canEdit = ["draft", "ready_for_review"].includes(variance.status);
  if (variance.sourceLines.length === 0) return <p className="helperText">No source buckets selected yet.</p>;

  return (
    <div className="sourceLineList">
      {variance.sourceLines.map((line) => (
        <div className="sourceLineRow" key={line.id}>
          <div>
            <strong>{line.label}</strong>
            <p className="helperText">
              {money(line.amount)}
              {line.targetLabel ? ` | To ${line.targetLabel}` : ""}
              {line.crossOrgOverride ? " | Cross-org override" : ""}
              {line.narrative ? ` | ${line.narrative}` : ""}
            </p>
          </div>
          {canEdit ? (
            <form
              action={action}
              onSubmit={(event) => {
                if (!window.confirm("Remove this source line?")) event.preventDefault();
              }}
            >
              <input type="hidden" name="varianceRequestId" value={variance.id} />
              <input type="hidden" name="lineId" value={line.id} />
              <SubmitButton className="tinyButton dangerButton">Remove</SubmitButton>
            </form>
          ) : null}
        </div>
      ))}
      <StateMessage state={state} />
    </div>
  );
}

function SourceLineForm({ variance, sourceCandidates }: { variance: VarianceRow; sourceCandidates: SourceCandidate[] }) {
  const [state, action] = useActionState(addVarianceSourceLineAction, initialState);
  if (!["draft", "ready_for_review"].includes(variance.status)) return null;
  const targets =
    variance.targetLines.length > 0
      ? variance.targetLines
      : [
          {
            id: `${variance.id}:target`,
            budgetPlanMonthId: "",
            fiscalYearId: variance.targetFiscalYearId,
            organizationId: variance.targetOrganizationId,
            label: variance.targetLabel ?? "Target bucket",
            shortageAmount: variance.targetShortage
          }
        ];

  return (
    <div className="varianceTargetRouting">
      {targets.map((targetLine) => {
        const sourced = variance.sourceLines
          .filter((line) => !targetLine.budgetPlanMonthId || line.targetBudgetPlanMonthId === targetLine.budgetPlanMonthId)
          .reduce((sum, line) => sum + line.amount, 0);
        const remaining = Math.max(targetLine.shortageAmount - sourced, 0);
        const fullySourced = remaining <= 0;
        return (
          <form className="varianceSourceForm" action={action} key={targetLine.id}>
            <input type="hidden" name="varianceRequestId" value={variance.id} />
            <input type="hidden" name="toBudgetPlanMonthId" value={targetLine.budgetPlanMonthId} />
            <div>
              <p className="eyebrow">Route source to</p>
              <strong>{targetLine.label}</strong>
              <p className="helperText">Remaining to source: {money(remaining)}</p>
            </div>
            <SourcePicker variance={variance} targetLine={targetLine} sourceCandidates={sourceCandidates} remaining={remaining || targetLine.shortageAmount} />
            <label>
              Transfer Amount
              <input name="transferAmount" type="number" min="0.01" step="0.01" defaultValue={(remaining || targetLine.shortageAmount).toFixed(2)} required />
            </label>
            <label>
              Narrative
              <input name="narrative" placeholder="Reason for moving funds" />
            </label>
            <SubmitButton className="buttonLink buttonPrimary" disabled={fullySourced}>
              {fullySourced ? "Fully Sourced" : "Add Source"}
            </SubmitButton>
            {fullySourced ? <p className="helperText">Remove a source line before adding another for this target.</p> : null}
          </form>
        );
      })}
      <StateMessage state={state} />
    </div>
  );
}

function StatusControls({ variance, canApprove }: { variance: VarianceRow; canApprove: boolean }) {
  const [state, action] = useActionState(updateVarianceStatusAction, initialState);
  const options = canApprove
    ? ["draft", "ready_for_review", "submitted", "approved", "denied", "posted"]
    : ["draft", "ready_for_review", "submitted"];
  const isOverSourced = variance.totalSourced > variance.targetShortage;

  return (
    <form className="varianceControlForm" action={action}>
      <input type="hidden" name="varianceRequestId" value={variance.id} />
      <label>
        Status
        <select name="status" defaultValue={variance.status}>
          {options.map((status) => (
            <option key={status} value={status}>
              {statusLabel(status)}
            </option>
          ))}
        </select>
      </label>
      <label>
        Status note
        <input name="note" placeholder="Optional note" />
      </label>
      {isOverSourced ? (
        <label className="checkboxLabel">
          <input name="allowOverSourced" type="checkbox" />
          Allow over-sourced Ready for Review
        </label>
      ) : null}
      <SubmitButton className="tinyButton">Update Status</SubmitButton>
      <StateMessage state={state} />
    </form>
  );
}

function WorkbookControls({ variance }: { variance: VarianceRow }) {
  const [state, action] = useActionState(generateVarianceWorkbookAction, initialState);
  return (
    <div className="varianceActions">
      <form action={action}>
        <input type="hidden" name="varianceRequestId" value={variance.id} />
        <SubmitButton className="tinyButton">Regenerate Workbook</SubmitButton>
      </form>
      {variance.generatedFileUrl ? (
        <a className="tinyButton" href={variance.generatedFileUrl}>
          Download Excel
        </a>
      ) : null}
      <StateMessage state={state} />
    </div>
  );
}

function DeleteVarianceControl({ variance }: { variance: VarianceRow }) {
  const [state, action] = useActionState(deleteVarianceDraftAction, initialState);
  if (!["draft", "ready_for_review"].includes(variance.status)) return null;
  return (
    <form
      action={action}
      className="varianceActions"
      onSubmit={(event) => {
        if (!window.confirm("Delete this variance draft and its source lines?")) event.preventDefault();
      }}
    >
      <input type="hidden" name="varianceRequestId" value={variance.id} />
      <SubmitButton className="tinyButton dangerButton">Delete Draft</SubmitButton>
      <StateMessage state={state} />
    </form>
  );
}

export function VarianceCenterClient({ variances, sourceCandidates, canApprove }: Props) {
  const groups = ["draft", "ready_for_review", "submitted", "approved", "denied", "posted"];

  return (
    <div className="stackedPanels varianceCenter">
      {groups.map((status) => {
        const rows = variances.filter((variance) => variance.status === status);
        return (
          <article className="panel varianceStatusPanel" key={status}>
            <div className="compactHeader">
              <h2>
                {statusLabel(status)} <span className="muted">({rows.length})</span>
              </h2>
            </div>
            {rows.length === 0 ? <p className="heroSubtitle">No variances in this status.</p> : null}
            {rows.map((variance) => (
              <div className="budgetCard varianceCard" key={variance.id}>
                <div>
                  <p className="eyebrow">{variance.fiscalYearName ?? "Fiscal Year"}</p>
                  <h3>{variance.purchaseTitle ?? "Institutional variance"}</h3>
                  <p className="heroSubtitle">{variance.projectName ?? "Unassigned project"}</p>
                  {variance.targetLabel ? <p className="helperText">To bucket: {variance.targetLabel}</p> : null}
                  {variance.reason ? <p>{variance.reason}</p> : null}
                </div>
                <FundingSummary variance={variance} />
                <TargetLineList variance={variance} />
                <SourceLineList variance={variance} />
                <SourceLineForm variance={variance} sourceCandidates={sourceCandidates} />
                <WorkbookControls variance={variance} />
                <StatusControls variance={variance} canApprove={canApprove} />
                <DeleteVarianceControl variance={variance} />
              </div>
            ))}
          </article>
        );
      })}
    </div>
  );
}
