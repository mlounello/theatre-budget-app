"use client";

import { useMemo, useState } from "react";
import { createRequest } from "@/app/requests/actions";
import type { AccountCodeOption, ProjectBudgetLineOption } from "@/lib/db";

type AllocationRow = {
  id: string;
  reportingBudgetLineId: string;
  accountCodeId: string;
  amount: string;
  reportingBucket: "direct" | "miscellaneous";
};

type Props = {
  budgetLineOptions: ProjectBudgetLineOption[];
  accountCodeOptions: AccountCodeOption[];
};

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function CreateRequestForm({ budgetLineOptions, accountCodeOptions }: Props) {
  const [useSplits, setUseSplits] = useState(false);
  const [rows, setRows] = useState<AllocationRow[]>([
    {
      id: uid(),
      reportingBudgetLineId: "",
      accountCodeId: "",
      amount: "",
      reportingBucket: "direct"
    }
  ]);

  const allocationsJson = useMemo(
    () =>
      JSON.stringify(
        rows
          .filter((row) => row.reportingBudgetLineId && row.accountCodeId && row.amount)
          .map((row) => ({
            reportingBudgetLineId: row.reportingBudgetLineId,
            accountCodeId: row.accountCodeId,
            amount: Number.parseFloat(row.amount || "0"),
            reportingBucket: row.reportingBucket
          }))
      ),
    [rows]
  );

  const primaryBudgetLineId = rows[0]?.reportingBudgetLineId ?? "";

  return (
    <form className="requestForm" action={createRequest}>
      <label>
        Budget Line
        <select name="budgetLineId" required={!useSplits} disabled={useSplits}>
          <option value="">Select budget line</option>
          {budgetLineOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label className="checkboxLabel">
        <input type="checkbox" checked={useSplits} onChange={(event) => setUseSplits(event.target.checked)} />
        Use split allocations
      </label>

      {useSplits ? (
        <div className="splitAllocations">
          <input type="hidden" name="budgetLineId" value={primaryBudgetLineId} />
          <input type="hidden" name="allocationsJson" value={allocationsJson} />
          {rows.map((row, index) => (
            <div key={row.id} className="splitRow">
              <select
                value={row.reportingBudgetLineId}
                onChange={(event) =>
                  setRows((prev) =>
                    prev.map((item) =>
                      item.id === row.id ? { ...item, reportingBudgetLineId: event.target.value } : item
                    )
                  )
                }
              >
                <option value="">Reporting line</option>
                {budgetLineOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>

              <select
                value={row.accountCodeId}
                onChange={(event) =>
                  setRows((prev) => prev.map((item) => (item.id === row.id ? { ...item, accountCodeId: event.target.value } : item)))
                }
              >
                <option value="">Account code</option>
                {accountCodeOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>

              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="Amount"
                value={row.amount}
                onChange={(event) =>
                  setRows((prev) => prev.map((item) => (item.id === row.id ? { ...item, amount: event.target.value } : item)))
                }
              />

              <select
                value={row.reportingBucket}
                onChange={(event) =>
                  setRows((prev) =>
                    prev.map((item) =>
                      item.id === row.id
                        ? { ...item, reportingBucket: event.target.value === "miscellaneous" ? "miscellaneous" : "direct" }
                        : item
                    )
                  )
                }
              >
                <option value="direct">Direct Bucket</option>
                <option value="miscellaneous">Miscellaneous Bucket</option>
              </select>

              {index > 0 ? (
                <button
                  type="button"
                  className="tinyButton"
                  onClick={() => setRows((prev) => prev.filter((item) => item.id !== row.id))}
                >
                  Remove
                </button>
              ) : null}
            </div>
          ))}
          <button
            type="button"
            className="tinyButton"
            onClick={() =>
              setRows((prev) => [
                ...prev,
                { id: uid(), reportingBudgetLineId: "", accountCodeId: "", amount: "", reportingBucket: "direct" }
              ])
            }
          >
            Add Split Row
          </button>
        </div>
      ) : null}

      <label>
        Title
        <input name="title" required placeholder="Ex: Scenic hardware" />
      </label>
      <label>
        Reference #
        <input name="referenceNumber" placeholder="EP/EC/J code" />
      </label>
      <label>
        Estimated
        <input name="estimatedAmount" type="number" step="0.01" min="0" />
      </label>
      <label>
        Requested
        <input name="requestedAmount" type="number" step="0.01" min="0" />
      </label>
      <button type="submit" className="buttonLink buttonPrimary">
        Create Request
      </button>
    </form>
  );
}
