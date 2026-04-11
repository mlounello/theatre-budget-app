"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createStatementMonthAction, type ActionState } from "@/app/cc/actions";

type CardOption = {
  id: string;
  nickname: string;
  maskedNumber: string | null;
  active: boolean;
};

const initialState: ActionState = { ok: true, message: "", timestamp: 0 };

export function CreateStatementMonthForm({ cards }: { cards: CardOption[] }) {
  const [state, formAction] = useActionState(createStatementMonthAction, initialState);
  const formRef = useRef<HTMLFormElement | null>(null);
  const [creditCardId, setCreditCardId] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem("tba_cc_credit_card_id");
    if (saved) setCreditCardId(saved);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("tba_cc_credit_card_id", creditCardId);
  }, [creditCardId]);

  useEffect(() => {
    if (!state.ok || !state.message || !formRef.current) return;
    formRef.current.reset();
  }, [state]);

  return (
    <form action={formAction} className="requestForm" ref={formRef}>
      {state.message ? (
        <p className={state.ok ? "successNote" : "errorNote"} key={state.timestamp}>
          {state.message}
        </p>
      ) : null}
      <label>
        Credit Card
        <select name="creditCardId" required value={creditCardId} onChange={(event) => setCreditCardId(event.target.value)}>
          <option value="">Select card</option>
          {cards
            .filter((card) => card.active)
            .map((card) => (
              <option key={card.id} value={card.id}>
                {card.nickname} {card.maskedNumber ? `(${card.maskedNumber})` : ""}
              </option>
            ))}
        </select>
      </label>
      <label>
        Statement Month
        <input type="month" name="statementMonth" required />
      </label>
      <button type="submit" className="buttonLink buttonPrimary">
        Save Statement Month
      </button>
    </form>
  );
}
