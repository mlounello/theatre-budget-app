"use client";

import { useActionState } from "react";
import { bulkCreateBudgetPlansAction } from "@/app/budget-planning/actions";

type ActionState = {
  ok: boolean;
  message: string;
  timestamp: number;
};

const initialState: ActionState = { ok: true, message: "", timestamp: 0 };

type BudgetPlanningBulkActionsProps = {
  fiscalYearId: string;
  organizationId: string;
  sourceFiscalYearId: string;
  bulkPlanAccountCodesJson: string;
  visibleWithoutPlanCount: number;
};

export function BudgetPlanningBulkActions({
  fiscalYearId,
  organizationId,
  sourceFiscalYearId,
  bulkPlanAccountCodesJson,
  visibleWithoutPlanCount
}: BudgetPlanningBulkActionsProps) {
  const [state, formAction] = useActionState(bulkCreateBudgetPlansAction, initialState);

  return (
    <form action={formAction} className="panelGrid">
      <input type="hidden" name="fiscalYearId" value={fiscalYearId} />
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="sourceFiscalYearId" value={sourceFiscalYearId} />
      <input type="hidden" name="bulkPlanAccountCodesJson" value={bulkPlanAccountCodesJson} />
      <div>
        <button className="buttonPrimary" type="submit" disabled={visibleWithoutPlanCount === 0}>
          Create empty plans for visible rows without a plan
        </button>
        <p className="helperText">Applies to {visibleWithoutPlanCount} rows. Existing plans are not overwritten.</p>
        {state.message ? <p className={state.ok ? "successNote" : "errorNote"}>{state.message}</p> : null}
      </div>
    </form>
  );
}
