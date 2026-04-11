"use client";

import { useActionState, useEffect, useRef } from "react";
import { createIncomeEntryAction, type ActionState } from "@/app/income/actions";
import type { AccountCodeOption, OrganizationOption, ProductionCategoryOption } from "@/lib/db";

const initialState: ActionState = { ok: true, message: "", timestamp: 0 };

export function AddIncomeForm({
  organizations,
  revenueAccountCodes,
  otherAccountCodes,
  productionCategoryOptions
}: {
  organizations: OrganizationOption[];
  revenueAccountCodes: AccountCodeOption[];
  otherAccountCodes: AccountCodeOption[];
  productionCategoryOptions: ProductionCategoryOption[];
}) {
  const [state, formAction] = useActionState(createIncomeEntryAction, initialState);
  const formRef = useRef<HTMLFormElement | null>(null);

  useEffect(() => {
    if (state.ok && state.message && formRef.current) {
      formRef.current.reset();
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
        Organization
        <select name="organizationId" required>
          <option value="">Select organization</option>
          {organizations.map((organization) => (
            <option key={organization.id} value={organization.id}>
              {organization.label}
            </option>
          ))}
        </select>
      </label>

      <label>
        Income Type
        <select name="incomeType" defaultValue="starting_budget" required>
          <option value="starting_budget">Starting Budget</option>
          <option value="donation">Donation</option>
          <option value="ticket_sales">Ticket Sales</option>
          <option value="other">Other</option>
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
        Banner Account Code (optional)
        <select name="bannerAccountCodeId" defaultValue="">
          <option value="">Unassigned</option>
          {revenueAccountCodes.length > 0 ? (
            <optgroup label="Revenue Accounts">
              {revenueAccountCodes.map((accountCode) => (
                <option key={accountCode.id} value={accountCode.id}>
                  {accountCode.label}
                </option>
              ))}
            </optgroup>
          ) : null}
          {otherAccountCodes.length > 0 ? (
            <optgroup label="Other Accounts">
              {otherAccountCodes.map((accountCode) => (
                <option key={accountCode.id} value={accountCode.id}>
                  {accountCode.label}
                </option>
              ))}
            </optgroup>
          ) : null}
        </select>
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
        Save Income
      </button>
    </form>
  );
}
