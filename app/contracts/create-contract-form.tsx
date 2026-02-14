"use client";

import { useEffect, useState } from "react";
import { createContractAction } from "@/app/contracts/actions";
import type { AccountCodeOption, FiscalYearOption, OrganizationOption, ProcurementProjectOption } from "@/lib/db";

export function CreateContractForm({
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

  return (
    <form className="requestForm" action={createContractAction}>
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
      <label>
        Contracted Employee Name
        <input name="contractorName" required />
      </label>
      <label>
        Employee ID Number
        <input name="contractorEmployeeId" />
      </label>
      <label>
        Email
        <input name="contractorEmail" type="email" />
      </label>
      <label>
        Phone
        <input name="contractorPhone" />
      </label>
      <label>
        Contract Value
        <input name="contractValue" type="number" step="0.01" required />
      </label>
      <label>
        Payment Installments
        <select name="installmentCount" defaultValue="1">
          <option value="1">1</option>
          <option value="2">2</option>
          <option value="3">3</option>
          <option value="4">4</option>
        </select>
      </label>
      <label>
        Notes
        <input name="notes" />
      </label>
      <button type="submit" className="buttonLink buttonPrimary">
        Save Contract
      </button>
    </form>
  );
}
