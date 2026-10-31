"use client";

import { useActionState } from "react";
import { updateCheckRequestAutomationAction, type ActionState } from "@/app/contracts/actions";
import { ActionNotice } from "@/components/ui/action-notice";
import { PendingButton } from "@/components/ui/pending-button";
import type { CheckRequestAutomationStatus } from "@/lib/db";

const initialState: ActionState = { ok: true, message: "", timestamp: 0 };

export function CheckRequestAutomationControl({
  kind,
  itemId,
  status,
  sentAt,
  error
}: {
  kind: "installment" | "union";
  itemId: string;
  status: CheckRequestAutomationStatus;
  sentAt?: string | null;
  error?: string | null;
}) {
  const [state, action] = useActionState(updateCheckRequestAutomationAction, initialState);
  const isReady = status === "ready" || status === "sending";
  const label = status === "sent" ? "Sent automatically" : status === "failed" ? "Send failed" : isReady ? "READY · Auto-send" : "Not ready";
  return (
    <div className="checkAutomationControl">
      <span className={`checkAutomationPill is-${status}`}>{label}</span>
      {sentAt ? <small>Sent {new Date(sentAt).toLocaleDateString()}</small> : null}
      {error ? <small className="errorNote">{error}</small> : null}
      {state.message ? <ActionNotice tone={state.ok ? "success" : "error"}>{state.message}</ActionNotice> : null}
      {status !== "sent" && status !== "sending" ? (
        <form action={action}>
          <input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="itemId" value={itemId} />
          <input type="hidden" name="ready" value={isReady ? "false" : "true"} />
          <PendingButton className="tinyButton" pendingLabel="Saving…">
            {isReady ? "Remove READY" : status === "failed" ? "Review & retry" : "Mark READY"}
          </PendingButton>
        </form>
      ) : null}
    </div>
  );
}
