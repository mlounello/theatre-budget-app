"use client";

import { useMemo, useState } from "react";
import type { AccountCodeOption } from "@/lib/db";
import type { BudgetPlanMonthRow, BudgetPlanRow, MonthlyActualByOrgAccountRow } from "@/lib/types";
import { formatCurrency } from "@/lib/format";
import { updateBudgetPlanMonthsAction, upsertBudgetPlanAnnualAmountAction } from "@/app/budget-planning/actions";

type MonthValue = {
  id: string;
  monthStart: string;
  amount: number;
};

type BudgetPlanningRowProps = {
  accountCode: AccountCodeOption;
  plan: BudgetPlanRow | null;
  months: BudgetPlanMonthRow[];
  actuals: MonthlyActualByOrgAccountRow[];
  fiscalYearId: string;
  organizationId: string;
};

function formatMonthLabel(dateValue: string): string {
  const date = new Date(`${dateValue}T00:00:00Z`);
  return new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" }).format(date);
}

function resolvePlanSource(plan: BudgetPlanRow | null, months: BudgetPlanMonthRow[], priorTotal: number): string {
  if (!plan) return priorTotal > 0 ? "historical" : "none";
  if (months.length === 0) return "none";
  const sources = new Set(months.map((month) => month.source));
  if (sources.has("manual")) return "manual";
  if (sources.size === 1 && sources.has("even")) return "even";
  return "historical";
}

export function BudgetPlanningRow({
  accountCode,
  plan,
  months,
  actuals,
  fiscalYearId,
  organizationId
}: BudgetPlanningRowProps) {
  const priorTotal = actuals.reduce((sum, row) => sum + row.postedAmount, 0);
  const planSource = resolvePlanSource(plan, months, priorTotal);
  const actualsByMonth = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of actuals) {
      map.set(row.monthStart, (map.get(row.monthStart) ?? 0) + row.postedAmount);
    }
    return map;
  }, [actuals]);

  const [monthValues, setMonthValues] = useState<MonthValue[]>(
    months.map((month) => ({
      id: month.id,
      monthStart: month.monthStart,
      amount: month.amount
    }))
  );

  const monthUpdatesJson = useMemo(
    () => JSON.stringify(monthValues.map((month) => ({ id: month.id, monthStart: month.monthStart, amount: month.amount }))),
    [monthValues]
  );

  const annualAmount = plan?.annualAmount ?? 0;
  const monthsReady = months.length === 12;

  return (
    <>
      <tr>
        <td>{accountCode.label}</td>
        <td>{formatCurrency(priorTotal)}</td>
        <td>
          <form action={upsertBudgetPlanAnnualAmountAction}>
            <input type="hidden" name="fiscalYearId" value={fiscalYearId} />
            <input type="hidden" name="organizationId" value={organizationId} />
            <input type="hidden" name="accountCodeId" value={accountCode.id} />
            <input type="hidden" name="sourceFiscalYearId" value={fiscalYearId} />
            <input
              type="number"
              name="annualAmount"
              min="0"
              step="0.01"
              defaultValue={annualAmount.toFixed(2)}
              aria-label={`Annual plan for ${accountCode.label}`}
            />
            <button className="buttonPrimary" type="submit">
              {plan ? "Save" : "Create"}
            </button>
          </form>
        </td>
        <td>{planSource}</td>
        <td>{plan ? "Plan active" : "No plan yet"}</td>
      </tr>
      <tr>
        <td colSpan={5}>
          <details>
            <summary>Monthly details</summary>
            {!plan && <p className="helperText">Create a plan to edit monthly values.</p>}
            {plan && !monthsReady && (
              <p className="errorNote">This plan does not have 12 fiscal months yet. Save the annual plan to regenerate.</p>
            )}
            {plan && monthsReady && (
              <form action={updateBudgetPlanMonthsAction}>
                <input type="hidden" name="budgetPlanId" value={plan.id} />
                <input type="hidden" name="fiscalYearId" value={fiscalYearId} />
                <input type="hidden" name="organizationId" value={organizationId} />
                <input type="hidden" name="monthUpdatesJson" value={monthUpdatesJson} />
                <div className="tableWrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Month</th>
                        <th>Historical Actuals</th>
                        <th>Planned Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthValues.map((month) => (
                        <tr key={month.id}>
                          <td>{formatMonthLabel(month.monthStart)}</td>
                          <td>{formatCurrency(actualsByMonth.get(month.monthStart) ?? 0)}</td>
                          <td>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={month.amount.toFixed(2)}
                              onChange={(event) => {
                                const value = Number.parseFloat(event.target.value);
                                setMonthValues((prev) =>
                                  prev.map((entry) =>
                                    entry.id === month.id
                                      ? {
                                          ...entry,
                                          amount: Number.isFinite(value) ? value : 0
                                        }
                                      : entry
                                  )
                                );
                              }}
                              aria-label={`Planned amount for ${accountCode.label} ${month.monthStart}`}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button className="buttonPrimary" type="submit">
                  Save monthly changes
                </button>
              </form>
            )}
          </details>
        </td>
      </tr>
    </>
  );
}
