"use client";

import { useMemo, useState } from "react";
import { createProcurementOrderAction } from "@/app/procurement/actions";
import type { ProcurementBudgetLineOption, ProcurementProjectOption, VendorOption } from "@/lib/db";

const NONE_FISCAL_YEAR = "__none_fiscal_year__";
const NONE_ORGANIZATION = "__none_organization__";

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
  const [fiscalYearId, setFiscalYearId] = useState("");
  const [organizationId, setOrganizationId] = useState("");
  const [budgetTracked, setBudgetTracked] = useState(true);
  const [budgetLineId, setBudgetLineId] = useState("");

  const fiscalYearOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const line of budgetLineOptions) {
      const key = line.fiscalYearId ?? NONE_FISCAL_YEAR;
      const label = line.fiscalYearName ?? "No Fiscal Year";
      if (!map.has(key)) map.set(key, label);
    }
    for (const project of projectOptions) {
      const key = project.fiscalYearId ?? NONE_FISCAL_YEAR;
      if (!map.has(key)) map.set(key, key === NONE_FISCAL_YEAR ? "No Fiscal Year" : key);
    }
    return Array.from(map.entries()).map(([value, label]) => ({ value, label }));
  }, [budgetLineOptions, projectOptions]);

  const organizationOptions = useMemo(() => {
    const map = new Map<string, { label: string; fiscalYearId: string }>();
    for (const line of budgetLineOptions) {
      const orgKey = line.organizationId ?? NONE_ORGANIZATION;
      const fyKey = line.fiscalYearId ?? NONE_FISCAL_YEAR;
      const label = line.organizationId ? `${line.orgCode ?? ""} | ${line.organizationName ?? "Organization"}` : "No Organization";
      if (!map.has(orgKey)) map.set(orgKey, { label, fiscalYearId: fyKey });
    }
    for (const project of projectOptions) {
      const orgKey = project.organizationId ?? NONE_ORGANIZATION;
      const fyKey = project.fiscalYearId ?? NONE_FISCAL_YEAR;
      if (!map.has(orgKey)) map.set(orgKey, { label: orgKey === NONE_ORGANIZATION ? "No Organization" : orgKey, fiscalYearId: fyKey });
    }
    return Array.from(map.entries())
      .filter(([, value]) => !fiscalYearId || value.fiscalYearId === fiscalYearId)
      .map(([value, meta]) => ({ value, label: meta.label }));
  }, [budgetLineOptions, projectOptions, fiscalYearId]);

  const filteredProjectOptions = useMemo(
    () =>
      projectOptions.filter((project) => {
        const fyMatch = !fiscalYearId || (project.fiscalYearId ?? NONE_FISCAL_YEAR) === fiscalYearId;
        const orgMatch = !organizationId || (project.organizationId ?? NONE_ORGANIZATION) === organizationId;
        return fyMatch && orgMatch;
      }),
    [projectOptions, fiscalYearId, organizationId]
  );

  const filteredBudgetLines = useMemo(
    () => budgetLineOptions.filter((line) => line.projectId === projectId),
    [budgetLineOptions, projectId]
  );

  return (
    <form action={createProcurementOrderAction} className="requestForm">
      <label>
        Fiscal Year
        <select
          value={fiscalYearId}
          onChange={(event) => {
            setFiscalYearId(event.target.value);
            setOrganizationId("");
            setProjectId("");
            setBudgetLineId("");
          }}
        >
          <option value="">Select fiscal year</option>
          {fiscalYearOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Organization
        <select
          value={organizationId}
          onChange={(event) => {
            setOrganizationId(event.target.value);
            setProjectId("");
            setBudgetLineId("");
          }}
        >
          <option value="">Select organization</option>
          {organizationOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Project
        <select name="projectId" value={projectId} onChange={(event) => setProjectId(event.target.value)} required>
          <option value="">Select project</option>
          {filteredProjectOptions.map((project) => (
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
