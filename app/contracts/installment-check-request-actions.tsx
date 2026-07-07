"use client";

import { useActionState, useState } from "react";
import { updateContractInstallmentCheckRequestAction, type ActionState } from "@/app/contracts/actions";
import { SensitiveTextInput } from "@/components/sensitive-text-input";
import { calculateCheckRequestSchedule } from "@/lib/check-request-schedule";
import type { ContractInstallmentRow, FoapalOption } from "@/lib/db";

const initialState: ActionState = { ok: true, message: "", timestamp: 0 };

export function InstallmentCheckRequestActions({
  installment,
  foapalOptions
}: {
  installment: ContractInstallmentRow;
  foapalOptions: FoapalOption[];
}) {
  const [state, action] = useActionState(updateContractInstallmentCheckRequestAction, initialState);
  const [open, setOpen] = useState(false);
  const [dueDate, setDueDate] = useState(installment.dueDate ?? "");
  const schedule = calculateCheckRequestSchedule(dueDate);

  return (
    <div className="inlinePanel">
      <button type="button" className="tinyButton" onClick={() => setOpen((value) => !value)}>
        Check Fields
      </button>
      {open ? (
        <form action={action} className="inlineEditForm checkRequestInlineForm">
          <input type="hidden" name="installmentId" value={installment.id} />
          <input type="hidden" name="installmentNumber" value={installment.installmentNumber} />
          {state.message ? (
            <p className={state.ok ? "successNote" : "errorNote"} key={state.timestamp}>
              {state.message}
            </p>
          ) : null}
          <label>
            Due Date
            <input
              name={`installmentDueDate${installment.installmentNumber}`}
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
            />
            {schedule ? (
              <span className="helperText">
                Mail by {schedule.mailBy}; AP needs it by {schedule.apReceiveBy}.
              </span>
            ) : null}
          </label>
          <label>
            FOAPAL
            <select name="checkRequestFoapalId" defaultValue={installment.checkRequestFoapalId ?? ""}>
              <option value="">Use contract default/org</option>
              {foapalOptions.map((foapal) => (
                <option key={foapal.id} value={foapal.id}>
                  {foapal.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Check Delivery
            <select name="checkRequestHandling" defaultValue={installment.checkRequestHandling ?? "mail"}>
              <option value="mail">Mail check</option>
              <option value="business_affairs_pickup">Pick up in Business Affairs</option>
              <option value="other">Other location</option>
            </select>
          </label>
          <label>
            Other Location
            <input name="checkRequestOtherLocation" defaultValue={installment.checkRequestOtherLocation ?? ""} />
          </label>
          <label>
            Address 1
            <input name="vendorAddress1" defaultValue={installment.vendorAddress1 ?? ""} />
          </label>
          <label>
            Address 2
            <input name="vendorAddress2" defaultValue={installment.vendorAddress2 ?? ""} />
          </label>
          <label>
            Address 3
            <input name="vendorAddress3" defaultValue={installment.vendorAddress3 ?? ""} />
          </label>
          <label>
            Tax ID / SSN
            <SensitiveTextInput name="taxIdOrSsn" placeholder="Leave blank to keep saved value" />
            {installment.taxIdLast4 ? <span className="helperText">Saved encrypted value ending in {installment.taxIdLast4}.</span> : null}
          </label>
          <label className="checkboxLabel">
            <input name="clearTaxId" type="checkbox" /> Clear saved Tax ID / SSN
          </label>
          <button type="submit" className="tinyButton">
            Save Check Fields
          </button>
        </form>
      ) : null}
    </div>
  );
}
