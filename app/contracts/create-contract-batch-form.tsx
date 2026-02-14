"use client";

import { useEffect, useMemo, useState } from "react";
import { createContractsBulkAction } from "@/app/contracts/actions";
import type { AccountCodeOption, FiscalYearOption, OrganizationOption, ProcurementProjectOption } from "@/lib/db";

type BulkLine = {
  contractorName: string;
  contractValue: string;
  installmentCount: string;
};

function makeLine(): BulkLine {
  return {
    contractorName: "",
    contractValue: "",
    installmentCount: "1"
  };
}

export function CreateContractBatchForm({
  fiscalYearOptions,
  organizationOptions,
  projectOptions,
  accountCodeOptions
}: {
  fiscalYearOptions: FiscalYearOption[];
  organizationOptions: OrganizationOption[];
  projectOptions: ProcurementProjectOption[];
  accountCodeOptions: AccountCodeOption[];
}) {
  const [fiscalYearId, setFiscalYearId] = useState("");
  const [organizationId, setOrganizationId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [bannerAccountCodeId, setBannerAccountCodeId] = useState("");
  const [rows, setRows] = useState<BulkLine[]>([makeLine(), makeLine(), makeLine()]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const fy = window.localStorage.getItem("tba_contracts_fiscal_year_id");
    const org = window.localStorage.getItem("tba_contracts_org_id");
    const project = window.localStorage.getItem("tba_contracts_project_id");
    const banner = window.localStorage.getItem("tba_contracts_banner_account_code_id");
    if (fy) setFiscalYearId(fy);
    if (org) setOrganizationId(org);
    if (project) setProjectId(project);
    if (banner) setBannerAccountCodeId(banner);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("tba_contracts_fiscal_year_id", fiscalYearId);
    window.localStorage.setItem("tba_contracts_org_id", organizationId);
    window.localStorage.setItem("tba_contracts_project_id", projectId);
    window.localStorage.setItem("tba_contracts_banner_account_code_id", bannerAccountCodeId);
  }, [fiscalYearId, organizationId, projectId, bannerAccountCodeId]);

  const linesJson = useMemo(() => {
    const clean = rows
      .map((row) => ({
        contractorName: row.contractorName.trim(),
        contractValue: row.contractValue.trim(),
        installmentCount: row.installmentCount.trim() || "1"
      }))
      .filter((row) => row.contractorName.length > 0 && row.contractValue.length > 0);
    return JSON.stringify(clean);
  }, [rows]);

  function updateRow(index: number, field: keyof BulkLine, value: string): void {
    setRows((previous) => {
      const copy = [...previous];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  }

  function addRow(): void {
    setRows((previous) => [...previous, makeLine()]);
  }

  function removeRow(index: number): void {
    setRows((previous) => {
      if (previous.length <= 1) return previous;
      return previous.filter((_, currentIndex) => currentIndex !== index);
    });
  }

  return (
    <form className="requestForm" action={createContractsBulkAction}>
      <div className="contractBulkShared">
        <label>
          Fiscal Year
          <select name="fiscalYearId" value={fiscalYearId} onChange={(event) => setFiscalYearId(event.target.value)}>
            <option value="">From project default</option>
            {fiscalYearOptions.map((fiscalYear) => (
              <option key={fiscalYear.id} value={fiscalYear.id}>
                {fiscalYear.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Organization
          <select name="organizationId" value={organizationId} onChange={(event) => setOrganizationId(event.target.value)}>
            <option value="">From project default</option>
            {organizationOptions.map((organization) => (
              <option key={organization.id} value={organization.id}>
                {organization.label}
              </option>
            ))}
          </select>
        </label>
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
        <label>
          Banner Account Code
          <select
            name="bannerAccountCodeId"
            value={bannerAccountCodeId}
            onChange={(event) => setBannerAccountCodeId(event.target.value)}
            required
          >
            <option value="">Select account code</option>
            {accountCodeOptions.map((accountCode) => (
              <option key={accountCode.id} value={accountCode.id}>
                {accountCode.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="batchLinesBlock contractBulkLines">
        <div className="batchLinesHeader">
          <strong>Contract Lines</strong>
          <button type="button" className="tinyButton" onClick={addRow}>
            Add Row
          </button>
        </div>
        {rows.map((row, index) => (
          <div key={`bulk-contract-row-${index + 1}`} className="contractBatchRow">
            <input
              value={row.contractorName}
              onChange={(event) => updateRow(index, "contractorName", event.target.value)}
              placeholder="Contracted employee name"
            />
            <input
              type="number"
              step="0.01"
              value={row.contractValue}
              onChange={(event) => updateRow(index, "contractValue", event.target.value)}
              placeholder="Amount"
            />
            <select
              value={row.installmentCount}
              onChange={(event) => updateRow(index, "installmentCount", event.target.value)}
            >
              <option value="1">1 installment</option>
              <option value="2">2 installments</option>
              <option value="3">3 installments</option>
              <option value="4">4 installments</option>
            </select>
            <button type="button" className="tinyButton dangerButton" onClick={() => removeRow(index)}>
              Remove
            </button>
          </div>
        ))}
      </div>

      <div className="inlineActions" style={{ justifyContent: "flex-end" }}>
        <button type="submit" className="buttonLink buttonPrimary">
          Save Bulk Contracts
        </button>
      </div>

      <input type="hidden" name="linesJson" value={linesJson} readOnly />
    </form>
  );
}
