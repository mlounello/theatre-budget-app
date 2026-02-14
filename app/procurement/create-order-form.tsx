"use client";

import { useEffect, useMemo, useState } from "react";
import { createProcurementOrderAction } from "@/app/procurement/actions";
import type {
  AccountCodeOption,
  OrganizationOption,
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
  organizationOptions,
  vendors,
  accountCodeOptions,
  productionCategoryOptions
}: {
  projectOptions: ProcurementProjectOption[];
  budgetLineOptions: ProcurementBudgetLineOption[];
  organizationOptions: OrganizationOption[];
  vendors: VendorOption[];
  accountCodeOptions: AccountCodeOption[];
  productionCategoryOptions: ProductionCategoryOption[];
}) {
  const [projectId, setProjectId] = useState("");
  const [fiscalYearId, setFiscalYearId] = useState("");
  const [organizationId, setOrganizationId] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [productionCategoryId, setProductionCategoryId] = useState("");
  const [bannerAccountCodeId, setBannerAccountCodeId] = useState("");
  const [requestType, setRequestType] = useState<
    "requisition" | "expense" | "contract" | "request" | "budget_transfer" | "contract_payment"
  >("requisition");
  const [isCreditCard, setIsCreditCard] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const fy = window.localStorage.getItem("tba_procurement_fiscal_year_id");
    const org = window.localStorage.getItem("tba_procurement_org_id");
    const project = window.localStorage.getItem("tba_procurement_project_id");
    const vendor = window.localStorage.getItem("tba_procurement_vendor_id");
    const productionCategory = window.localStorage.getItem("tba_procurement_production_category_id");
    const bannerCode = window.localStorage.getItem("tba_procurement_banner_account_code_id");
    const type = window.localStorage.getItem("tba_procurement_request_type");
    const cc = window.localStorage.getItem("tba_procurement_is_cc");
    if (fy) setFiscalYearId(fy);
    if (org) setOrganizationId(org);
    if (project) setProjectId(project);
    if (vendor) setVendorId(vendor);
    if (productionCategory) setProductionCategoryId(productionCategory);
    if (bannerCode) setBannerAccountCodeId(bannerCode);
    if (
      type === "requisition" ||
      type === "expense" ||
      type === "contract" ||
      type === "request" ||
      type === "budget_transfer" ||
      type === "contract_payment"
    ) {
      setRequestType(type);
    }
    if (cc === "0") setIsCreditCard(false);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("tba_procurement_fiscal_year_id", fiscalYearId);
    window.localStorage.setItem("tba_procurement_org_id", organizationId);
    window.localStorage.setItem("tba_procurement_project_id", projectId);
    window.localStorage.setItem("tba_procurement_vendor_id", vendorId);
    window.localStorage.setItem("tba_procurement_production_category_id", productionCategoryId);
    window.localStorage.setItem("tba_procurement_banner_account_code_id", bannerAccountCodeId);
    window.localStorage.setItem("tba_procurement_request_type", requestType);
    window.localStorage.setItem("tba_procurement_is_cc", isCreditCard ? "1" : "0");
  }, [fiscalYearId, organizationId, projectId, vendorId, productionCategoryId, bannerAccountCodeId, requestType, isCreditCard]);

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
    for (const organization of organizationOptions) {
      const key = organization.fiscalYearId ?? NONE_FISCAL_YEAR;
      const label = organization.fiscalYearName ?? "No Fiscal Year";
      if (!map.has(key)) map.set(key, label);
    }
    return Array.from(map.entries()).map(([value, label]) => ({ value, label }));
  }, [budgetLineOptions, projectOptions, organizationOptions]);

  const filteredOrganizationOptions = useMemo(() => {
    return organizationOptions
      .filter((option) => !fiscalYearId || option.fiscalYearId === fiscalYearId || option.fiscalYearId === null)
      .map((option) => ({ value: option.id, label: option.label }));
  }, [organizationOptions, fiscalYearId]);

  const filteredProjectOptions = useMemo(
    () =>
      projectOptions.filter((project) => {
        if (project.isExternal) return true;
        const fyKey = project.fiscalYearId ?? NONE_FISCAL_YEAR;
        const fyMatch = !fiscalYearId || fyKey === fiscalYearId || fyKey === NONE_FISCAL_YEAR;
        const orgMatch = !organizationId || (project.organizationId ?? NONE_ORGANIZATION) === organizationId;
        return fyMatch && orgMatch;
      }),
    [projectOptions, fiscalYearId, organizationId]
  );

  const selectedProject = filteredProjectOptions.find((project) => project.id === projectId) ?? null;
  const isExternalProject = selectedProject?.isExternal ?? false;

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
          required={isExternalProject}
        >
          <option value="">Select organization</option>
          {filteredOrganizationOptions.map((option) => (
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
        <select
          name="productionCategoryId"
          value={productionCategoryId}
          onChange={(event) => setProductionCategoryId(event.target.value)}
          required={!isExternalProject}
        >
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
      {isExternalProject ? <p className="heroSubtitle">External Procurement rows are automatically marked as off-budget.</p> : null}
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="budgetLineId" value="" />
      <label>
        Request Type
        <select
          name="requestType"
          value={requestType}
          onChange={(event) => {
            const value = event.target.value as typeof requestType;
            setRequestType(value);
            if (value !== "expense") setIsCreditCard(false);
            if (value === "expense") setIsCreditCard(true);
          }}
        >
          <option value="requisition">Requisition</option>
          <option value="expense">Expense</option>
          <option value="contract">Contract</option>
          <option value="request">Budget Hold</option>
          <option value="budget_transfer">Budget Transfer</option>
          <option value="contract_payment">Contract Payment</option>
        </select>
      </label>
      {requestType === "expense" ? (
        <label className="checkboxLabel">
          <input name="isCreditCard" type="checkbox" checked={isCreditCard} onChange={(event) => setIsCreditCard(event.target.checked)} />
          Credit Card Expense
        </label>
      ) : null}
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
