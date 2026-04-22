"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  bulkDeleteIncomeEntriesAction,
  bulkUpdateIncomeEntriesAction,
  deleteIncomeEntryAction,
  updateIncomeEntryAction,
  type ActionState
} from "@/app/income/actions";
import { formatCurrency } from "@/lib/format";
import type { AccountCodeOption, IncomeRow, OrganizationOption, ProductionCategoryOption } from "@/lib/db";

function typeLabel(type: IncomeRow["incomeType"]): string {
  if (type === "starting_budget") return "Starting Budget";
  if (type === "donation") return "Donation";
  if (type === "ticket_sales") return "Ticket Sales";
  return "Other";
}

type SortKey =
  | "projectName"
  | "organizationLabel"
  | "productionCategoryName"
  | "bannerAccountCode"
  | "incomeType"
  | "lineName"
  | "referenceNumber"
  | "amount"
  | "receivedOn";
type SortDirection = "asc" | "desc";
const SORT_KEYS: SortKey[] = [
  "projectName",
  "organizationLabel",
  "productionCategoryName",
  "bannerAccountCode",
  "incomeType",
  "lineName",
  "referenceNumber",
  "amount",
  "receivedOn"
];

const initialState: ActionState = { ok: true, message: "", timestamp: 0 };

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

export function IncomeTable({
  rows,
  organizations,
  accountCodeOptions,
  productionCategoryOptions
}: {
  rows: IncomeRow[];
  organizations: OrganizationOption[];
  accountCodeOptions: AccountCodeOption[];
  productionCategoryOptions: ProductionCategoryOption[];
}) {
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
  const [organizationFilter, setOrganizationFilter] = useState(searchParams.get("inc_f_org") ?? "");
  const [typeFilter, setTypeFilter] = useState(searchParams.get("inc_f_type") ?? "");
  const [categoryFilter, setCategoryFilter] = useState(searchParams.get("inc_f_cat") ?? "");
  const [queryFilter, setQueryFilter] = useState(searchParams.get("inc_f_q") ?? "");
  const editingRow = rows.find((row) => row.id === editingId) ?? null;
  const [editOrganizationId, setEditOrganizationId] = useState("");
  const [editIncomeType, setEditIncomeType] = useState<IncomeRow["incomeType"]>("other");
  const [editProductionCategoryId, setEditProductionCategoryId] = useState("");
  const [editBannerAccountCodeId, setEditBannerAccountCodeId] = useState("");
  const [editLineName, setEditLineName] = useState("");
  const [editReferenceNumber, setEditReferenceNumber] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editReceivedOn, setEditReceivedOn] = useState("");
  const lastEditIdRef = useRef<string | null>(null);
  const filteredRows = useMemo(() => {
    const q = queryFilter.trim().toLowerCase();
    return rows.filter((row) => {
      if (organizationFilter && row.organizationId !== organizationFilter) return false;
      if (typeFilter && row.incomeType !== typeFilter) return false;
      if (categoryFilter && (row.productionCategoryId ?? "") !== categoryFilter) return false;
      if (!q) return true;
      const haystack =
        `${row.projectName ?? ""} ${row.organizationLabel} ${row.productionCategoryName ?? ""} ${row.bannerAccountCode ?? ""} ${row.lineName} ${row.referenceNumber ?? ""}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [categoryFilter, organizationFilter, queryFilter, rows, typeFilter]);
  const sortedRows = useMemo(() => sortRows(filteredRows, sortKey, direction), [filteredRows, sortKey, direction]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const revenueAccountCodes = useMemo(
    () => accountCodeOptions.filter((accountCode) => accountCode.isRevenue),
    [accountCodeOptions]
  );
  const otherAccountCodes = useMemo(
    () => accountCodeOptions.filter((accountCode) => !accountCode.isRevenue),
    [accountCodeOptions]
  );
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedVisibleCount = useMemo(() => sortedRows.filter((row) => selectedSet.has(row.id)).length, [selectedSet, sortedRows]);
  const allVisibleSelected = sortedRows.length > 0 && selectedVisibleCount === sortedRows.length;
  const selectedIdsJson = JSON.stringify(selectedIds);

  const [updateState, updateAction] = useActionState(updateIncomeEntryAction, initialState);
  const [deleteState, deleteAction] = useActionState(deleteIncomeEntryAction, initialState);
  const [bulkUpdateState, bulkUpdateAction] = useActionState(bulkUpdateIncomeEntriesAction, initialState);
  const [bulkDeleteState, bulkDeleteAction] = useActionState(bulkDeleteIncomeEntriesAction, initialState);

  useEffect(() => {
    const editFromUrl = searchParams.get("inc_edit");
    setEditingId(editFromUrl ? editFromUrl : null);
    setBulkEditOpen(searchParams.get("inc_bulk") === "1");
  }, [searchParams]);

  useEffect(() => {
    if (!editingRow) {
      lastEditIdRef.current = null;
      return;
    }
    if (lastEditIdRef.current === editingRow.id) return;
    lastEditIdRef.current = editingRow.id;
    setEditOrganizationId(editingRow.organizationId ?? "");
    setEditIncomeType(editingRow.incomeType);
    setEditProductionCategoryId(editingRow.productionCategoryId ?? "");
    setEditBannerAccountCodeId(editingRow.bannerAccountCodeId ?? "");
    setEditLineName(editingRow.lineName ?? "");
    setEditReferenceNumber(editingRow.referenceNumber ?? "");
    setEditAmount(String(editingRow.amount ?? 0));
    setEditReceivedOn(editingRow.receivedOn ?? "");
  }, [editingRow]);

  function openEdit(id: string): void {
    const params = new URLSearchParams(searchParams.toString());
    params.set("inc_edit", id);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    setEditingId(id);
  }

  function closeEdit(): void {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("inc_edit");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    setEditingId(null);
  }

  function openBulkEdit(): void {
    const params = new URLSearchParams(searchParams.toString());
    params.set("inc_bulk", "1");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    setBulkEditOpen(true);
  }

  function closeBulkEdit(): void {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("inc_bulk");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    setBulkEditOpen(false);
  }

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

  function toggleRowSelection(id: string): void {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((entry) => entry !== id) : [...prev, id]));
  }

  function toggleSelectAllVisible(): void {
    setSelectedIds((prev) => {
      const visibleIds = sortedRows.map((row) => row.id);
      if (visibleIds.length === 0) return prev;
      const prevSet = new Set(prev);
      const allVisible = visibleIds.every((id) => prevSet.has(id));
      if (allVisible) return prev.filter((id) => !visibleIds.includes(id));
      return [...new Set([...prev, ...visibleIds])];
    });
  }

  useEffect(() => {
    if (!bulkDeleteState.ok && bulkDeleteState.message) return;
    if (!bulkDeleteState.message) return;
    setSelectedIds([]);
  }, [bulkDeleteState]);

  useEffect(() => {
    if (!bulkUpdateState.ok && bulkUpdateState.message) return;
    if (!bulkUpdateState.message) return;
    setBulkEditOpen(true);
  }, [bulkUpdateState]);

  return (
    <>
      {deleteState.message ? (
        <p className={deleteState.ok ? "successNote" : "errorNote"} key={deleteState.timestamp}>
          {deleteState.message}
        </p>
      ) : null}
      {bulkDeleteState.message ? (
        <p className={bulkDeleteState.ok ? "successNote" : "errorNote"} key={bulkDeleteState.timestamp}>
          {bulkDeleteState.message}
        </p>
      ) : null}

      <div className="bulkToolbar">
        <p className="bulkMeta">
          Selected: {selectedIds.length} total ({selectedVisibleCount} visible)
        </p>
        <div className="bulkActions">
          <button type="button" className="tinyButton" disabled={selectedIds.length === 0} onClick={openBulkEdit}>
            Bulk Edit
          </button>
          <form
            action={bulkDeleteAction}
            onSubmit={(event) => {
              if (!window.confirm(`Delete ${selectedIds.length} selected income entries?`)) {
                event.preventDefault();
              }
            }}
          >
            <input type="hidden" name="selectedIdsJson" value={selectedIdsJson} />
            <button type="submit" className="tinyButton dangerButton" disabled={selectedIds.length === 0}>
              Bulk Delete
            </button>
          </form>
        </div>
      </div>

      <div className="inlineFilters" style={{ marginBottom: "0.5rem" }}>
        <label>
          Organization
          <select value={organizationFilter} onChange={(event) => setOrganizationFilter(event.target.value)}>
            <option value="">All</option>
            {organizations.map((organization) => (
              <option key={organization.id} value={organization.id}>
                {organization.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Type
          <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
            <option value="">All</option>
            <option value="starting_budget">Starting Budget</option>
            <option value="donation">Donation</option>
            <option value="ticket_sales">Ticket Sales</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label>
          Department
          <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
            <option value="">All</option>
            {productionCategoryOptions.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Search
          <input value={queryFilter} onChange={(event) => setQueryFilter(event.target.value)} placeholder="Description, ref..." />
        </label>
      </div>

      <div className="tableWrap">
        <table>
          <thead>
            <tr>
              <th className="rowSelectHeader">
                <input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAllVisible} aria-label="Select all visible rows" />
              </th>
              <SortTh label="Project" sortKey="projectName" activeKey={sortKey} direction={direction} onToggle={onToggle} />
              <SortTh
                label="Organization"
                sortKey="organizationLabel"
                activeKey={sortKey}
                direction={direction}
                onToggle={onToggle}
              />
              <SortTh
                label="Department"
                sortKey="productionCategoryName"
                activeKey={sortKey}
                direction={direction}
                onToggle={onToggle}
              />
              <SortTh
                label="Banner Code"
                sortKey="bannerAccountCode"
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
                <td colSpan={11}>No income entries yet.</td>
              </tr>
            ) : null}
            {sortedRows.map((row) => (
              <tr key={row.id} id={`income-${row.id}`}>
                <td className="rowSelectCell">
                  <input type="checkbox" checked={selectedSet.has(row.id)} onChange={() => toggleRowSelection(row.id)} />
                </td>
                <td>{row.projectName ?? "-"}</td>
                <td>{row.organizationLabel}</td>
                <td>{row.productionCategoryName ?? "-"}</td>
                <td>{row.bannerAccountCode ?? "-"}</td>
                <td>{typeLabel(row.incomeType)}</td>
                <td>{row.lineName}</td>
                <td>{row.referenceNumber ?? "-"}</td>
                <td>{formatCurrency(row.amount)}</td>
                <td>{row.receivedOn ?? "-"}</td>
                <td className="actionCell">
                  <button type="button" className="tinyButton" onClick={() => openEdit(row.id)}>
                    Edit
                  </button>
                  <form action={deleteAction}>
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
            {updateState.message ? (
              <p className={updateState.ok ? "successNote" : "errorNote"} key={updateState.timestamp}>
                {updateState.message}
              </p>
            ) : null}
            <form action={updateAction} className="requestForm">
              <input type="hidden" name="id" value={editingRow.id} />
              <label>
                Organization
                <select
                  name="organizationId"
                  value={editOrganizationId}
                  onChange={(event) => setEditOrganizationId(event.target.value)}
                  required
                >
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
                <select
                  name="incomeType"
                  value={editIncomeType}
                  onChange={(event) => setEditIncomeType(event.target.value as IncomeRow["incomeType"])}
                  required
                >
                  <option value="starting_budget">Starting Budget</option>
                  <option value="donation">Donation</option>
                  <option value="ticket_sales">Ticket Sales</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label>
                Production Category
                <select
                  name="productionCategoryId"
                  value={editProductionCategoryId}
                  onChange={(event) => setEditProductionCategoryId(event.target.value)}
                >
                  <option value="">Unassigned</option>
                  {productionCategoryOptions.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Banner Account Code
                <select
                  name="bannerAccountCodeId"
                  value={editBannerAccountCodeId}
                  onChange={(event) => setEditBannerAccountCodeId(event.target.value)}
                >
                  <option value="">Unassigned</option>
                  {revenueAccountCodes.length > 0 ? (
                    <optgroup label="Revenue Accounts">
                      {revenueAccountCodes.map((accountCode) => (
                        <option key={accountCode.id} value={accountCode.id}>
                          {accountCode.label}
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                  {otherAccountCodes.length > 0 ? (
                    <optgroup label="Other Accounts">
                      {otherAccountCodes.map((accountCode) => (
                        <option key={accountCode.id} value={accountCode.id}>
                          {accountCode.label}
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                </select>
              </label>
              <label>
                Description
                <input name="lineName" value={editLineName} onChange={(event) => setEditLineName(event.target.value)} />
              </label>
              <label>
                Reference
                <input
                  name="referenceNumber"
                  value={editReferenceNumber}
                  onChange={(event) => setEditReferenceNumber(event.target.value)}
                />
              </label>
              <label>
                Amount
                <input
                  name="amount"
                  type="number"
                  step="0.01"
                  value={editAmount}
                  onChange={(event) => setEditAmount(event.target.value)}
                  required
                />
              </label>
              <label>
                Received On
                <input
                  name="receivedOn"
                  type="date"
                  value={editReceivedOn}
                  onChange={(event) => setEditReceivedOn(event.target.value)}
                />
              </label>
              <div className="modalActions">
                <button type="button" className="tinyButton" onClick={closeEdit}>
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

      {bulkEditOpen ? (
        <div className="modalOverlay" role="dialog" aria-modal="true" aria-label="Bulk edit income entries">
          <div className="modalPanel">
            <h2>Bulk Edit Income Entries</h2>
            <p className="heroSubtitle">Only checked fields are applied to all selected rows.</p>
            {bulkUpdateState.message ? (
              <p className={bulkUpdateState.ok ? "successNote" : "errorNote"} key={bulkUpdateState.timestamp}>
                {bulkUpdateState.message}
              </p>
            ) : null}
            <form action={bulkUpdateAction} className="requestForm">
              <input type="hidden" name="selectedIdsJson" value={selectedIdsJson} />
              <label className="checkboxLabel">
                <input name="applyOrganization" type="checkbox" />
                Apply Organization
              </label>
              <label>
                Organization
                <select name="organizationId">
                  <option value="">Select organization</option>
                  {organizations.map((organization) => (
                    <option key={organization.id} value={organization.id}>
                      {organization.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="checkboxLabel">
                <input name="applyIncomeType" type="checkbox" />
                Apply Income Type
              </label>
              <label>
                Income Type
                <select name="incomeType" defaultValue="other">
                  <option value="starting_budget">Starting Budget</option>
                  <option value="donation">Donation</option>
                  <option value="ticket_sales">Ticket Sales</option>
                  <option value="other">Other</option>
                </select>
              </label>

              <label className="checkboxLabel">
                <input name="applyProductionCategory" type="checkbox" />
                Apply Department
              </label>
              <label>
                Department
                <select name="productionCategoryId">
                  <option value="">Unassigned</option>
                  {productionCategoryOptions.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="checkboxLabel">
                <input name="applyBannerAccountCode" type="checkbox" />
                Apply Banner Code
              </label>
              <label>
                Banner Code
                <select name="bannerAccountCodeId">
                  <option value="">Unassigned</option>
                  {revenueAccountCodes.length > 0 ? (
                    <optgroup label="Revenue Accounts">
                      {revenueAccountCodes.map((accountCode) => (
                        <option key={accountCode.id} value={accountCode.id}>
                          {accountCode.label}
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                  {otherAccountCodes.length > 0 ? (
                    <optgroup label="Other Accounts">
                      {otherAccountCodes.map((accountCode) => (
                        <option key={accountCode.id} value={accountCode.id}>
                          {accountCode.label}
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                </select>
              </label>

              <label className="checkboxLabel">
                <input name="applyLineName" type="checkbox" />
                Apply Description
              </label>
              <label>
                Description
                <input name="lineName" />
              </label>

              <label className="checkboxLabel">
                <input name="applyReferenceNumber" type="checkbox" />
                Apply Reference
              </label>
              <label>
                Reference
                <input name="referenceNumber" />
              </label>

              <label className="checkboxLabel">
                <input name="applyAmount" type="checkbox" />
                Apply Amount
              </label>
              <label>
                Amount
                <input name="amount" type="number" step="0.01" />
              </label>

              <label className="checkboxLabel">
                <input name="applyReceivedOn" type="checkbox" />
                Apply Received On
              </label>
              <label>
                Received On
                <input name="receivedOn" type="date" />
              </label>

              <div className="modalActions">
                <button type="button" className="tinyButton" onClick={closeBulkEdit}>
                  Close
                </button>
                <button type="submit" className="tinyButton">
                  Save Bulk Edit
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
