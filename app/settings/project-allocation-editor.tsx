"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  deleteAllocationLineAction,
  updateAllocationLineInlineAction,
  type ActionState
} from "@/app/settings/actions";
import { GLOBAL_FISCAL_YEAR_STORAGE_KEY, resolveCurrentFiscalYearId } from "@/lib/fiscal-year-context";
import type { AccountCodeAdminRow, FiscalYearOption, HierarchyRow, OrganizationOption } from "@/lib/db";
import { formatCurrency } from "@/lib/format";

type Props = {
  fiscalYears: FiscalYearOption[];
  organizations: OrganizationOption[];
  hierarchyRows: HierarchyRow[];
  accountCodes: AccountCodeAdminRow[];
};

type EditableLine = HierarchyRow & {
  budgetLineId: string;
};

type ProjectGroup = {
  projectId: string;
  projectName: string;
  season: string | null;
  organizationId: string | null;
  organizationLabel: string;
  fiscalYearId: string | null;
  lines: EditableLine[];
};

const initialState: ActionState = { ok: true, message: "", timestamp: 0 };

function AllocationSaveButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="tinyButton" disabled={pending}>
      {pending ? "Saving..." : "Save"}
    </button>
  );
}

function AllocationDeleteButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="tinyButton dangerButton" disabled={pending}>
      {pending ? "Deleting..." : "Delete"}
    </button>
  );
}

function AllocationLineRow({ line, accountLabel }: { line: EditableLine; accountLabel: string }) {
  const [saveState, saveAction] = useActionState(updateAllocationLineInlineAction, initialState);
  const [deleteState, deleteAction] = useActionState(deleteAllocationLineAction, initialState);
  const [amount, setAmount] = useState(String(line.allocatedAmount ?? 0));
  const [active, setActive] = useState(Boolean(line.budgetLineActive));

  useEffect(() => {
    setAmount(String(line.allocatedAmount ?? 0));
    setActive(Boolean(line.budgetLineActive));
  }, [line.allocatedAmount, line.budgetLineActive]);

  const changed = Number.parseFloat(amount || "0") !== (line.allocatedAmount ?? 0) || active !== Boolean(line.budgetLineActive);
  const latestState = deleteState.message ? deleteState : saveState;

  return (
    <tr className={changed ? "allocationDirtyRow" : ""}>
      <td className="allocationLineName">
        <strong>{line.budgetLineName ?? line.budgetCategory ?? "Budget line"}</strong>
        <div className="muted">{line.budgetCode ?? "CATEGORY"}</div>
      </td>
      <td>{accountLabel}</td>
      <td>
        <form action={saveAction} className="allocationInlineForm">
          <input type="hidden" name="id" value={line.budgetLineId} />
          <input type="hidden" name="projectId" value={line.projectId} />
          <input
            aria-label={`Allocated amount for ${line.budgetLineName ?? line.budgetCategory ?? "budget line"}`}
            name="allocatedAmount"
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
          <label className="inlineCheckbox">
            <input name="active" type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />
            Active
          </label>
          <AllocationSaveButton />
        </form>
        {latestState.message ? (
          <p className={latestState.ok ? "successNote compactNote" : "errorNote compactNote"} key={latestState.timestamp}>
            {latestState.message}
          </p>
        ) : null}
      </td>
      <td>{line.sortOrder ?? "-"}</td>
      <td>
        <form
          action={deleteAction}
          onSubmit={(event) => {
            if (!window.confirm("Delete this unused allocation line? This cannot be undone.")) {
              event.preventDefault();
            }
          }}
        >
          <input type="hidden" name="id" value={line.budgetLineId} />
          <input type="hidden" name="projectId" value={line.projectId} />
          <AllocationDeleteButton />
        </form>
      </td>
    </tr>
  );
}

export function ProjectAllocationEditor({ fiscalYears, organizations, hierarchyRows, accountCodes }: Props) {
  const [fiscalYearId, setFiscalYearId] = useState(resolveCurrentFiscalYearId(fiscalYears));
  const [organizationId, setOrganizationId] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(GLOBAL_FISCAL_YEAR_STORAGE_KEY);
    if (saved && fiscalYears.some((fy) => fy.id === saved)) {
      setFiscalYearId(saved);
    }
  }, [fiscalYears]);

  useEffect(() => {
    if (typeof window === "undefined" || !fiscalYearId) return;
    window.localStorage.setItem(GLOBAL_FISCAL_YEAR_STORAGE_KEY, fiscalYearId);
  }, [fiscalYearId]);

  const accountById = useMemo(() => new Map(accountCodes.map((account) => [account.id, account] as const)), [accountCodes]);

  const organizationOptions = useMemo(() => {
    return organizations.filter((org) => !fiscalYearId || org.fiscalYearId === fiscalYearId || org.fiscalYearId === null);
  }, [fiscalYearId, organizations]);

  const groupedProjects = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const grouped = new Map<string, ProjectGroup>();

    for (const row of hierarchyRows) {
      if (!row.budgetLineId) continue;
      if (fiscalYearId && row.fiscalYearId !== fiscalYearId) continue;
      if (organizationId && row.organizationId !== organizationId) continue;

      const account = row.accountCodeId ? accountById.get(row.accountCodeId) : null;
      const searchable = [
        row.orgCode,
        row.organizationName,
        row.projectName,
        row.season,
        row.budgetCode,
        row.budgetCategory,
        row.budgetLineName,
        account?.code,
        account?.category,
        account?.name
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (normalizedQuery && !searchable.includes(normalizedQuery)) continue;

      const key = row.projectId;
      if (!grouped.has(key)) {
        grouped.set(key, {
          projectId: row.projectId,
          projectName: row.projectName,
          season: row.season,
          organizationId: row.organizationId,
          organizationLabel: [row.orgCode, row.organizationName].filter(Boolean).join(" | ") || "No organization",
          fiscalYearId: row.fiscalYearId,
          lines: []
        });
      }
      grouped.get(key)!.lines.push(row as EditableLine);
    }

    return Array.from(grouped.values()).sort((a, b) =>
      a.organizationLabel.localeCompare(b.organizationLabel) || a.projectName.localeCompare(b.projectName)
    );
  }, [accountById, fiscalYearId, hierarchyRows, organizationId, query]);

  const allocationTotal = groupedProjects.reduce(
    (sum, project) => sum + project.lines.reduce((lineSum, line) => lineSum + (line.allocatedAmount ?? 0), 0),
    0
  );

  return (
    <article className="panel allocationEditorPanel">
      <div className="sectionHeader compactHeader">
        <div>
          <p className="eyebrow">Settings</p>
          <h2>Project Allocation Editor</h2>
        </div>
        <div className="allocationSummary">{formatCurrency(allocationTotal)} visible</div>
      </div>

      <div className="panelGrid allocationEditorFilters">
        <label>
          Fiscal Year
          <select value={fiscalYearId} onChange={(event) => setFiscalYearId(event.target.value)}>
            {fiscalYears.map((fy) => (
              <option key={fy.id} value={fy.id}>
                {fy.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Organization
          <select value={organizationId} onChange={(event) => setOrganizationId(event.target.value)}>
            <option value="">All organizations</option>
            {organizationOptions.map((organization) => (
              <option key={organization.id} value={organization.id}>
                {organization.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Search
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Project, category, account, or org"
          />
        </label>
      </div>

      <div className="allocationMatrix">
        {groupedProjects.length === 0 ? <p className="helperText">No allocation lines match the selected filters.</p> : null}
        {groupedProjects.map((project) => (
          <section key={project.projectId} className="allocationProjectGroup">
            <header>
              <div>
                <p className="eyebrow">{project.organizationLabel}</p>
                <h3>
                  {project.projectName}
                  {project.season ? ` (${project.season})` : ""}
                </h3>
              </div>
              <span>{formatCurrency(project.lines.reduce((sum, line) => sum + (line.allocatedAmount ?? 0), 0))}</span>
            </header>
            <div className="tableWrap">
              <table className="allocationEditorTable">
                <thead>
                  <tr>
                    <th>Category / Line</th>
                    <th>Account Code</th>
                    <th>Allocation</th>
                    <th>Order</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {project.lines
                    .slice()
                    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || String(a.budgetLineName ?? "").localeCompare(String(b.budgetLineName ?? "")))
                    .map((line) => {
                      const account = line.accountCodeId ? accountById.get(line.accountCodeId) : null;
                      const accountLabel = account ? `${account.code} | ${account.name}` : "No account code";
                      return <AllocationLineRow key={line.budgetLineId} line={line} accountLabel={accountLabel} />;
                    })}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>
    </article>
  );
}
