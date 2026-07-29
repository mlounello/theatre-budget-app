"use client";

import { useActionState } from "react";
import { SensitiveTextInput } from "@/components/sensitive-text-input";
import {
  saveUnionAgreementAction,
  saveUnionFundAction,
  type UnionActionState
} from "@/app/union-agreements/actions";
import type { FoapalOption, UnionAgreementOption, UnionFundOption } from "@/lib/db";

const initialState: UnionActionState = { ok: true, message: "", timestamp: 0 };

function Notice({ state }: { state: UnionActionState }) {
  return state.message ? (
    <p className={state.ok ? "successNote" : "errorNote"} key={state.timestamp}>
      {state.message}
    </p>
  ) : null;
}

function FundFields({ fund, foapals }: { fund?: UnionFundOption; foapals: FoapalOption[] }) {
  return (
    <>
      <label>
        Fund Payee Name
        <input name="name" defaultValue={fund?.name ?? ""} required />
      </label>
      <label>
        Vendor Number
        <input name="vendorNumber" defaultValue={fund?.vendorNumber ?? ""} />
      </label>
      <label>
        Fund FOAPAL
        <select name="foapalId" defaultValue={fund?.foapalId ?? ""}>
          <option value="">Select FOAPAL</option>
          {foapals.map((foapal) => (
            <option key={foapal.id} value={foapal.id}>{foapal.label}</option>
          ))}
        </select>
      </label>
      <label>
        Check Delivery
        <select name="checkRequestHandling" defaultValue={fund?.checkRequestHandling ?? "mail"}>
          <option value="mail">Mail check</option>
          <option value="business_affairs_pickup">Pick up in Business Affairs</option>
          <option value="other">Other location</option>
        </select>
      </label>
      <label>
        Other Location
        <input name="checkRequestOtherLocation" defaultValue={fund?.checkRequestOtherLocation ?? ""} />
      </label>
      <label>Address 1<input name="vendorAddress1" defaultValue={fund?.vendorAddress1 ?? ""} /></label>
      <label>Address 2<input name="vendorAddress2" defaultValue={fund?.vendorAddress2 ?? ""} /></label>
      <label>Address 3<input name="vendorAddress3" defaultValue={fund?.vendorAddress3 ?? ""} /></label>
      <label>
        Tax ID / W-9
        <SensitiveTextInput name="taxIdOrSsn" placeholder={fund ? "Leave blank to keep saved value" : ""} />
        <span className="helperText">
          {fund?.taxIdLast4 ? `Encrypted value saved ending in ${fund.taxIdLast4}.` : "Stored encrypted."}
        </span>
      </label>
      {fund ? <label className="checkboxLabel"><input type="checkbox" name="clearTaxId" /> Clear saved Tax ID</label> : null}
      <label>Notes<input name="notes" defaultValue={fund?.notes ?? ""} /></label>
      <label>
        Status
        <select name="active" defaultValue={fund?.active === false ? "false" : "true"}>
          <option value="true">Active</option><option value="false">Inactive</option>
        </select>
      </label>
    </>
  );
}

function FundForm({ fund, foapals }: { fund?: UnionFundOption; foapals: FoapalOption[] }) {
  const [state, action] = useActionState(saveUnionFundAction, initialState);
  return (
    <form action={action} className="requestForm">
      {fund ? <input type="hidden" name="unionFundId" value={fund.id} /> : null}
      <Notice state={state} />
      <FundFields fund={fund} foapals={foapals} />
      <button className="buttonLink buttonPrimary" type="submit">{fund ? "Save Fund Profile" : "Add Fund Profile"}</button>
    </form>
  );
}

function AgreementForm({ agreement, funds }: { agreement?: UnionAgreementOption; funds: UnionFundOption[] }) {
  const [state, action] = useActionState(saveUnionAgreementAction, initialState);
  return (
    <form action={action} className="requestForm">
      {agreement ? <input type="hidden" name="unionAgreementId" value={agreement.id} /> : null}
      <Notice state={state} />
      <label>Agreement Name<input name="name" defaultValue={agreement?.name ?? ""} required /></label>
      <label>Union Name<input name="unionName" defaultValue={agreement?.unionName ?? ""} required /></label>
      <label>Version<input name="versionLabel" defaultValue={agreement?.versionLabel ?? ""} placeholder="FY27 or 2026–2027" required /></label>
      <label>Effective From<input name="effectiveFrom" type="date" defaultValue={agreement?.effectiveFrom ?? ""} /></label>
      <label>Effective To<input name="effectiveTo" type="date" defaultValue={agreement?.effectiveTo ?? ""} /></label>
      <div className="stackedDetails">
        <h3>Contribution Funds</h3>
        {Array.from({ length: 8 }, (_, index) => {
          const rule = agreement?.funds[index];
          return (
            <div className="inlineEditForm" key={index}>
              <select name={`fundId_${index}`} defaultValue={rule?.unionFundId ?? ""}>
                <option value="">Unused row</option>
                {funds.filter((fund) => fund.active || fund.id === rule?.unionFundId).map((fund) => (
                  <option key={fund.id} value={fund.id}>{fund.name}</option>
                ))}
              </select>
              <input name={`percentage_${index}`} type="number" step="0.0001" min="0" max="100" defaultValue={rule?.percentage ?? ""} placeholder="Percent" />
              <select name={`contributionType_${index}`} defaultValue={rule?.contributionType ?? "employer_paid"}>
                <option value="employer_paid">Employer-paid addition</option>
                <option value="artist_withholding">Artist withholding</option>
              </select>
            </div>
          );
        })}
      </div>
      <label>Notes<input name="notes" defaultValue={agreement?.notes ?? ""} /></label>
      <label>
        Status
        <select name="active" defaultValue={agreement?.active === false ? "false" : "true"}>
          <option value="true">Active</option><option value="false">Inactive</option>
        </select>
      </label>
      <button className="buttonLink buttonPrimary" type="submit">{agreement ? "Save Agreement" : "Create Agreement Version"}</button>
    </form>
  );
}

export function UnionAgreementManager({
  funds,
  agreements,
  foapals
}: {
  funds: UnionFundOption[];
  agreements: UnionAgreementOption[];
  foapals: FoapalOption[];
}) {
  return (
    <>
      <article className="panel requestFormPanel"><h2>Add Union Fund Payee</h2><FundForm foapals={foapals} /></article>
      <article className="panel tablePanel">
        <h2>Union Fund Payees</h2>
        <div className="stackedDetails">
          {funds.map((fund) => <details className="panel nestedPanel" key={fund.id}><summary><strong>{fund.name}</strong> — {fund.active ? "Active" : "Inactive"}</summary><FundForm fund={fund} foapals={foapals} /></details>)}
        </div>
      </article>
      <article className="panel requestFormPanel"><h2>Create Union Agreement Version</h2><AgreementForm funds={funds} /></article>
      <article className="panel tablePanel">
        <h2>Agreement Versions</h2>
        <div className="stackedDetails">
          {agreements.map((agreement) => <details className="panel nestedPanel" key={agreement.id}><summary><strong>{agreement.name}</strong> — {agreement.versionLabel} — {agreement.active ? "Active" : "Inactive"}</summary><AgreementForm agreement={agreement} funds={funds} /></details>)}
        </div>
      </article>
    </>
  );
}
