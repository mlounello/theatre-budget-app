"use client";

import { useActionState, useMemo, useState } from "react";
import { createExpenseClaimAction, type ExpenseClaimActionState } from "@/app/cc/expense-claim-actions";
import type { FormEvent } from "react";

type Project = { id: string; name: string; season?: string | null };
type Organization = { id: string; name: string; orgCode: string };
type Card = { id: string; nickname: string; active: boolean };
type Option = { id: string; label?: string; name?: string };
type FundingClaim = {
  id: string;
  claimNumber: string;
  authorizedAmount: number;
  settledAmount: number;
  creditCardId: string | null;
};
type DraftLine = {
  expenseNumber: string;
  title: string;
  amount: string;
  expenseDate: string;
  note: string;
  projectId: string;
  organizationId: string;
  productionCategoryId: string;
  bannerAccountCodeId: string;
};

const initialState: ExpenseClaimActionState = { ok: true, message: "", timestamp: 0 };
const blankLine = (): DraftLine => ({
  expenseNumber: "", title: "", amount: "", expenseDate: "", note: "",
  projectId: "", organizationId: "", productionCategoryId: "", bannerAccountCodeId: ""
});

export function ExpenseClaimForm({
  fiscalYearId,
  projects,
  organizations,
  cards,
  accountCodes,
  productionCategories,
  fundingClaims,
  onCancel
}: {
  fiscalYearId: string;
  projects: Project[];
  organizations: Organization[];
  cards: Card[];
  accountCodes: Option[];
  productionCategories: Option[];
  fundingClaims: FundingClaim[];
  onCancel?: () => void;
}) {
  const [state, action] = useActionState(createExpenseClaimAction, initialState);
  const [type, setType] = useState<"funding_request" | "monthly_reconciliation" | "reimbursement">("funding_request");
  const [creditCardId, setCreditCardId] = useState("");
  const [authorizationClaimId, setAuthorizationClaimId] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([blankLine()]);
  const total = lines.reduce((sum, line) => sum + (Number.parseFloat(line.amount) || 0), 0);
  const selectedAuthorization = fundingClaims.find((claim) => claim.id === authorizationClaimId);
  const availableAuthorizations = useMemo(
    () => fundingClaims.filter((claim) =>
      (!creditCardId || claim.creditCardId === creditCardId)
    ),
    [fundingClaims, creditCardId]
  );
  const overage = selectedAuthorization ? Math.max(total - selectedAuthorization.authorizedAmount, 0) : 0;

  function updateLine(index: number, patch: Partial<DraftLine>) {
    setLines((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const input = event.currentTarget.elements.namedItem("linesJson") as HTMLInputElement | null;
    if (input) input.value = JSON.stringify(lines);
  }

  return (
    <form action={action} className="uiDrawerForm expenseClaimForm" onSubmit={handleSubmit}>
      <input type="hidden" name="fiscalYearId" value={fiscalYearId} />
      <input type="hidden" name="linesJson" />
      {state.message ? <p className={state.ok ? "successNote" : "errorNote"}>{state.message}</p> : null}

      <div className="drawerFieldGrid">
        <label>
          Claim Type
          <select name="claimType" value={type} onChange={(event) => {
            const next = event.target.value as typeof type;
            setType(next);
            if (next === "reimbursement") setCreditCardId("");
          }}>
            <option value="funding_request">Card Funding Request</option>
            <option value="monthly_reconciliation">Monthly Card Reconciliation</option>
            <option value="reimbursement">Reimbursement</option>
          </select>
        </label>
        <label>
          Expense Claim Number
          <input name="claimNumber" required pattern="EC[0-9]{6}" placeholder="EC######" />
        </label>
        {type !== "reimbursement" ? (
          <label>
            Physical Card
            <select name="creditCardId" value={creditCardId} onChange={(event) => setCreditCardId(event.target.value)} required>
              <option value="">Select card</option>
              {cards.filter((card) => card.active).map((card) => <option key={card.id} value={card.id}>{card.nickname}</option>)}
            </select>
          </label>
        ) : null}
        <label>
          Claim Month
          <input name="claimMonth" type="month" required={type === "monthly_reconciliation"} />
        </label>
      </div>

      {type === "monthly_reconciliation" ? (
        <label>
          Original Funding Request
          <select name="authorizationClaimId" value={authorizationClaimId} onChange={(event) => setAuthorizationClaimId(event.target.value)} required>
            <option value="">Select original EC</option>
            {availableAuthorizations.map((claim) => (
              <option key={claim.id} value={claim.id}>
                {claim.claimNumber} · Authorized ${claim.authorizedAmount.toFixed(2)} · Reconciled ${claim.settledAmount.toFixed(2)}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <section className="expenseLinesEditor">
        <div className="contractsPanelHeader">
          <div>
            <h3>Expenses</h3>
            <p className="helperText">Each EX###### Expense selects its own budget destination. The EC###### claim is only the collection.</p>
          </div>
          <button type="button" className="tinyButton" onClick={() => setLines((current) => [...current, blankLine()])}>Add Expense</button>
        </div>
        {lines.map((line, index) => (
          <fieldset className="expenseLineCard" key={index}>
            <legend>Expense {index + 1}</legend>
            <div className="drawerFieldGrid">
              <label>Expense Number<input value={line.expenseNumber} onChange={(event) => updateLine(index, { expenseNumber: event.target.value.toUpperCase() })} pattern="EX[0-9]{6}" placeholder="EX######" required /></label>
              <label>Purchase / Expense<input value={line.title} onChange={(event) => updateLine(index, { title: event.target.value })} required /></label>
              <label>Amount<input type="number" min="0.01" step="0.01" value={line.amount} onChange={(event) => updateLine(index, { amount: event.target.value })} required /></label>
              <label>Date<input type="date" value={line.expenseDate} onChange={(event) => updateLine(index, { expenseDate: event.target.value })} /></label>
              <label>
                Charge To
                <select
                  value={line.projectId ? `project:${line.projectId}` : line.organizationId ? `organization:${line.organizationId}` : ""}
                  onChange={(event) => {
                    const [scopeType, scopeId] = event.target.value.split(":");
                    updateLine(index, {
                      projectId: scopeType === "project" ? scopeId : "",
                      organizationId: scopeType === "organization" ? scopeId : "",
                      productionCategoryId: ""
                    });
                  }}
                  required
                >
                  <option value="">Select project or organization budget</option>
                  <optgroup label="Theatre Projects">
                    {projects.map((project) => <option key={project.id} value={`project:${project.id}`}>{project.name}{project.season ? ` (${project.season})` : ""}</option>)}
                  </optgroup>
                  <optgroup label="Organization Budgets">
                    {organizations.map((organization) => <option key={organization.id} value={`organization:${organization.id}`}>{organization.orgCode} | {organization.name}</option>)}
                  </optgroup>
                </select>
              </label>
              <label>
                Production Category
                <select value={line.productionCategoryId} onChange={(event) => updateLine(index, { productionCategoryId: event.target.value })} required={Boolean(line.projectId)} disabled={!line.projectId}>
                  <option value="">{line.projectId ? "Select category" : "Not used for organization budgets"}</option>
                  {productionCategories.map((option) => <option key={option.id} value={option.id}>{option.name ?? option.label}</option>)}
                </select>
              </label>
              <label>
                Banner Account / FOAP Charge
                <select value={line.bannerAccountCodeId} onChange={(event) => updateLine(index, { bannerAccountCodeId: event.target.value })} required>
                  <option value="">Select account</option>
                  {accountCodes.map((option) => <option key={option.id} value={option.id}>{option.label ?? option.name}</option>)}
                </select>
              </label>
              {type !== "funding_request" ? <label>Receipt<input name={`receiptFile_${index}`} type="file" accept="application/pdf,image/png,image/jpeg,image/webp,image/heic,image/heif" required /></label> : null}
              <label className="drawerFieldWide">Notes<input value={line.note} onChange={(event) => updateLine(index, { note: event.target.value })} /></label>
            </div>
            {lines.length > 1 ? <button type="button" className="tinyButton dangerButton" onClick={() => setLines((current) => current.filter((_, lineIndex) => lineIndex !== index))}>Remove Expense</button> : null}
          </fieldset>
        ))}
      </section>

      <div className="expenseClaimTotal">
        <span>{type === "funding_request" ? "Authorization hold" : "Claim total"}</span>
        <strong>${total.toFixed(2)}</strong>
      </div>
      {overage > 0 ? (
        <label className="drawerFieldWide errorNote">
          Overage Explanation — ${overage.toFixed(2)} above authorization
          <textarea name="overageExplanation" required />
        </label>
      ) : <input type="hidden" name="overageExplanation" value="" />}
      <label>Claim Notes<textarea name="notes" /></label>
      <div className="buttonCluster">
        {onCancel ? <button type="button" className="buttonLink" onClick={onCancel}>Cancel</button> : null}
        <button type="submit" className="buttonLink buttonPrimary">Save Expense Claim</button>
      </div>
    </form>
  );
}
