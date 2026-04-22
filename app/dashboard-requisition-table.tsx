"use client";

import { useActionState } from "react";
import type { DashboardOpenRequisition } from "@/lib/db";
import { updateDashboardRequisitionStatusAction } from "@/app/dashboard-actions";
import { formatCurrency } from "@/lib/format";

const REQUISITION_PROCUREMENT_STATUSES = [
  { value: "requested", label: "Requested" },
  { value: "ordered", label: "Ordered" },
  { value: "partial_received", label: "Partially Received" },
  { value: "fully_received", label: "Fully Received" },
  { value: "invoice_sent", label: "Invoice Sent" },
  { value: "invoice_received", label: "Invoice Received" },
  { value: "paid", label: "Paid" },
  { value: "cancelled", label: "Cancelled" }
] as const;

type ActionState = {
  ok: boolean;
  message: string;
  timestamp: number;
};

const initialState: ActionState = { ok: true, message: "", timestamp: 0 };

type DashboardRequisitionTableProps = {
  openRequisitions: DashboardOpenRequisition[];
};

export function DashboardRequisitionTable({ openRequisitions }: DashboardRequisitionTableProps) {
  const [state, formAction] = useActionState(updateDashboardRequisitionStatusAction, initialState);

  return (
    <article className="panel">
      <h2>Requisition Follow-Up</h2>
      <p className="heroSubtitle">Open requisitions that are not yet paid. Update status directly from this list.</p>
      {state.message ? <p className={state.ok ? "successNote" : "errorNote"}>{state.message}</p> : null}
      <div className="tableWrap">
        <table>
          <thead>
            <tr>
              <th>Project</th>
              <th>Title</th>
              <th>Req #</th>
              <th>PO #</th>
              <th>Vendor</th>
              <th>Order Value</th>
              <th>Status</th>
              <th>Update</th>
            </tr>
          </thead>
          <tbody>
            {openRequisitions.length === 0 ? (
              <tr>
                <td colSpan={8}>No open requisitions.</td>
              </tr>
            ) : null}
            {openRequisitions.map((row) => (
              <tr key={row.id}>
                <td>
                  {row.projectName}
                  {row.season ? <div>{row.season}</div> : null}
                </td>
                <td>{row.title}</td>
                <td>{row.requisitionNumber ?? "-"}</td>
                <td>{row.poNumber ?? "-"}</td>
                <td>{row.vendorName ?? "-"}</td>
                <td>{formatCurrency(row.orderValue)}</td>
                <td>
                  <span className={`statusChip status-${row.procurementStatus}`}>{row.procurementStatus}</span>
                </td>
                <td>
                  <form action={formAction} className="inlineEditForm">
                    <input type="hidden" name="purchaseId" value={row.id} />
                    <select name="procurementStatus" defaultValue={row.procurementStatus}>
                      {REQUISITION_PROCUREMENT_STATUSES.map((status) => (
                        <option key={status.value} value={status.value}>
                          {status.label}
                        </option>
                      ))}
                    </select>
                    <button type="submit" className="tinyButton">
                      Save
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}
