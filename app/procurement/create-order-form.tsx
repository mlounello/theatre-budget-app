"use client";

import { useEffect, useMemo, useState } from "react";
import { createProcurementOrderAction } from "@/app/procurement/actions";
import type {
  AccountCodeOption,
  ProcurementBudgetLineOption,
  ProcurementProjectOption,
  ProductionCategoryOption,
  VendorOption
} from "@/lib/db";

const NONE_FISCAL_YEAR = "__none_fiscal_year__";
const NONE_ORGANIZATION = "__none_organization__";

export function CreateOrderForm({
  projectOptions,
  budgetLineOptions,
  vendors,
  accountCodeOptions,
  productionCategoryOptions
}: {
  projectOptions: ProcurementProjectOption[];
  budgetLineOptions: ProcurementBudgetLineOption[];
  vendors: VendorOption[];
  accountCodeOptions: AccountCodeOption[];
  productionCategoryOptions: ProductionCategoryOption[];
}) {
  const [projectId, setProjectId] = useState("");
  const [fiscalYearId, setFiscalYearId] = useState("");
  const [organizationId, setOrganizationId] = useState("");
  const [budgetTracked, setBudgetTracked] = useState(true);
  const [vendorId, setVendorId] = useState("");
  const [productionCategoryId, setProductionCategoryId] = useState("");
  const [bannerAccountCodeId, setBannerAccountCodeId] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const fy = window.localStorage.getItem("tba_procurement_fiscal_year_id");
    const org = window.localStorage.getItem("tba_procurement_org_id");
    const project = window.localStorage.getItem("tba_procurement_project_id");
    const tracked = window.localStorage.getItem("tba_procurement_budget_tracked");
    const vendor = window.localStorage.getItem("tba_procurement_vendor_id");
    const productionCategory = window.localStorage.getItem("tba_procurement_production_category_id");
    const bannerCode = window.localStorage.getItem("tba_procurement_banner_account_code_id");
    if (fy) setFiscalYearId(fy);
    if (org) setOrganizationId(org);
    if (project) setProjectId(project);
    if (tracked === "0") setBudgetTracked(false);
    if (vendor) setVendorId(vendor);
    if (productionCategory) setProductionCategoryId(productionCategory);
    if (bannerCode) setBannerAccountCodeId(bannerCode);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("tba_procurement_fiscal_year_id", fiscalYearId);
    window.localStorage.setItem("tba_procurement_org_id", organizationId);
    window.localStorage.setItem("tba_procurement_project_id", projectId);
    window.localStorage.setItem("tba_procurement_budget_tracked", budgetTracked ? "1" : "0");
    window.localStorage.setItem("tba_procurement_vendor_id", vendorId);
    window.localStorage.setItem("tba_procurement_production_category_id", productionCategoryId);
    window.localStorage.setItem("tba_procurement_banner_account_code_id", bannerAccountCodeId);
  }, [budgetTracked, fiscalYearId, organizationId, projectId, vendorId, productionCategoryId, bannerAccountCodeId]);

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
        <input
          name="budgetTracked"
          type="checkbox"
          checked={budgetTracked}
          onChange={(event) => {
            setBudgetTracked(event.target.checked);
          }}
        />
        Track in budget
      </label>
      <input type="hidden" name="budgetLineId" value="" />
      <label>
        Title
        <input name="title" placeholder="Order title" required />
      </label>
      <label>
        Order Value
        <input name="orderValue" type="number" step="0.01" required />
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
        <select name="vendorId" value={vendorId} onChange={(event) => setVendorId(event.target.value)}>
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
