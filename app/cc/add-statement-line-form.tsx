"use client";

import { useEffect, useState } from "react";
import { addStatementLineAction } from "@/app/cc/actions";

type BudgetLineOption = {
  id: string;
  label: string;
};

export function AddStatementLineForm({
  statementMonthId,
  budgetLines
}: {
  statementMonthId: string;
  budgetLines: BudgetLineOption[];
}) {
  const [projectBudgetLineId, setProjectBudgetLineId] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem("tba_cc_budget_line_id");
    if (saved) setProjectBudgetLineId(saved);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("tba_cc_budget_line_id", projectBudgetLineId);
  }, [projectBudgetLineId]);

  return (
    <form action={addStatementLineAction} className="inlineEditForm">
      <input type="hidden" name="statementMonthId" value={statementMonthId} />
      <select
        name="projectBudgetLineId"
        required
        value={projectBudgetLineId}
        onChange={(event) => setProjectBudgetLineId(event.target.value)}
      >
        <option value="">Budget line</option>
        {budgetLines.map((line) => (
          <option key={line.id} value={line.id}>
            {line.label}
          </option>
        ))}
      </select>
      <input name="amount" type="number" step="0.01" placeholder="Amount" required />
      <input name="note" placeholder="Optional note" />
      <button type="submit" className="tinyButton">
        Add Statement Line
      </button>
    </form>
  );
}
