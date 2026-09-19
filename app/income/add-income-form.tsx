"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { createIncomeEntryAction, type ActionState } from "@/app/income/actions";
import type { AccountCodeOption, FiscalYearOption, OrganizationOption, ProductionCategoryOption, RevenuePerformanceRow } from "@/lib/db";

const initialState: ActionState = { ok: true, message: "", timestamp: 0 };

export function AddIncomeForm({
  organizations,
  fiscalYears,
  defaultFiscalYearId,
  revenueAccountCodes,
  revenueTargets,
  productionCategoryOptions
}: {
  organizations: OrganizationOption[];
  fiscalYears: FiscalYearOption[];
  defaultFiscalYearId: string;
  revenueAccountCodes: AccountCodeOption[];
  revenueTargets: RevenuePerformanceRow[];
  productionCategoryOptions: ProductionCategoryOption[];
}) {
  const [state, formAction] = useActionState(createIncomeEntryAction, initialState);
  const formRef = useRef<HTMLFormElement | null>(null);
  const [fiscalYearId, setFiscalYearId] = useState(defaultFiscalYearId);
  const [organizationId, setOrganizationId] = useState("");
  const [accountCodeId, setAccountCodeId] = useState("");
  const filteredOrganizations = useMemo(() => {
    const preferred = new Map<string, OrganizationOption>();
    for (const organization of organizations) {
      if (organization.fiscalYearId !== fiscalYearId && organization.fiscalYearId !== null) continue;
      const existing = preferred.get(organization.orgCode);
      if (!existing || organization.fiscalYearId === fiscalYearId) preferred.set(organization.orgCode, organization);
    }
    return Array.from(preferred.values()).sort(
      (a, b) => a.sortOrder - b.sortOrder || a.orgCode.localeCompare(b.orgCode) || a.name.localeCompare(b.name)
    );
  }, [fiscalYearId, organizations]);
  const targetAccountIds = useMemo(
    () => new Set(
      revenueTargets
        .filter((target) => target.fiscalYearId === fiscalYearId && target.organizationId === organizationId)
        .map((target) => target.accountCodeId)
    ),
    [fiscalYearId, organizationId, revenueTargets]
  );
  const targetAccountCodes = useMemo(
    () => revenueAccountCodes.filter((accountCode) => targetAccountIds.has(accountCode.id)),
    [revenueAccountCodes, targetAccountIds]
  );

  useEffect(() => {
    if (state.ok && state.message && formRef.current) {
      formRef.current.reset();
      setOrganizationId("");
      setAccountCodeId("");
    }
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
        <select name="fiscalYearId" value={fiscalYearId} onChange={(event) => {
          setFiscalYearId(event.target.value);
          setOrganizationId("");
          setAccountCodeId("");
        }} required>
          <option value="">Select fiscal year</option>
          {fiscalYears.map((fiscalYear) => (
            <option key={fiscalYear.id} value={fiscalYear.id}>
              {fiscalYear.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Organization
        <select name="organizationId" value={organizationId} onChange={(event) => {
          setOrganizationId(event.target.value);
          setAccountCodeId("");
        }} required>
          <option value="">Select organization</option>
          {filteredOrganizations.map((organization) => (
            <option key={organization.id} value={organization.id}>
              {organization.label}
            </option>
          ))}
        </select>
      </label>

      <label>
        Revenue Type
        <select name="incomeType" defaultValue="ticket_sales" required>
          <option value="ticket_sales">Ticket Sales</option>
          <option value="donation">Donation</option>
          <option value="other">Other Revenue</option>
        </select>
      </label>
      <label>
        Production Category (optional)
        <select name="productionCategoryId" defaultValue="">
          <option value="">Unassigned</option>
          {productionCategoryOptions.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Revenue Account
        <select name="bannerAccountCodeId" value={accountCodeId} onChange={(event) => setAccountCodeId(event.target.value)} required>
          <option value="">{organizationId ? "Select targeted revenue account" : "Select fiscal year and organization first"}</option>
          {targetAccountCodes.map((accountCode) => (
            <option key={accountCode.id} value={accountCode.id}>
              {accountCode.label}
            </option>
          ))}
        </select>
        {organizationId && targetAccountCodes.length === 0 ? (
          <small>No revenue targets exist for this organization and fiscal year. Add one in Budget Planning first.</small>
        ) : null}
      </label>

      <label>
        Description
        <input name="lineName" placeholder="Optional (auto-filled from type if blank)" />
      </label>

      <label>
        Reference
        <input name="referenceNumber" placeholder="Optional (donor, batch ID, etc.)" />
      </label>

      <label>
        Amount
        <input name="amount" type="number" step="0.01" required />
      </label>

      <label>
        Received On
        <input name="receivedOn" type="date" />
      </label>

      <button type="submit" className="buttonLink buttonPrimary">
        Post Revenue
      </button>
    </form>
  );
}
