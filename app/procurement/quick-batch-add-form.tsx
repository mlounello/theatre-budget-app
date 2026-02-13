"use client";

import { useEffect, useMemo, useState } from "react";
import { createProcurementBatchAction } from "@/app/procurement/actions";
import type { AccountCodeOption, ProcurementBudgetLineOption, ProcurementProjectOption, ProductionCategoryOption } from "@/lib/db";

type BatchLine = {
  id: string;
  title: string;
  requisitionNumber: string;
  poNumber: string;
  amount: string;
  entryType: "requisition" | "cc";
};

const NONE_FISCAL_YEAR = "__none_fiscal_year__";
const NONE_ORGANIZATION = "__none_organization__";

function makeLine(): BatchLine {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    title: "",
    requisitionNumber: "",
    poNumber: "",
    amount: "",
    entryType: "requisition"
  };
}

export function QuickBatchAddForm({
  projectOptions,
  budgetLineOptions,
  accountCodeOptions,
  productionCategoryOptions
}: {
  projectOptions: ProcurementProjectOption[];
  budgetLineOptions: ProcurementBudgetLineOption[];
  accountCodeOptions: AccountCodeOption[];
  productionCategoryOptions: ProductionCategoryOption[];
}) {
  const [fiscalYearId, setFiscalYearId] = useState("");
  const [organizationId, setOrganizationId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [productionCategoryId, setProductionCategoryId] = useState("");
  const [bannerAccountCodeId, setBannerAccountCodeId] = useState("");
  const [budgetTracked, setBudgetTracked] = useState(true);
  const [lines, setLines] = useState<BatchLine[]>([makeLine(), makeLine(), makeLine()]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const fy = window.localStorage.getItem("tba_batch_fiscal_year_id");
    const org = window.localStorage.getItem("tba_batch_org_id");
    const project = window.localStorage.getItem("tba_batch_project_id");
    const category = window.localStorage.getItem("tba_batch_production_category_id");
    const banner = window.localStorage.getItem("tba_batch_banner_account_code_id");
    const tracked = window.localStorage.getItem("tba_batch_budget_tracked");
    if (fy) setFiscalYearId(fy);
    if (org) setOrganizationId(org);
    if (project) setProjectId(project);
    if (category) setProductionCategoryId(category);
    if (banner) setBannerAccountCodeId(banner);
    if (tracked === "0") setBudgetTracked(false);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("tba_batch_fiscal_year_id", fiscalYearId);
    window.localStorage.setItem("tba_batch_org_id", organizationId);
    window.localStorage.setItem("tba_batch_project_id", projectId);
    window.localStorage.setItem("tba_batch_production_category_id", productionCategoryId);
    window.localStorage.setItem("tba_batch_banner_account_code_id", bannerAccountCodeId);
    window.localStorage.setItem("tba_batch_budget_tracked", budgetTracked ? "1" : "0");
  }, [fiscalYearId, organizationId, projectId, productionCategoryId, bannerAccountCodeId, budgetTracked]);

  const fiscalYearOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const line of budgetLineOptions) {
      const key = line.fiscalYearId ?? NONE_FISCAL_YEAR;
      const label = line.fiscalYearName ?? "No Fiscal Year";
      if (!map.has(key)) map.set(key, label);
    }
    return Array.from(map.entries()).map(([value, label]) => ({ value, label }));
  }, [budgetLineOptions]);

  const organizationOptions = useMemo(() => {
    const map = new Map<string, { label: string; fiscalYearId: string }>();
    for (const line of budgetLineOptions) {
      const orgKey = line.organizationId ?? NONE_ORGANIZATION;
      const fyKey = line.fiscalYearId ?? NONE_FISCAL_YEAR;
      const label = line.organizationId ? `${line.orgCode ?? ""} | ${line.organizationName ?? "Organization"}` : "No Organization";
      if (!map.has(orgKey)) map.set(orgKey, { label, fiscalYearId: fyKey });
    }
    return Array.from(map.entries())
      .filter(([, value]) => !fiscalYearId || value.fiscalYearId === fiscalYearId)
      .map(([value, meta]) => ({ value, label: meta.label }));
  }, [budgetLineOptions, fiscalYearId]);

  const filteredProjectOptions = useMemo(
    () =>
      projectOptions.filter((project) => {
        const fyMatch = !fiscalYearId || (project.fiscalYearId ?? NONE_FISCAL_YEAR) === fiscalYearId;
        const orgMatch = !organizationId || (project.organizationId ?? NONE_ORGANIZATION) === organizationId;
        return fyMatch && orgMatch;
      }),
    [projectOptions, fiscalYearId, organizationId]
  );

  function updateLine(id: string, patch: Partial<BatchLine>): void {
    setLines((prev) => prev.map((line) => (line.id === id ? { ...line, ...patch } : line)));
  }

  function addLine(): void {
    setLines((prev) => [...prev, makeLine()]);
  }

  function removeLine(id: string): void {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((line) => line.id !== id)));
  }

  const linesJson = JSON.stringify(
    lines.map((line) => ({
      title: line.title.trim(),
      requisitionNumber: line.requisitionNumber.trim(),
      poNumber: line.poNumber.trim(),
      amount: line.amount.trim(),
      entryType: line.entryType
    }))
  );

  return (
    <form action={createProcurementBatchAction} className="requestForm">
      <label>
        Fiscal Year
        <select
          value={fiscalYearId}
          onChange={(event) => {
            setFiscalYearId(event.target.value);
            setOrganizationId("");
            setProjectId("");
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
      <label>
        Department (Production Category)
        <select name="productionCategoryId" value={productionCategoryId} onChange={(event) => setProductionCategoryId(event.target.value)} required>
          <option value="">Select department</option>
          {productionCategoryOptions.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Banner Account Code (optional)
        <select name="bannerAccountCodeId" value={bannerAccountCodeId} onChange={(event) => setBannerAccountCodeId(event.target.value)}>
          <option value="">Unassigned</option>
          {accountCodeOptions.map((accountCode) => (
            <option key={accountCode.id} value={accountCode.id}>
              {accountCode.label}
            </option>
          ))}
        </select>
      </label>
      <label className="checkboxLabel">
        <input name="budgetTracked" type="checkbox" checked={budgetTracked} onChange={(event) => setBudgetTracked(event.target.checked)} />
        Track in budget
      </label>

      <div className="batchLinesBlock">
        <div className="batchLinesHeader">
          <strong>Batch Lines</strong>
          <button type="button" className="tinyButton" onClick={addLine}>
            Add Row
          </button>
        </div>
        {lines.map((line) => (
          <div key={line.id} className="batchLineRow">
            <input placeholder="Title" value={line.title} onChange={(event) => updateLine(line.id, { title: event.target.value })} />
            <input
              placeholder="Req # (optional)"
              value={line.requisitionNumber}
              onChange={(event) => updateLine(line.id, { requisitionNumber: event.target.value })}
            />
            <input placeholder="PO # (optional)" value={line.poNumber} onChange={(event) => updateLine(line.id, { poNumber: event.target.value })} />
            <input
              placeholder="Amount"
              type="number"
              step="0.01"
              value={line.amount}
              onChange={(event) => updateLine(line.id, { amount: event.target.value })}
            />
            <select value={line.entryType} onChange={(event) => updateLine(line.id, { entryType: event.target.value as "requisition" | "cc" })}>
              <option value="requisition">Requisition</option>
              <option value="cc">CC</option>
            </select>
            <button type="button" className="tinyButton dangerButton" onClick={() => removeLine(line.id)}>
              Remove
            </button>
          </div>
        ))}
      </div>

      <input type="hidden" name="linesJson" value={linesJson} />

      <button type="submit" className="buttonLink buttonPrimary">
        Add Batch Orders
      </button>
    </form>
  );
}
