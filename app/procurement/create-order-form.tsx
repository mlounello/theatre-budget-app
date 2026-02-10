"use client";

import { useMemo, useState } from "react";
import { createProcurementOrderAction } from "@/app/procurement/actions";
import type { ProcurementBudgetLineOption, ProcurementProjectOption, VendorOption } from "@/lib/db";

export function CreateOrderForm({
  projectOptions,
  budgetLineOptions,
  vendors
}: {
  projectOptions: ProcurementProjectOption[];
  budgetLineOptions: ProcurementBudgetLineOption[];
  vendors: VendorOption[];
}) {
  const [projectId, setProjectId] = useState("");
  const [budgetTracked, setBudgetTracked] = useState(true);
  const [budgetLineId, setBudgetLineId] = useState("");

  const filteredBudgetLines = useMemo(
    () => budgetLineOptions.filter((line) => line.projectId === projectId),
    [budgetLineOptions, projectId]
  );

  return (
    <form action={createProcurementOrderAction} className="requestForm">
      <label>
        Project
        <select name="projectId" value={projectId} onChange={(event) => setProjectId(event.target.value)} required>
          <option value="">Select project</option>
          {projectOptions.map((project) => (
            <option key={project.id} value={project.id}>
              {project.label}
            </option>
          ))}
        </select>
      </label>
      <label className="checkboxLabel">
        <input
          name="budgetTracked"
          type="checkbox"
          checked={budgetTracked}
          onChange={(event) => {
            setBudgetTracked(event.target.checked);
            if (!event.target.checked) setBudgetLineId("");
          }}
        />
        Track in budget
      </label>
      <label>
        Budget Line
        <select
          name="budgetLineId"
          value={budgetLineId}
          onChange={(event) => setBudgetLineId(event.target.value)}
          required={budgetTracked}
          disabled={!projectId || !budgetTracked}
        >
          <option value="">Select budget line</option>
          {filteredBudgetLines.map((line) => (
            <option key={line.id} value={line.id}>
              {line.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Title
        <input name="title" placeholder="Order title" required />
      </label>
      <label>
        Order Value
        <input name="orderValue" type="number" min="0.01" step="0.01" required />
      </label>
      <label>
        Reference #
        <input name="referenceNumber" placeholder="Optional" />
      </label>
      <label>
        Requisition #
        <input name="requisitionNumber" placeholder="Optional" />
      </label>
      <label>
        PO #
        <input name="poNumber" placeholder="Optional" />
      </label>
      <label>
        Vendor
        <select name="vendorId" defaultValue="">
          <option value="">No vendor</option>
          {vendors.map((vendor) => (
            <option key={vendor.id} value={vendor.id}>
              {vendor.name}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" className="buttonLink buttonPrimary">
        Create Procurement Order
      </button>
    </form>
  );
}
