"use client";

import { useEffect, useState } from "react";
import { createStatementMonthAction } from "@/app/cc/actions";

type CardOption = {
  id: string;
  nickname: string;
  maskedNumber: string | null;
  active: boolean;
};

export function CreateStatementMonthForm({ cards }: { cards: CardOption[] }) {
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

  return (
    <form action={createStatementMonthAction} className="requestForm">
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
