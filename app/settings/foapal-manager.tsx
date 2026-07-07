"use client";

import { useActionState } from "react";
import { createFoapalAction, createFundAction, createProgramAction, type ActionState } from "@/app/settings/actions";
import type { FoapalOption, FundOption, OrganizationOption, ProgramOption } from "@/lib/db";

const initialState: ActionState = { ok: true, message: "", timestamp: 0 };

function Notice({ state }: { state: ActionState }) {
  if (!state.message) return null;
  return (
    <p className={state.ok ? "successNote" : "errorNote"} key={state.timestamp}>
      {state.message}
    </p>
  );
}

export function FoapalManager({
  funds,
  programs,
  organizations,
  foapals
}: {
  funds: FundOption[];
  programs: ProgramOption[];
  organizations: OrganizationOption[];
  foapals: FoapalOption[];
}) {
  const [fundState, fundAction] = useActionState(createFundAction, initialState);
  const [programState, programAction] = useActionState(createProgramAction, initialState);
  const [foapalState, foapalAction] = useActionState(createFoapalAction, initialState);

  return (
    <article className="panel requestFormPanel">
      <h2>FOAPAL Setup</h2>
      <p className="helperText">
        Create reusable Fund + Organization + Program combinations for check requests. Account still comes from the contract
        Banner account.
      </p>
      <div className="panelGrid">
        <form action={fundAction} className="requestForm">
          <h3>Funds</h3>
          <Notice state={fundState} />
          <label>
            Fund Code
            <input name="fundCode" placeholder="110" required />
          </label>
          <label>
            Fund Name
            <input name="fundName" placeholder="Operating Fund" required />
          </label>
          <button type="submit" className="buttonLink buttonPrimary">
            Add Fund
          </button>
        </form>

        <form action={programAction} className="requestForm">
          <h3>Programs</h3>
          <Notice state={programState} />
          <label>
            Program Code
            <input name="programCode" placeholder="0000" required />
          </label>
          <label>
            Program Name
            <input name="programName" placeholder="Default Program" required />
          </label>
          <button type="submit" className="buttonLink buttonPrimary">
            Add Program
          </button>
        </form>

        <form action={foapalAction} className="requestForm">
          <h3>FOAPALs</h3>
          <Notice state={foapalState} />
          <label>
            Fund
            <select name="fundId" required>
              <option value="">Select fund</option>
              {funds.map((fund) => (
                <option key={fund.id} value={fund.id}>
                  {fund.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Organization
            <select name="organizationId" required>
              <option value="">Select org</option>
              {organizations.map((organization) => (
                <option key={organization.id} value={organization.id}>
                  {organization.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Program
            <select name="programId" required>
              <option value="">Select program</option>
              {programs.map((program) => (
                <option key={program.id} value={program.id}>
                  {program.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Label
            <input name="foapalLabel" placeholder="Optional display label" />
          </label>
          <button type="submit" className="buttonLink buttonPrimary">
            Add FOAPAL
          </button>
        </form>
      </div>

      <div className="tableWrap">
        <table>
          <thead>
            <tr>
              <th>FOAPAL</th>
              <th>Fund</th>
              <th>Org</th>
              <th>Program</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {foapals.length === 0 ? (
              <tr>
                <td colSpan={5}>No FOAPALs yet.</td>
              </tr>
            ) : (
              foapals.map((foapal) => (
                <tr key={foapal.id}>
                  <td>{foapal.label}</td>
                  <td>{foapal.fundCode}</td>
                  <td>
                    {foapal.orgCode} | {foapal.organizationName}
                  </td>
                  <td>{foapal.programCode}</td>
                  <td>{foapal.active ? "Active" : "Inactive"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </article>
  );
}
