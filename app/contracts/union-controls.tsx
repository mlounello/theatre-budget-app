"use client";

import { useActionState } from "react";
import {
  updateUnionContributionStatusAction,
  updateUnionSignatureStatusAction,
  type ActionState
} from "@/app/contracts/actions";
import type { ContractRow, ContractUnionContributionRow } from "@/lib/db";

const initialState: ActionState = { ok: true, message: "", timestamp: 0 };

export function UnionSignatureControl({ contract }: { contract: ContractRow }) {
  const [state, action] = useActionState(updateUnionSignatureStatusAction, initialState);
  return (
    <>
      {state.message ? <span className={state.ok ? "successNote" : "errorNote"}>{state.message}</span> : null}
      <form action={action} className="inlineEditForm">
        <input type="hidden" name="contractId" value={contract.id} />
        <select name="unionSignatureStatus" defaultValue={contract.unionSignatureStatus}>
          <option value="not_started">Not Started</option>
          <option value="sent_to_union">Sent to Union</option>
          <option value="union_countersigned">Union Countersigned</option>
          <option value="complete">Complete</option>
        </select>
        <button type="submit" className="tinyButton">Save</button>
      </form>
    </>
  );
}

export function UnionContributionStatusControl({ contribution }: { contribution: ContractUnionContributionRow }) {
  const [state, action] = useActionState(updateUnionContributionStatusAction, initialState);
  return (
    <>
      {state.message ? <span className={state.ok ? "successNote" : "errorNote"}>{state.message}</span> : null}
      <form action={action} className="inlineEditForm">
        <input type="hidden" name="contributionId" value={contribution.id} />
        <select name="status" defaultValue={contribution.status}>
          <option value="planned">Not Submitted</option>
          <option value="check_request_submitted">Check Request Submitted</option>
          <option value="check_paid">Check Paid</option>
        </select>
        <button type="submit" className="tinyButton">Save</button>
      </form>
    </>
  );
}
