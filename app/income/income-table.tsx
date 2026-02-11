"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { deleteIncomeEntryAction, updateIncomeEntryAction } from "@/app/income/actions";
import { formatCurrency } from "@/lib/format";
import type { IncomeRow, OrganizationOption } from "@/lib/db";

function typeLabel(type: IncomeRow["incomeType"]): string {
  if (type === "starting_budget") return "Starting Budget";
  if (type === "donation") return "Donation";
  if (type === "ticket_sales") return "Ticket Sales";
  return "Other";
}

type SortKey = "projectName" | "organizationLabel" | "incomeType" | "lineName" | "referenceNumber" | "amount" | "receivedOn";
type SortDirection = "asc" | "desc";
const SORT_KEYS: SortKey[] = ["projectName", "organizationLabel", "incomeType", "lineName", "referenceNumber", "amount", "receivedOn"];

function asString(value: string | null | undefined): string {
  return (value ?? "").toLowerCase();
}

function sortRows(rows: IncomeRow[], key: SortKey, direction: SortDirection): IncomeRow[] {
  const dir = direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const aVal = key === "amount" ? a.amount : asString(a[key] as string | null);
    const bVal = key === "amount" ? b.amount : asString(b[key] as string | null);
    if (typeof aVal === "number" && typeof bVal === "number") return (aVal - bVal) * dir;
    return String(aVal).localeCompare(String(bVal)) * dir;
  });
}

function SortTh({
  label,
  sortKey,
  activeKey,
  direction,
  onToggle
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  direction: SortDirection;
  onToggle: (key: SortKey) => void;
}) {
  const active = sortKey === activeKey;
  return (
    <th>
      <button type="button" className="sortHeaderButton" onClick={() => onToggle(sortKey)}>
        {label} {active ? (direction === "asc" ? "▲" : "▼") : ""}
      </button>
    </th>
  );
}

export function IncomeTable({ rows, organizations }: { rows: IncomeRow[]; organizations: OrganizationOption[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [editingId, setEditingId] = useState<string | null>(null);
  const sortFromUrl = searchParams.get("inc_sort");
  const dirFromUrl = searchParams.get("inc_dir");
  const [sortKey, setSortKey] = useState<SortKey>(
    sortFromUrl && SORT_KEYS.includes(sortFromUrl as SortKey) ? (sortFromUrl as SortKey) : "receivedOn"
  );
  const [direction, setDirection] = useState<SortDirection>(dirFromUrl === "asc" ? "asc" : "desc");
  const editingRow = rows.find((row) => row.id === editingId) ?? null;
  const sortedRows = useMemo(() => sortRows(rows, sortKey, direction), [rows, sortKey, direction]);

  function onToggle(key: SortKey): void {
    const nextDirection: SortDirection = key === sortKey ? (direction === "asc" ? "desc" : "asc") : "asc";
    const params = new URLSearchParams(searchParams.toString());
    params.set("inc_sort", key);
    params.set("inc_dir", nextDirection);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });

    if (key === sortKey) {
      setDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setDirection("asc");
  }

  return (
    <>
      <div className="tableWrap">
        <table>
          <thead>
            <tr>
              <SortTh label="Project" sortKey="projectName" activeKey={sortKey} direction={direction} onToggle={onToggle} />
              <SortTh
                label="Organization"
                sortKey="organizationLabel"
                activeKey={sortKey}
                direction={direction}
                onToggle={onToggle}
              />
              <SortTh label="Type" sortKey="incomeType" activeKey={sortKey} direction={direction} onToggle={onToggle} />
              <SortTh label="Description" sortKey="lineName" activeKey={sortKey} direction={direction} onToggle={onToggle} />
              <SortTh label="Reference" sortKey="referenceNumber" activeKey={sortKey} direction={direction} onToggle={onToggle} />
              <SortTh label="Amount" sortKey="amount" activeKey={sortKey} direction={direction} onToggle={onToggle} />
              <SortTh label="Received" sortKey="receivedOn" activeKey={sortKey} direction={direction} onToggle={onToggle} />
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.length === 0 ? (
              <tr>
                <td colSpan={8}>No income entries yet.</td>
              </tr>
            ) : null}
            {sortedRows.map((row) => (
              <tr key={row.id}>
                <td>{row.projectName ?? "-"}</td>
                <td>{row.organizationLabel}</td>
                <td>{typeLabel(row.incomeType)}</td>
                <td>{row.lineName}</td>
                <td>{row.referenceNumber ?? "-"}</td>
                <td>{formatCurrency(row.amount)}</td>
                <td>{row.receivedOn ?? "-"}</td>
                <td className="actionCell">
                  <button type="button" className="tinyButton" onClick={() => setEditingId(row.id)}>
                    Edit
                  </button>
                  <form action={deleteIncomeEntryAction}>
                    <input type="hidden" name="id" value={row.id} />
                    <button
                      type="submit"
                      className="tinyButton dangerButton"
                      onClick={(event) => {
                        if (!window.confirm("Delete this income entry?")) event.preventDefault();
                      }}
                    >
                      Trash
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editingRow ? (
        <div className="modalOverlay" role="dialog" aria-modal="true" aria-label="Edit income entry">
          <div className="modalPanel">
            <h2>Edit Income Entry</h2>
            <form action={updateIncomeEntryAction} className="requestForm">
              <input type="hidden" name="id" value={editingRow.id} />
              <label>
                Organization
                <select name="organizationId" defaultValue={editingRow.organizationId ?? ""} required>
                  <option value="">Select organization</option>
                  {organizations.map((organization) => (
                    <option key={organization.id} value={organization.id}>
                      {organization.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Income Type
                <select name="incomeType" defaultValue={editingRow.incomeType} required>
                  <option value="starting_budget">Starting Budget</option>
                  <option value="donation">Donation</option>
                  <option value="ticket_sales">Ticket Sales</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label>
                Description
                <input name="lineName" defaultValue={editingRow.lineName} />
              </label>
              <label>
                Reference
                <input name="referenceNumber" defaultValue={editingRow.referenceNumber ?? ""} />
              </label>
              <label>
                Amount
                <input name="amount" type="number" step="0.01" defaultValue={editingRow.amount} required />
              </label>
              <label>
                Received On
                <input name="receivedOn" type="date" defaultValue={editingRow.receivedOn ?? ""} />
              </label>
              <div className="modalActions">
                <button type="button" className="tinyButton" onClick={() => setEditingId(null)}>
                  Cancel
                </button>
                <button type="submit" className="buttonLink buttonPrimary">
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
