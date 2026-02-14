"use client";

import { useEffect, useMemo, useState } from "react";
import { createRequest } from "@/app/requests/actions";
import type { AccountCodeOption, ProcurementProjectOption, ProductionCategoryOption, ProjectBudgetLineOption } from "@/lib/db";

type AllocationRow = {
  id: string;
  reportingBudgetLineId: string;
  accountCodeId: string;
  amount: string;
  reportingBucket: "direct" | "miscellaneous";
};

type Props = {
  budgetLineOptions: ProjectBudgetLineOption[];
  projectOptions: ProcurementProjectOption[];
  accountCodeOptions: AccountCodeOption[];
  productionCategoryOptions: ProductionCategoryOption[];
  canManageSplits: boolean;
};

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

const NONE_FISCAL_YEAR = "__none_fiscal_year__";
const NONE_ORGANIZATION = "__none_organization__";

export function CreateRequestForm({
  budgetLineOptions,
  projectOptions,
  accountCodeOptions,
  productionCategoryOptions,
  canManageSplits
}: Props) {
  const [useSplits, setUseSplits] = useState(false);
  const [selectedFiscalYear, setSelectedFiscalYear] = useState("");
  const [selectedOrganization, setSelectedOrganization] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [selectedProductionCategoryId, setSelectedProductionCategoryId] = useState("");
  const [selectedBannerAccountCodeId, setSelectedBannerAccountCodeId] = useState("");
  const [requestType, setRequestType] = useState<"requisition" | "expense" | "contract" | "request" | "budget_transfer">(
    "requisition"
  );
  const [isCreditCard, setIsCreditCard] = useState(false);
  const [rows, setRows] = useState<AllocationRow[]>([
    {
      id: uid(),
      reportingBudgetLineId: "",
      accountCodeId: "",
      amount: "",
      reportingBucket: "direct"
    }
  ]);

  const allocationsJson = useMemo(
    () =>
      JSON.stringify(
        rows
          .filter((row) => row.reportingBudgetLineId && row.accountCodeId && row.amount)
          .map((row) => ({
            reportingBudgetLineId: row.reportingBudgetLineId,
            accountCodeId: row.accountCodeId,
            amount: Number.parseFloat(row.amount || "0"),
            reportingBucket: row.reportingBucket
          }))
      ),
    [rows]
  );

  const splitMode = canManageSplits && useSplits;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const fy = window.localStorage.getItem("tba_requests_fiscal_year_id");
    const org = window.localStorage.getItem("tba_requests_org_id");
    const project = window.localStorage.getItem("tba_requests_project_id");
    const productionCategory = window.localStorage.getItem("tba_requests_production_category_id");
    const bannerAccountCode = window.localStorage.getItem("tba_requests_banner_account_code_id");
    const type = window.localStorage.getItem("tba_requests_request_type");
    const cc = window.localStorage.getItem("tba_requests_is_credit_card");
    const splits = window.localStorage.getItem("tba_requests_use_splits");
    if (fy) setSelectedFiscalYear(fy);
    if (org) setSelectedOrganization(org);
    if (project) setSelectedProjectId(project);
    if (productionCategory) setSelectedProductionCategoryId(productionCategory);
    if (bannerAccountCode) setSelectedBannerAccountCodeId(bannerAccountCode);
    if (type === "expense" || type === "contract" || type === "request" || type === "budget_transfer" || type === "requisition") {
      setRequestType(type);
    }
    if (cc === "1") setIsCreditCard(true);
    if (splits === "1") setUseSplits(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("tba_requests_fiscal_year_id", selectedFiscalYear);
    window.localStorage.setItem("tba_requests_org_id", selectedOrganization);
    window.localStorage.setItem("tba_requests_project_id", selectedProjectId);
    window.localStorage.setItem("tba_requests_production_category_id", selectedProductionCategoryId);
    window.localStorage.setItem("tba_requests_banner_account_code_id", selectedBannerAccountCodeId);
    window.localStorage.setItem("tba_requests_request_type", requestType);
    window.localStorage.setItem("tba_requests_is_credit_card", isCreditCard ? "1" : "0");
    window.localStorage.setItem("tba_requests_use_splits", useSplits ? "1" : "0");
  }, [
    isCreditCard,
    requestType,
    selectedBannerAccountCodeId,
    selectedFiscalYear,
    selectedOrganization,
    selectedProductionCategoryId,
    selectedProjectId,
    useSplits
  ]);

  const fiscalYearOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const option of budgetLineOptions) {
      const key = option.fiscalYearId ?? NONE_FISCAL_YEAR;
      const label = option.fiscalYearName ?? "No Fiscal Year";
      if (!map.has(key)) map.set(key, label);
    }
    for (const option of projectOptions) {
      const key = option.fiscalYearId ?? NONE_FISCAL_YEAR;
      if (!map.has(key)) {
        map.set(key, key === NONE_FISCAL_YEAR ? "No Fiscal Year" : "Fiscal Year");
      }
    }
    return Array.from(map.entries()).map(([value, label]) => ({ value, label }));
  }, [projectOptions, budgetLineOptions]);

  const organizationOptions = useMemo(() => {
    const map = new Map<string, { label: string; fiscalYearKey: string }>();
    for (const option of budgetLineOptions) {
      const orgKey = option.organizationId ?? NONE_ORGANIZATION;
      const fiscalKey = option.fiscalYearId ?? NONE_FISCAL_YEAR;
      const label = option.organizationId
        ? `${option.orgCode ?? ""}${option.organizationName ? ` | ${option.organizationName}` : ""}`
        : "No Organization";
      if (!map.has(orgKey)) map.set(orgKey, { label, fiscalYearKey: fiscalKey });
    }
    for (const option of projectOptions) {
      const orgKey = option.organizationId ?? NONE_ORGANIZATION;
      const fiscalKey = option.fiscalYearId ?? NONE_FISCAL_YEAR;
      if (!map.has(orgKey)) {
        map.set(orgKey, {
          label: orgKey === NONE_ORGANIZATION ? "No Organization" : orgKey,
          fiscalYearKey: fiscalKey
        });
      }
    }
    return Array.from(map.entries())
      .filter(([, value]) => !selectedFiscalYear || value.fiscalYearKey === selectedFiscalYear || value.fiscalYearKey === NONE_FISCAL_YEAR)
      .map(([value, meta]) => ({ value, label: meta.label }));
  }, [budgetLineOptions, projectOptions, selectedFiscalYear]);

  const filteredProjectOptions = useMemo(
    () =>
      projectOptions.filter((project) => {
        const fyKey = project.fiscalYearId ?? NONE_FISCAL_YEAR;
        const fyMatch = !selectedFiscalYear || fyKey === selectedFiscalYear || fyKey === NONE_FISCAL_YEAR;
        const orgMatch = !selectedOrganization || (project.organizationId ?? NONE_ORGANIZATION) === selectedOrganization;
        return fyMatch && orgMatch;
      }),
    [projectOptions, selectedFiscalYear, selectedOrganization]
  );

  const filteredBudgetLineOptions = useMemo(
    () => budgetLineOptions.filter((option) => option.projectId === selectedProjectId),
    [budgetLineOptions, selectedProjectId]
  );

  return (
    <form className="requestForm" action={createRequest}>
      <label>
        Fiscal Year
        <select
          value={selectedFiscalYear}
          onChange={(event) => {
            setSelectedFiscalYear(event.target.value);
            setSelectedOrganization("");
            setSelectedProjectId("");
            setRows([{ id: uid(), reportingBudgetLineId: "", accountCodeId: "", amount: "", reportingBucket: "direct" }]);
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
          value={selectedOrganization}
          onChange={(event) => {
            setSelectedOrganization(event.target.value);
            setSelectedProjectId("");
            setRows([{ id: uid(), reportingBudgetLineId: "", accountCodeId: "", amount: "", reportingBucket: "direct" }]);
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
        <select
          name="projectId"
          value={selectedProjectId}
          onChange={(event) => {
            setSelectedProjectId(event.target.value);
            setRows([{ id: uid(), reportingBudgetLineId: "", accountCodeId: "", amount: "", reportingBucket: "direct" }]);
          }}
          required
        >
          <option value="">Select project</option>
          {filteredProjectOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label>
        Production Category
        <select
          name="productionCategoryId"
          value={selectedProductionCategoryId}
          onChange={(event) => setSelectedProductionCategoryId(event.target.value)}
          required
        >
          <option value="">Select category</option>
          {productionCategoryOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
      </label>

      <label>
        Banner Account Code {requestType === "request" ? "(not used for Budget Hold)" : "(optional)"}
        <select
          name="bannerAccountCodeId"
          value={selectedBannerAccountCodeId}
          onChange={(event) => setSelectedBannerAccountCodeId(event.target.value)}
          disabled={requestType === "request"}
        >
          <option value="">Unassigned</option>
          {accountCodeOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label>
        Request Type
        <select
          name="requestType"
          value={requestType}
          onChange={(event) => {
            const value = event.target.value;
            if (value === "expense" || value === "contract" || value === "request" || value === "budget_transfer") {
              setRequestType(value);
            } else {
              setRequestType("requisition");
            }
            if (value !== "expense") setIsCreditCard(false);
            if (value === "request") setSelectedBannerAccountCodeId("");
          }}
        >
          <option value="requisition">Requisition (PO)</option>
          <option value="expense">Expense (CC/Reimbursement)</option>
          <option value="contract">Contract (Check Request)</option>
          <option value="request">Request (Budget Hold)</option>
          <option value="budget_transfer">Budget Transfer</option>
        </select>
      </label>

      {requestType === "expense" ? (
        <label className="checkboxLabel">
          <input
            name="isCreditCard"
            type="checkbox"
            checked={isCreditCard}
            onChange={(event) => setIsCreditCard(event.target.checked)}
          />
          Credit Card Expense
        </label>
      ) : null}

      {canManageSplits && requestType !== "request" && requestType !== "budget_transfer" ? (
        <label className="checkboxLabel">
          <input type="checkbox" checked={useSplits} onChange={(event) => setUseSplits(event.target.checked)} />
          Use split allocations
        </label>
      ) : null}

      {splitMode ? (
        <div className="splitAllocations">
          <input type="hidden" name="allocationsJson" value={allocationsJson} />
          {rows.map((row, index) => (
            <div key={row.id} className="splitRow">
              <select
                value={row.reportingBudgetLineId}
                onChange={(event) =>
                  setRows((prev) =>
                    prev.map((item) =>
                      item.id === row.id ? { ...item, reportingBudgetLineId: event.target.value } : item
                    )
                  )
                }
              >
                <option value="">Reporting line</option>
                {filteredBudgetLineOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>

              <select
                value={row.accountCodeId}
                onChange={(event) =>
                  setRows((prev) => prev.map((item) => (item.id === row.id ? { ...item, accountCodeId: event.target.value } : item)))
                }
              >
                <option value="">Account code</option>
                {accountCodeOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>

              <input
                type="number"
                step="0.01"
                placeholder="Amount"
                value={row.amount}
                onChange={(event) =>
                  setRows((prev) => prev.map((item) => (item.id === row.id ? { ...item, amount: event.target.value } : item)))
                }
              />

              <select
                value={row.reportingBucket}
                onChange={(event) =>
                  setRows((prev) =>
                    prev.map((item) =>
                      item.id === row.id
                        ? { ...item, reportingBucket: event.target.value === "miscellaneous" ? "miscellaneous" : "direct" }
                        : item
                    )
                  )
                }
              >
                <option value="direct">Direct Bucket</option>
                <option value="miscellaneous">Miscellaneous Bucket</option>
              </select>

              {index > 0 ? (
                <button
                  type="button"
                  className="tinyButton"
                  onClick={() => setRows((prev) => prev.filter((item) => item.id !== row.id))}
                >
                  Remove
                </button>
              ) : null}
            </div>
          ))}
          <button
            type="button"
            className="tinyButton"
            onClick={() =>
              setRows((prev) => [
                ...prev,
                { id: uid(), reportingBudgetLineId: "", accountCodeId: "", amount: "", reportingBucket: "direct" }
              ])
            }
          >
            Add Split Row
          </button>
        </div>
      ) : null}

      <label>
        Title
        <input name="title" required placeholder="Ex: Scenic hardware" />
      </label>
      {requestType === "requisition" ? (
        <label>
          Requisition #
          <input name="requisitionNumber" placeholder="R0012345" />
        </label>
      ) : null}
      {requestType !== "requisition" && requestType !== "budget_transfer" ? (
        <label>
          Reference #
          <input name="referenceNumber" placeholder="EP/EC/J code" />
        </label>
      ) : null}
      <label>
        Estimated
        <input name="estimatedAmount" type="number" step="0.01" />
      </label>
      <label>
        Requested
        <input name="requestedAmount" type="number" step="0.01" />
      </label>
      <button type="submit" className="buttonLink buttonPrimary">
        Save Planning Entry
      </button>
    </form>
  );
}
