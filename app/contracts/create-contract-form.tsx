"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createContractAction, type ActionState } from "@/app/contracts/actions";
import { calculateCheckRequestSchedule } from "@/lib/check-request-schedule";
import { GLOBAL_FISCAL_YEAR_STORAGE_KEY } from "@/lib/fiscal-year-context";
import type { AccountCodeOption, FiscalYearOption, FoapalOption, OrganizationOption, ProcurementProjectOption } from "@/lib/db";

const initialState: ActionState = { ok: true, message: "", timestamp: 0 };

export function CreateContractForm({
  fiscalYearOptions,
  organizationOptions,
  projectOptions,
  accountCodeOptions,
  foapalOptions
}: {
  fiscalYearOptions: FiscalYearOption[];
  organizationOptions: OrganizationOption[];
  projectOptions: ProcurementProjectOption[];
  accountCodeOptions: AccountCodeOption[];
  foapalOptions: FoapalOption[];
}) {
  const [state, formAction] = useActionState(createContractAction, initialState);
  const formRef = useRef<HTMLFormElement | null>(null);
  const [fiscalYearId, setFiscalYearId] = useState("");
  const [organizationId, setOrganizationId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [bannerAccountCodeId, setBannerAccountCodeId] = useState("");
  const [installmentCount, setInstallmentCount] = useState(1);
  const [dueDates, setDueDates] = useState<Record<number, string>>({});

  useEffect(() => {
    if (typeof window === "undefined") return;
    const fy =
      window.localStorage.getItem("tba_contracts_fiscal_year_id") ||
      window.localStorage.getItem(GLOBAL_FISCAL_YEAR_STORAGE_KEY);
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

  useEffect(() => {
    if (!state.ok || !state.message || !formRef.current) return;
    formRef.current.reset();
    setInstallmentCount(1);
    setDueDates({});
  }, [state]);

  return (
    <form className="requestForm" action={formAction} ref={formRef}>
      {state.message ? (
        <p className={state.ok ? "successNote" : "errorNote"} key={state.timestamp}>
          {state.message}
        </p>
      ) : null}
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
        <select
          name="installmentCount"
          value={installmentCount}
          onChange={(event) => setInstallmentCount(Number(event.target.value))}
        >
          <option value="1">1</option>
          <option value="2">2</option>
          <option value="3">3</option>
          <option value="4">4</option>
        </select>
      </label>
      <label>
        Contract Number
        <input name="contractNumber" placeholder="Optional contract reference" />
      </label>
      <label>
        Role
        <input name="contractRole" placeholder="Designer, Director, Musician..." />
      </label>
      <label>
        Check Request FOAPAL
        <select name="checkRequestFoapalId">
          <option value="">Use contract organization only</option>
          {foapalOptions.map((foapal) => (
            <option key={foapal.id} value={foapal.id}>
              {foapal.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Check Delivery
        <select name="checkRequestHandling" defaultValue="mail">
          <option value="mail">Mail check</option>
          <option value="business_affairs_pickup">Pick up in Business Affairs</option>
          <option value="other">Other location</option>
        </select>
      </label>
      <label>
        Other Pickup Location
        <input name="checkRequestOtherLocation" />
      </label>
      <label>
        Vendor Address Line 1
        <input name="vendorAddress1" />
      </label>
      <label>
        Vendor Address Line 2
        <input name="vendorAddress2" />
      </label>
      <label>
        Vendor Address Line 3
        <input name="vendorAddress3" />
      </label>
      <label>
        Tax ID / SSN
        <input name="taxIdOrSsn" type="password" autoComplete="off" />
        <span className="helperText">Stored encrypted and only decrypted during check request PDF export.</span>
      </label>
      <div className="contractInstallmentDates">
        {Array.from({ length: installmentCount }, (_, index) => {
          const installmentNumber = index + 1;
          const dueDate = dueDates[installmentNumber] ?? "";
          const schedule = calculateCheckRequestSchedule(dueDate);
          return (
            <label key={installmentNumber}>
              Installment {installmentNumber} Due Date
              <input
                name={`installmentDueDate${installmentNumber}`}
                type="date"
                value={dueDate}
                onChange={(event) =>
                  setDueDates((previous) => ({ ...previous, [installmentNumber]: event.target.value }))
                }
              />
              {schedule ? (
                <span className="helperText">
                  Mail by {schedule.mailBy}; AP needs it by {schedule.apReceiveBy}; check run {schedule.checkRunDate}.
                </span>
              ) : null}
            </label>
          );
        })}
      </div>
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
