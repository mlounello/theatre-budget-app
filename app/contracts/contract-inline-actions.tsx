"use client";

import { useActionState } from "react";
import {
  updateContractInstallmentStatusAction,
  updateContractWorkflowAction,
  type ActionState
} from "@/app/contracts/actions";
import { ActionNotice } from "@/components/ui/action-notice";
import { PendingButton } from "@/components/ui/pending-button";
import { StatusSelector } from "@/components/ui/status-controls";
import type { ContractInstallmentRow, ContractRow } from "@/lib/db";

const initialState: ActionState = { ok: true, message: "", timestamp: 0 };

export function ContractWorkflowControl({
  contract,
  compact = false
}: {
  contract: ContractRow;
  compact?: boolean;
}) {
  const [state, formAction] = useActionState(updateContractWorkflowAction, initialState);
  const isTemporaryEmployee = contract.engagementType === "temporary_employee";

  return (
    <div className={compact ? "contractQuickStatusControl" : undefined}>
      {compact ? <span className="contractQuickStatusLabel">Change status</span> : null}
      {state.message ? (
        <ActionNotice tone={state.ok ? "success" : "error"} key={state.timestamp}>
          {state.message}
        </ActionNotice>
      ) : null}
      <form action={formAction} className={compact ? "contractQuickStatusForm" : "inlineEditForm"}>
        <input type="hidden" name="contractId" value={contract.id} />
        <StatusSelector label={isTemporaryEmployee ? "Hiring status" : "Agreement status"} className={compact ? "isCompact" : ""}>
          <select
            name="workflowStatus"
            defaultValue={contract.workflowStatus}
            aria-label={`Contract status for ${contract.contractorName}`}
          >
            <option value="w9_requested">{isTemporaryEmployee ? "Not Started" : "W-9 Requested"}</option>
            <option value="contract_sent">{isTemporaryEmployee ? "Submitted to HR" : "Agreement Sent"}</option>
            <option value="contract_signed_returned">{isTemporaryEmployee ? "HR Onboarding" : "Signed + Returned"}</option>
            <option value="siena_signed">{isTemporaryEmployee ? "Onboarding Complete" : "Siena Signed"}</option>
          </select>
        </StatusSelector>
        <PendingButton className="tinyButton" type="submit" pendingLabel="Saving…">
          Save
        </PendingButton>
      </form>
    </div>
  );
}

export function ContractInstallmentControl({ installment }: { installment: ContractInstallmentRow }) {
  const [state, formAction] = useActionState(updateContractInstallmentStatusAction, initialState);
  const isPayroll = installment.paymentChannel === "payroll";

  return (
    <>
      {state.message ? (
        <ActionNotice tone={state.ok ? "success" : "error"} key={state.timestamp}>
          {state.message}
        </ActionNotice>
      ) : null}
      <form action={formAction} className="inlineEditForm">
        <input type="hidden" name="installmentId" value={installment.id} />
        <StatusSelector label="Payment status">
          <select
            name="status"
            defaultValue={installment.status}
            aria-label={`Payment status for installment ${installment.installmentNumber}`}
          >
            <option value="planned">{isPayroll ? "Planned" : "Not Submitted"}</option>
            <option value="check_request_submitted">{isPayroll ? "Submitted to Payroll" : "Check Request Submitted"}</option>
            <option value="check_paid">{isPayroll ? "Paid through Payroll" : "Check Paid"}</option>
          </select>
        </StatusSelector>
        <PendingButton type="submit" className="tinyButton" pendingLabel="Saving…">
          Save
        </PendingButton>
      </form>
    </>
  );
}
