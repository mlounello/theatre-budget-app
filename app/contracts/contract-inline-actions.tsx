"use client";

import { useActionState } from "react";
import {
  updateContractInstallmentStatusAction,
  updateContractWorkflowAction,
  type ActionState
} from "@/app/contracts/actions";
import type { ContractInstallmentRow, ContractRow } from "@/lib/db";

const initialState: ActionState = { ok: true, message: "", timestamp: 0 };

export function ContractWorkflowControl({ contract }: { contract: ContractRow }) {
  const [state, formAction] = useActionState(updateContractWorkflowAction, initialState);

  return (
    <>
      {state.message ? (
        <p className={state.ok ? "successNote" : "errorNote"} key={state.timestamp}>
          {state.message}
        </p>
      ) : null}
      <form action={formAction} className="inlineEditForm">
        <input type="hidden" name="contractId" value={contract.id} />
        <select name="workflowStatus" defaultValue={contract.workflowStatus}>
          <option value="w9_requested">W9 Requested</option>
          <option value="contract_sent">Contract Sent</option>
          <option value="contract_signed_returned">Contract Signed + Returned</option>
          <option value="siena_signed">Siena Signed</option>
        </select>
        <button className="tinyButton" type="submit">
          Save
        </button>
      </form>
    </>
  );
}

export function ContractInstallmentControl({ installment }: { installment: ContractInstallmentRow }) {
  const [state, formAction] = useActionState(updateContractInstallmentStatusAction, initialState);

  return (
    <>
      {state.message ? (
        <p className={state.ok ? "successNote" : "errorNote"} key={state.timestamp}>
          {state.message}
        </p>
      ) : null}
      <form action={formAction} className="inlineEditForm">
        <input type="hidden" name="installmentId" value={installment.id} />
        <select name="status" defaultValue={installment.status}>
          <option value="planned">Not Submitted</option>
          <option value="check_request_submitted">Check Request Submitted</option>
          <option value="check_paid">Check Paid</option>
        </select>
        <button type="submit" className="tinyButton">
          Save
        </button>
      </form>
    </>
  );
}
