"use client";

import { useActionState, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  addVarianceSourceLineAction,
  deleteVarianceDraftAction,
  deleteVarianceSourceLineAction,
  generateVarianceWorkbookAction,
  resolveDuplicateVarianceAction,
  updateVarianceStatusAction,
  type ActionState
} from "@/app/variance/actions";
import { ActionNotice } from "@/components/ui/action-notice";
import { ConfirmationDialog } from "@/components/ui/modal-dialog";
import { PendingButton } from "@/components/ui/pending-button";
import { SideDrawer } from "@/components/ui/side-drawer";
import { StatusPill, type StatusTone } from "@/components/ui/status-controls";

export type VarianceSourceLine = { id: string; budgetPlanMonthId: string; targetBudgetPlanMonthId: string; label: string; targetLabel: string; amount: number; narrative: string | null; crossOrgOverride: boolean };
export type VarianceTargetLine = { id: string; budgetPlanMonthId: string; fiscalYearId: string | null; organizationId: string | null; label: string; shortageAmount: number };
export type VarianceRow = {
  id: string; status: string; reason: string | null; totalTransferAmount: number; targetShortage: number; totalSourced: number; createdAt: string;
  purchaseTitle: string | null; projectName: string | null; fiscalYearName: string | null; targetFiscalYearId: string | null;
  targetOrganizationId: string | null; targetLabel: string | null; targetLines: VarianceTargetLine[]; lineCount: number;
  sourceLines: VarianceSourceLine[]; generatedFileUrl: string | null;
};
export type SourceCandidate = {
  budgetPlanMonthId: string; fiscalYearId: string | null; fiscalYearName: string | null; organizationId: string | null; orgCode: string | null;
  organizationName: string | null; accountCode: string | null; accountName: string | null; monthStart: string | null; label: string;
  available: number; projectedAvailable: number; crossesTargetOrg: boolean;
};
type Props = { variances: VarianceRow[]; sourceCandidates: SourceCandidate[]; canApprove: boolean };
type ConfirmAction = { kind: "source"; lineId: string } | { kind: "draft" } | null;

const initialState: ActionState = { ok: true, message: "", timestamp: 0 };

function statusLabel(status: string) { return status.split("_").map((part) => part.slice(0, 1).toUpperCase() + part.slice(1)).join(" "); }
function statusTone(status: string): StatusTone {
  if (status === "posted" || status === "approved") return "success";
  if (status === "submitted" || status === "ready_for_review") return "info";
  if (status === "denied") return "danger";
  return "warning";
}
function money(value: number) { return value.toLocaleString("en-US", { style: "currency", currency: "USD" }); }
function StateMessage({ state }: { state: ActionState }) {
  return state.message ? <ActionNotice tone={state.ok ? "success" : "error"}>{state.message}</ActionNotice> : null;
}
function targetKey(variance: VarianceRow) {
  const ids = variance.targetLines.map((target) => target.budgetPlanMonthId).filter(Boolean).sort();
  return ids.length > 0 ? ids.join("|") : variance.targetLabel ?? `${variance.targetFiscalYearId ?? "unknown"}:${variance.targetOrganizationId ?? "unknown"}`;
}
function duplicateKey(variance: VarianceRow) { return `${variance.targetFiscalYearId ?? variance.fiscalYearName ?? "unknown"}::${targetKey(variance)}`; }

function FundingSummary({ variance }: { variance: VarianceRow }) {
  const remaining = Math.max(variance.targetShortage - variance.totalSourced, 0);
  return <div className="varianceFundingGrid">
    <div><span>Target shortage</span><strong>{money(variance.targetShortage)}</strong></div>
    <div><span>Total sourced</span><strong>{money(variance.totalSourced)}</strong></div>
    <div><span>Remaining</span><strong className={remaining === 0 ? "positive" : "negative"}>{money(remaining)}</strong></div>
    {variance.totalSourced > variance.targetShortage ? <ActionNotice tone="warning" className="varianceAlert">Total sourced is greater than the target shortage.</ActionNotice> : null}
  </div>;
}

function TargetLineList({ variance }: { variance: VarianceRow }) {
  if (variance.targetLines.length === 0) return null;
  return <section className="varianceDrawerSection"><h3>Target shortages</h3><div className="sourceLineList targetLineList">
    {variance.targetLines.map((target) => {
      const sourced = variance.sourceLines.filter((line) => line.targetBudgetPlanMonthId === target.budgetPlanMonthId).reduce((sum, line) => sum + line.amount, 0);
      return <div className="sourceLineRow" key={target.id}><div><strong>{target.label}</strong><p className="helperText">Need {money(target.shortageAmount)} · Sourced {money(sourced)} · Remaining {money(Math.max(target.shortageAmount - sourced, 0))}</p></div></div>;
    })}
  </div></section>;
}

function SourcePicker({ variance, targetLine, sourceCandidates, remaining }: { variance: VarianceRow; targetLine: VarianceTargetLine; sourceCandidates: SourceCandidate[]; remaining: number }) {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const normalizedSearch = search.trim().toLowerCase();
  const sortedCandidates = useMemo(() => {
    const existing = new Set(variance.sourceLines.filter((line) => line.targetBudgetPlanMonthId === targetLine.budgetPlanMonthId).map((line) => line.budgetPlanMonthId));
    return sourceCandidates.filter((candidate) => !existing.has(candidate.budgetPlanMonthId))
      .filter((candidate) => !targetLine.fiscalYearId || candidate.fiscalYearId === targetLine.fiscalYearId)
      .filter((candidate) => !normalizedSearch || candidate.label.toLowerCase().includes(normalizedSearch))
      .sort((a, b) => {
        const aSameOrg = targetLine.organizationId && a.organizationId === targetLine.organizationId ? 0 : 1;
        const bSameOrg = targetLine.organizationId && b.organizationId === targetLine.organizationId ? 0 : 1;
        const aEnough = a.projectedAvailable >= remaining ? 0 : 1;
        const bEnough = b.projectedAvailable >= remaining ? 0 : 1;
        return aSameOrg - bSameOrg || aEnough - bEnough || b.projectedAvailable - a.projectedAvailable || a.label.localeCompare(b.label);
      }).slice(0, 24);
  }, [normalizedSearch, remaining, sourceCandidates, targetLine, variance.sourceLines]);
  const selected = sortedCandidates.find((candidate) => candidate.budgetPlanMonthId === selectedId);
  return <div className="sourcePicker">
    <label>Search same-year source buckets<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Organization, account, or month" /></label>
    <input type="hidden" name="fromBudgetPlanMonthId" value={selectedId} />
    {!normalizedSearch && sortedCandidates.length > 0 ? <p className="helperText">Suggested sources are ranked by same organization, sufficient balance, then available funds.</p> : null}
    <div className="sourceCandidateList">{sortedCandidates.map((candidate, index) => {
      const sameOrg = Boolean(targetLine.organizationId && candidate.organizationId === targetLine.organizationId);
      const enough = candidate.projectedAvailable >= remaining;
      return <button className={candidate.budgetPlanMonthId === selectedId ? "sourceCandidate selected" : "sourceCandidate"} key={candidate.budgetPlanMonthId} onClick={() => setSelectedId(candidate.budgetPlanMonthId)} type="button">
        <span><strong>{candidate.orgCode ?? "Org"} / {candidate.accountCode ?? "Account"}</strong><small>{[candidate.accountName, candidate.monthStart ? String(candidate.monthStart).slice(0, 7) : null].filter(Boolean).join(" · ")}</small></span>
        <span className={enough ? "positive sourceCandidateAmount" : "negative sourceCandidateAmount"}>{money(candidate.projectedAvailable)}<small>after pending</small></span>
        <span className="sourceCandidateFlags">{index < 3 && !normalizedSearch ? <em className="suggestionFlag">Suggested</em> : null}{!sameOrg ? <em>Cross-org</em> : null}</span>
      </button>;
    })}{sortedCandidates.length === 0 ? <p className="helperText">No matching same-year source buckets.</p> : null}</div>
    {selected ? <p className="helperText">Selected: {selected.label}. Official {money(selected.available)}, after pending {money(selected.projectedAvailable)}.</p> : null}
  </div>;
}

function SourceRouting({ variance, sourceCandidates }: { variance: VarianceRow; sourceCandidates: SourceCandidate[] }) {
  const [state, action] = useActionState(addVarianceSourceLineAction, initialState);
  const targets = variance.targetLines.length > 0 ? variance.targetLines : [{ id: `${variance.id}:target`, budgetPlanMonthId: "", fiscalYearId: variance.targetFiscalYearId, organizationId: variance.targetOrganizationId, label: variance.targetLabel ?? "Target bucket", shortageAmount: variance.targetShortage }];
  const [selectedTargetId, setSelectedTargetId] = useState(targets[0]?.budgetPlanMonthId ?? "");
  if (!["draft", "ready_for_review"].includes(variance.status)) return null;
  const target = targets.find((item) => item.budgetPlanMonthId === selectedTargetId) ?? targets[0];
  const sourced = variance.sourceLines.filter((line) => !target.budgetPlanMonthId || line.targetBudgetPlanMonthId === target.budgetPlanMonthId).reduce((sum, line) => sum + line.amount, 0);
  const remaining = Math.max(target.shortageAmount - sourced, 0);
  return <section className="varianceDrawerSection"><h3>Add a source</h3><form className="varianceSourceForm" action={action}>
    <input type="hidden" name="varianceRequestId" value={variance.id} />
    <label>Target shortage<select name="toBudgetPlanMonthId" value={target.budgetPlanMonthId} onChange={(event) => setSelectedTargetId(event.target.value)}>{targets.map((item) => <option key={item.id} value={item.budgetPlanMonthId}>{item.label}</option>)}</select></label>
    <p className="helperText">Remaining to source: {money(remaining)}</p>
    <SourcePicker variance={variance} targetLine={target} sourceCandidates={sourceCandidates} remaining={remaining || target.shortageAmount} />
    <div className="drawerFieldGrid"><label>Transfer amount<input name="transferAmount" type="number" min="0.01" step="0.01" defaultValue={(remaining || target.shortageAmount).toFixed(2)} required /></label><label>Narrative<input name="narrative" placeholder="Reason for moving funds" /></label></div>
    <PendingButton className="buttonLink buttonPrimary" type="submit" disabled={remaining <= 0} pendingLabel="Adding source…">{remaining <= 0 ? "Fully sourced" : "Add source"}</PendingButton>
  </form><StateMessage state={state} /></section>;
}

function ExistingSources({ variance, onRequestRemove, registerForm }: { variance: VarianceRow; onRequestRemove: (lineId: string) => void; registerForm: (lineId: string, node: HTMLFormElement | null) => void }) {
  const [state, action] = useActionState(deleteVarianceSourceLineAction, initialState);
  const canEdit = ["draft", "ready_for_review"].includes(variance.status);
  return <section className="varianceDrawerSection"><h3>Selected sources</h3>
    {variance.sourceLines.length === 0 ? <p className="helperText">No source buckets selected yet.</p> : <div className="sourceLineList">{variance.sourceLines.map((line) => <div className="sourceLineRow" key={line.id}><div><strong>{line.label}</strong><p className="helperText">{money(line.amount)}{line.targetLabel ? ` · To ${line.targetLabel}` : ""}{line.crossOrgOverride ? " · Cross-organization" : ""}{line.narrative ? ` · ${line.narrative}` : ""}</p></div>{canEdit ? <form action={action} ref={(node) => registerForm(line.id, node)}><input type="hidden" name="varianceRequestId" value={variance.id} /><input type="hidden" name="lineId" value={line.id} /><button className="tinyButton dangerButton" type="button" onClick={() => onRequestRemove(line.id)}>Remove</button></form> : null}</div>)}</div>}
    <StateMessage state={state} />
  </section>;
}

function DuplicateControls({ variance, duplicates }: { variance: VarianceRow; duplicates: VarianceRow[] }) {
  const [state, action] = useActionState(resolveDuplicateVarianceAction, initialState);
  if (!["draft", "ready_for_review"].includes(variance.status) || duplicates.length === 0) return null;
  return <section className="varianceDrawerSection varianceDuplicateSection"><div><h3>Possible duplicate drafts</h3><p className="helperText">These drafts cover the same fiscal year and target buckets. Choose deliberately so no request disappears silently.</p></div>
    {duplicates.map((duplicate) => <div className="varianceDuplicateRow" key={duplicate.id}><div><strong>{duplicate.purchaseTitle ?? "Institutional variance"}</strong><p className="helperText">Created {new Date(duplicate.createdAt).toLocaleDateString()} · {money(duplicate.totalSourced)} sourced</p></div><div className="varianceActions">
      <form action={action}><input type="hidden" name="primaryVarianceId" value={variance.id} /><input type="hidden" name="duplicateVarianceId" value={duplicate.id} /><input type="hidden" name="mode" value="combine" /><PendingButton className="tinyButton" pendingLabel="Combining…">Combine into this draft</PendingButton></form>
      <form action={action}><input type="hidden" name="primaryVarianceId" value={variance.id} /><input type="hidden" name="duplicateVarianceId" value={duplicate.id} /><input type="hidden" name="mode" value="dismiss" /><PendingButton className="tinyButton dangerButton" pendingLabel="Dismissing…">Dismiss duplicate</PendingButton></form>
    </div></div>)}<StateMessage state={state} />
  </section>;
}

function DrawerControls({ variance, canApprove, onDelete }: { variance: VarianceRow; canApprove: boolean; onDelete: () => void }) {
  const [statusState, statusAction] = useActionState(updateVarianceStatusAction, initialState);
  const [workbookState, workbookAction] = useActionState(generateVarianceWorkbookAction, initialState);
  const options = canApprove ? ["draft", "ready_for_review", "submitted", "approved", "denied", "posted"] : ["draft", "ready_for_review", "submitted"];
  return <section className="varianceDrawerSection"><h3>Workflow</h3><form className="varianceControlForm" action={statusAction}>
    <input type="hidden" name="varianceRequestId" value={variance.id} /><div className="drawerFieldGrid"><label>Status<select name="status" defaultValue={variance.status}>{options.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}</select></label><label>Status note<input name="note" placeholder="Optional note" /></label></div>
    {variance.totalSourced > variance.targetShortage ? <label className="checkboxLabel"><input name="allowOverSourced" type="checkbox" />Allow over-sourced Ready for Review</label> : null}<PendingButton className="tinyButton" pendingLabel="Updating…">Update status</PendingButton>
  </form><StateMessage state={statusState} /><div className="varianceActions"><form action={workbookAction}><input type="hidden" name="varianceRequestId" value={variance.id} /><PendingButton className="tinyButton" pendingLabel="Generating…">Regenerate workbook</PendingButton></form>{variance.generatedFileUrl ? <a className="tinyButton" href={variance.generatedFileUrl}>Download Excel</a> : null}{["draft", "ready_for_review"].includes(variance.status) ? <button type="button" className="tinyButton dangerButton" onClick={onDelete}>Delete draft</button> : null}</div><StateMessage state={workbookState} />
  </section>;
}

function QueueCard({ variance, duplicateCount, onOpen }: { variance: VarianceRow; duplicateCount: number; onOpen: () => void }) {
  const remaining = Math.max(variance.targetShortage - variance.totalSourced, 0);
  return <button type="button" className="varianceQueueCard" onClick={onOpen} aria-label={`Open ${variance.purchaseTitle ?? "variance"}`}>
    <span className="varianceQueueCardHeader"><span><strong>{variance.purchaseTitle ?? "Institutional variance"}</strong><small>{variance.projectName ?? variance.targetLabel ?? "Organization budget"}</small></span><StatusPill tone={statusTone(variance.status)}>{statusLabel(variance.status)}</StatusPill></span>
    <span className="varianceQueueMetrics"><span><small>Shortage</small>{money(variance.targetShortage)}</span><span><small>Sourced</small>{money(variance.totalSourced)}</span><span className={remaining === 0 ? "positive" : "negative"}><small>Remaining</small>{money(remaining)}</span></span>
    <span className="varianceQueueMeta"><span>{variance.fiscalYearName ?? "Fiscal year"} · {new Date(variance.createdAt).toLocaleDateString()}</span>{duplicateCount > 0 ? <StatusPill tone="warning">{duplicateCount} possible duplicate{duplicateCount === 1 ? "" : "s"}</StatusPill> : null}</span>
  </button>;
}

export function VarianceCenterClient({ variances, sourceCandidates, canApprove }: Props) {
  const pathname = usePathname(); const router = useRouter(); const searchParams = useSearchParams();
  const activeVariance = variances.find((variance) => variance.id === searchParams.get("varianceId")) ?? null;
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const deleteFormRef = useRef<HTMLFormElement>(null); const sourceDeleteForms = useRef(new Map<string, HTMLFormElement>());
  const [deleteState, deleteAction] = useActionState(deleteVarianceDraftAction, initialState);
  const duplicateGroups = useMemo(() => {
    const groups = new Map<string, VarianceRow[]>();
    for (const variance of variances.filter((row) => ["draft", "ready_for_review"].includes(row.status))) { const key = duplicateKey(variance); groups.set(key, [...(groups.get(key) ?? []), variance]); }
    return groups;
  }, [variances]);
  const queues = [
    { key: "draft", title: "Draft", description: "Build funding routes and prepare for review", rows: variances.filter((row) => ["draft", "ready_for_review", "denied"].includes(row.status)) },
    { key: "submitted", title: "Submitted", description: "Waiting for approval", rows: variances.filter((row) => row.status === "submitted") },
    { key: "approved", title: "Approved", description: "Approved and ready to post", rows: variances.filter((row) => row.status === "approved") },
    { key: "posted", title: "Posted", description: "Completed variances", rows: variances.filter((row) => row.status === "posted") }
  ];
  function setActive(id: string | null) { const params = new URLSearchParams(searchParams.toString()); if (id) params.set("varianceId", id); else params.delete("varianceId"); const query = params.toString(); router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false }); }
  const duplicates = activeVariance ? (duplicateGroups.get(duplicateKey(activeVariance)) ?? []).filter((row) => row.id !== activeVariance.id) : [];
  return <>
    <div className="varianceQueueGrid">{queues.map((queue) => <section className="panel varianceQueue" key={queue.key}><header><div><h2>{queue.title}</h2><p className="helperText">{queue.description}</p></div><span className="varianceQueueCount">{queue.rows.length}</span></header><div className="varianceQueueList">{queue.rows.map((variance) => <QueueCard key={variance.id} variance={variance} duplicateCount={(duplicateGroups.get(duplicateKey(variance))?.length ?? 1) - 1} onOpen={() => setActive(variance.id)} />)}{queue.rows.length === 0 ? <p className="varianceQueueEmpty">Nothing in this queue.</p> : null}</div></section>)}</div>
    <SideDrawer open={Boolean(activeVariance)} onClose={() => setActive(null)} eyebrow={activeVariance?.fiscalYearName ?? "Variance"} title={activeVariance?.purchaseTitle ?? "Institutional variance"} description={activeVariance ? `${activeVariance.projectName ?? "Organization budget"} · ${statusLabel(activeVariance.status)}` : undefined} closeLabel="Close variance drawer">
      {activeVariance ? <div className="varianceDrawerBody"><FundingSummary variance={activeVariance} />{activeVariance.reason ? <ActionNotice tone="info">{activeVariance.reason}</ActionNotice> : null}<DuplicateControls variance={activeVariance} duplicates={duplicates} /><TargetLineList variance={activeVariance} /><ExistingSources variance={activeVariance} onRequestRemove={(lineId) => setConfirmAction({ kind: "source", lineId })} registerForm={(lineId, node) => { if (node) sourceDeleteForms.current.set(lineId, node); else sourceDeleteForms.current.delete(lineId); }} /><SourceRouting variance={activeVariance} sourceCandidates={sourceCandidates} /><DrawerControls variance={activeVariance} canApprove={canApprove} onDelete={() => setConfirmAction({ kind: "draft" })} /><form ref={deleteFormRef} action={deleteAction}><input type="hidden" name="varianceRequestId" value={activeVariance.id} /></form><StateMessage state={deleteState} /></div> : null}
    </SideDrawer>
    <ConfirmationDialog open={Boolean(confirmAction)} onClose={() => setConfirmAction(null)} title={confirmAction?.kind === "draft" ? "Delete variance draft?" : "Remove source bucket?"} description={confirmAction?.kind === "draft" ? "This removes the draft and all of its source lines. This cannot be undone." : "The source bucket will be removed from this draft."} confirmLabel={confirmAction?.kind === "draft" ? "Delete draft" : "Remove source"} dangerous onConfirm={() => { if (confirmAction?.kind === "draft") deleteFormRef.current?.requestSubmit(); else if (confirmAction?.kind === "source") sourceDeleteForms.current.get(confirmAction.lineId)?.requestSubmit(); setConfirmAction(null); }} />
  </>;
}
