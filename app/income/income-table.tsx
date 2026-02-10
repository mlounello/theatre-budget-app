"use client";

import { useState } from "react";
import { deleteIncomeEntryAction, updateIncomeEntryAction } from "@/app/income/actions";
import { formatCurrency } from "@/lib/format";
import type { IncomeRow, OrganizationOption } from "@/lib/db";

function typeLabel(type: IncomeRow["incomeType"]): string {
  if (type === "starting_budget") return "Starting Budget";
  if (type === "donation") return "Donation";
  if (type === "ticket_sales") return "Ticket Sales";
  return "Other";
}

export function IncomeTable({ rows, organizations }: { rows: IncomeRow[]; organizations: OrganizationOption[] }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const editingRow = rows.find((row) => row.id === editingId) ?? null;

  return (
    <>
      <div className="tableWrap">
        <table>
          <thead>
            <tr>
              <th>Project</th>
              <th>Organization</th>
              <th>Type</th>
              <th>Description</th>
              <th>Reference</th>
              <th>Amount</th>
              <th>Received</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8}>No income entries yet.</td>
              </tr>
            ) : null}
            {rows.map((row) => (
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
                <input name="amount" type="number" step="0.01" min="0.01" defaultValue={editingRow.amount} required />
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
