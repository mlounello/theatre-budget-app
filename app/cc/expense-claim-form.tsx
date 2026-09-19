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
  projectId: string | null;
  organizationId: string;
  creditCardId: string | null;
};
type DraftLine = { expenseNumber: string; title: string; amount: string; expenseDate: string; note: string };

const initialState: ExpenseClaimActionState = { ok: true, message: "", timestamp: 0 };
const blankLine = (): DraftLine => ({ expenseNumber: "", title: "", amount: "", expenseDate: "", note: "" });

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
  const [projectId, setProjectId] = useState("");
  const [organizationId, setOrganizationId] = useState("");
  const [creditCardId, setCreditCardId] = useState("");
  const [authorizationClaimId, setAuthorizationClaimId] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([blankLine()]);
  const total = lines.reduce((sum, line) => sum + (Number.parseFloat(line.amount) || 0), 0);
  const selectedAuthorization = fundingClaims.find((claim) => claim.id === authorizationClaimId);
  const availableAuthorizations = useMemo(
    () => fundingClaims.filter((claim) =>
      (!projectId || claim.projectId === projectId) &&
      (!organizationId || claim.organizationId === organizationId) &&
      (!creditCardId || claim.creditCardId === creditCardId)
    ),
    [fundingClaims, projectId, organizationId, creditCardId]
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
        <label>
          Theatre Project
          <select name="projectId" value={projectId} onChange={(event) => {
            setProjectId(event.target.value);
            if (event.target.value) setOrganizationId("");
          }}>
            <option value="">No theatre project</option>
            {projects.map((project) => <option key={project.id} value={project.id}>{project.name}{project.season ? ` (${project.season})` : ""}</option>)}
          </select>
        </label>
        <label>
          Organization Budget
          <select name="organizationId" value={organizationId} onChange={(event) => {
            setOrganizationId(event.target.value);
            if (event.target.value) setProjectId("");
          }}>
            <option value="">No organization budget</option>
            {organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.orgCode} | {organization.name}</option>)}
          </select>
        </label>
        <label>
          Department
          <select name="productionCategoryId" required={Boolean(projectId)}>
            <option value="">{projectId ? "Select department" : "Not required"}</option>
            {productionCategories.map((option) => <option key={option.id} value={option.id}>{option.name ?? option.label}</option>)}
          </select>
        </label>
        <label>
          Banner Account
          <select name="bannerAccountCodeId" required>
            <option value="">Select account</option>
            {accountCodes.map((option) => <option key={option.id} value={option.id}>{option.label ?? option.name}</option>)}
          </select>
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
            <p className="helperText">Each purchase or receipt is its own EX###### Expense inside this EC###### claim.</p>
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
