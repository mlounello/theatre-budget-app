"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { saveBudgetPlanningMatrixAction, type ActionState } from "@/app/budget-planning/actions";
import { ActionNotice } from "@/components/ui/action-notice";
import { PendingButton } from "@/components/ui/pending-button";
import { StatusPill } from "@/components/ui/status-controls";
import { formatCurrency } from "@/lib/format";

export type BudgetPlanningMatrixRow = {
  accountCodeId: string;
  code: string;
  category: string;
  name: string;
  isRevenue: boolean;
  planId: string | null;
  planSource: string;
  monthStarts: string[];
  plannedAmounts: number[];
  priorAmounts: number[];
};

type Props = {
  fiscalYearId: string;
  organizationId: string;
  sourceFiscalYearId: string;
  monthLabels: string[];
  priorFiscalYearName: string | null;
  rows: BudgetPlanningMatrixRow[];
};

const initialState: ActionState = { ok: true, message: "", timestamp: 0 };

function normalizeAmount(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) / 100 : 0;
}

function initialValues(rows: BudgetPlanningMatrixRow[]): Record<string, string[]> {
  return Object.fromEntries(rows.map((row) => [row.accountCodeId, row.plannedAmounts.map((amount) => amount.toFixed(2))]));
}

function PlanningSection({
  title,
  description,
  rows,
  values,
  dirtyIds,
  monthLabels,
  priorFiscalYearName,
  onChange
}: {
  title: string;
  description: string;
  rows: BudgetPlanningMatrixRow[];
  values: Record<string, string[]>;
  dirtyIds: Set<string>;
  monthLabels: string[];
  priorFiscalYearName: string | null;
  onChange: (accountCodeId: string, monthIndex: number, value: string) => void;
}) {
  if (rows.length === 0) return null;
  return (
    <section className="planningMatrixSection">
      <header className="planningMatrixSectionHeader">
        <div><h2>{title}</h2><p className="helperText">{description}</p></div>
        <StatusPill tone="neutral">{rows.length} account{rows.length === 1 ? "" : "s"}</StatusPill>
      </header>
      <div className="planningMatrixWrap" role="region" aria-label={`${title} monthly planning matrix`} tabIndex={0}>
        <table className="planningMatrix">
          <thead><tr><th className="planningStickyAccount">Account</th><th className="planningStickyPrior">{priorFiscalYearName ? `${priorFiscalYearName} actual` : "Prior actual"}</th><th className="planningStickyAnnual">Annual total</th>{monthLabels.map((label) => <th key={label}>{label}</th>)}</tr></thead>
          <tbody>{rows.map((row) => {
            const rowValues = values[row.accountCodeId] ?? row.plannedAmounts.map((amount) => amount.toFixed(2));
            const annualTotal = rowValues.reduce((sum, value) => sum + normalizeAmount(value), 0);
            const priorTotal = row.priorAmounts.reduce((sum, amount) => sum + amount, 0);
            const dirty = dirtyIds.has(row.accountCodeId);
            return <tr className={dirty ? "planningMatrixRow isDirty" : "planningMatrixRow"} key={row.accountCodeId}>
              <th scope="row" className="planningStickyAccount"><span className="planningAccountCode">{row.code}</span><span>{row.name || row.category}</span><small>{row.category}{row.planId ? ` · ${row.planSource}` : " · New plan"}</small>{dirty ? <StatusPill tone="warning">Unsaved</StatusPill> : null}</th>
              <td className="planningStickyPrior"><strong>{formatCurrency(priorTotal)}</strong></td>
              <td className="planningStickyAnnual"><strong>{formatCurrency(annualTotal)}</strong><small className={annualTotal >= priorTotal ? "positive" : "negative"}>{priorTotal === 0 ? "No prior activity" : `${annualTotal >= priorTotal ? "+" : ""}${formatCurrency(annualTotal - priorTotal)}`}</small></td>
              {row.monthStarts.map((monthStart, monthIndex) => <td key={monthStart}><label className="srOnly" htmlFor={`plan-${row.accountCodeId}-${monthIndex}`}>{row.code} planned amount for {monthLabels[monthIndex]}</label><input id={`plan-${row.accountCodeId}-${monthIndex}`} type="number" min="0" step="0.01" value={rowValues[monthIndex] ?? "0.00"} onChange={(event) => onChange(row.accountCodeId, monthIndex, event.target.value)} /><small>{priorFiscalYearName ? `Prior ${formatCurrency(row.priorAmounts[monthIndex] ?? 0)}` : "No prior year"}</small></td>)}
            </tr>;
          })}</tbody>
        </table>
      </div>
    </section>
  );
}

export function BudgetPlanningMatrix({ fiscalYearId, organizationId, sourceFiscalYearId, monthLabels, priorFiscalYearName, rows }: Props) {
  const [state, action] = useActionState(saveBudgetPlanningMatrixAction, initialState);
  const [values, setValues] = useState<Record<string, string[]>>(() => initialValues(rows));
  const [dirtyIds, setDirtyIds] = useState<Set<string>>(new Set());
  const rowSignature = useMemo(() => rows.map((row) => `${row.accountCodeId}:${row.plannedAmounts.join(",")}`).join("|"), [rows]);

  useEffect(() => { setValues(initialValues(rows)); setDirtyIds(new Set()); }, [rowSignature, rows]);
  useEffect(() => { if (state.ok && state.message) setDirtyIds(new Set()); }, [state]);
  useEffect(() => {
    if (dirtyIds.size === 0) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [dirtyIds.size]);

  function changeMonth(accountCodeId: string, monthIndex: number, value: string) {
    setValues((current) => ({ ...current, [accountCodeId]: (current[accountCodeId] ?? []).map((entry, index) => index === monthIndex ? value : entry) }));
    const row = rows.find((item) => item.accountCodeId === accountCodeId);
    if (!row) return;
    setDirtyIds((current) => {
      const next = new Set(current);
      const nextValues = [...(values[accountCodeId] ?? row.plannedAmounts.map((amount) => amount.toFixed(2)))];
      nextValues[monthIndex] = value;
      const changed = nextValues.some((entry, index) => normalizeAmount(entry) !== Math.round((row.plannedAmounts[index] ?? 0) * 100) / 100);
      if (changed) next.add(accountCodeId); else next.delete(accountCodeId);
      return next;
    });
  }

  const changedRows = rows.filter((row) => dirtyIds.has(row.accountCodeId)).map((row) => ({ accountCodeId: row.accountCodeId, planId: row.planId, months: row.monthStarts.map((monthStart, index) => ({ monthStart, amount: normalizeAmount(values[row.accountCodeId]?.[index] ?? "0") })) }));
  const expenses = rows.filter((row) => !row.isRevenue);
  const revenue = rows.filter((row) => row.isRevenue);

  return <form action={action} className="planningMatrixForm">
    <input type="hidden" name="fiscalYearId" value={fiscalYearId} /><input type="hidden" name="organizationId" value={organizationId} /><input type="hidden" name="sourceFiscalYearId" value={sourceFiscalYearId} /><input type="hidden" name="matrixUpdatesJson" value={JSON.stringify(changedRows)} />
    <PlanningSection title="Expense allocations" description="Monthly amounts available for spending. Annual totals update automatically as you type." rows={expenses} values={values} dirtyIds={dirtyIds} monthLabels={monthLabels} priorFiscalYearName={priorFiscalYearName} onChange={changeMonth} />
    <PlanningSection title="Revenue targets" description="Expected revenue by month. These targets are tracked against receipts and are never spendable funds." rows={revenue} values={values} dirtyIds={dirtyIds} monthLabels={monthLabels} priorFiscalYearName={priorFiscalYearName} onChange={changeMonth} />
    {state.message ? <ActionNotice tone={state.ok ? "success" : "error"}>{state.message}</ActionNotice> : null}
    <div className={dirtyIds.size > 0 ? "planningSaveBar isDirty" : "planningSaveBar"}><div><strong>{dirtyIds.size > 0 ? `${dirtyIds.size} unsaved account${dirtyIds.size === 1 ? "" : "s"}` : "All changes saved"}</strong><p className="helperText">One save updates every edited monthly row.</p></div><div><button type="button" className="tinyButton" disabled={dirtyIds.size === 0} onClick={() => { setValues(initialValues(rows)); setDirtyIds(new Set()); }}>Discard changes</button><PendingButton type="submit" className="buttonPrimary" disabled={dirtyIds.size === 0} pendingLabel="Saving changes…">Save changes</PendingButton></div></div>
  </form>;
}
