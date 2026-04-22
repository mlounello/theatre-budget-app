"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import {
  bulkDeleteCreditCardsAction,
  bulkDeleteStatementMonthsAction,
  bulkUpdateCreditCardsAction,
  bulkUpdateStatementMonthsAction,
  deleteCreditCardAction,
  deleteStatementMonthAction,
  reopenStatementMonthAction,
  updateCreditCardAction,
  updateStatementMonthAction,
  type ActionState
} from "@/app/cc/actions";

type CardRow = {
  id: string;
  nickname: string;
  maskedNumber: string | null;
  active: boolean;
};

type StatementMonthRow = {
  id: string;
  creditCardId: string;
  creditCardName: string;
  statementMonth: string;
  postedAt: string | null;
  postedToBannerAt: string | null;
};

type MonthSortKey = "statementMonth" | "creditCardName" | "state";
type MonthSortDirection = "asc" | "desc";

const initialState: ActionState = { ok: true, message: "", timestamp: 0 };

function monthStateValue(month: StatementMonthRow): string {
  if (month.postedToBannerAt) return "posted_to_banner";
  if (month.postedAt) return "statement_paid";
  return "open";
}

export function CcAdminTables({
  cards,
  statementMonths
}: {
  cards: CardRow[];
  statementMonths: StatementMonthRow[];
}) {
  const [bulkCardUpdateState, bulkCardUpdateAction] = useActionState(bulkUpdateCreditCardsAction, initialState);
  const [bulkCardDeleteState, bulkCardDeleteAction] = useActionState(bulkDeleteCreditCardsAction, initialState);
  const [bulkMonthUpdateState, bulkMonthUpdateAction] = useActionState(bulkUpdateStatementMonthsAction, initialState);
  const [bulkMonthDeleteState, bulkMonthDeleteAction] = useActionState(bulkDeleteStatementMonthsAction, initialState);
  const [updateCardState, updateCardAction] = useActionState(updateCreditCardAction, initialState);
  const [deleteCardState, deleteCardAction] = useActionState(deleteCreditCardAction, initialState);
  const [updateMonthState, updateMonthAction] = useActionState(updateStatementMonthAction, initialState);
  const [deleteMonthState, deleteMonthAction] = useActionState(deleteStatementMonthAction, initialState);
  const [reopenMonthState, reopenMonthAction] = useActionState(reopenStatementMonthAction, initialState);

  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);
  const [selectedMonthIds, setSelectedMonthIds] = useState<string[]>([]);
  const [monthSortKey, setMonthSortKey] = useState<MonthSortKey>("statementMonth");
  const [monthSortDirection, setMonthSortDirection] = useState<MonthSortDirection>("desc");
  const [cardEdits, setCardEdits] = useState<Record<string, { nickname: string; maskedNumber: string; active: boolean }>>({});
  const [monthEdits, setMonthEdits] = useState<Record<string, { statementMonth: string; creditCardId: string }>>({});
  const selectedCardSet = useMemo(() => new Set(selectedCardIds), [selectedCardIds]);
  const selectedMonthSet = useMemo(() => new Set(selectedMonthIds), [selectedMonthIds]);
  const sortedStatementMonths = useMemo(() => {
    const dir = monthSortDirection === "asc" ? 1 : -1;
    return [...statementMonths].sort((a, b) => {
      const cmp =
        monthSortKey === "statementMonth"
          ? a.statementMonth.localeCompare(b.statementMonth)
          : monthSortKey === "creditCardName"
            ? a.creditCardName.localeCompare(b.creditCardName)
            : monthStateValue(a).localeCompare(monthStateValue(b));
      return cmp * dir;
    });
  }, [monthSortDirection, monthSortKey, statementMonths]);

  const allCardsSelected = cards.length > 0 && cards.every((card) => selectedCardSet.has(card.id));
  const allMonthsSelected = sortedStatementMonths.length > 0 && sortedStatementMonths.every((month) => selectedMonthSet.has(month.id));

  useEffect(() => {
    if (bulkCardDeleteState.ok && bulkCardDeleteState.message) {
      setSelectedCardIds([]);
    }
  }, [bulkCardDeleteState]);

  useEffect(() => {
    if (bulkMonthDeleteState.ok && bulkMonthDeleteState.message) {
      setSelectedMonthIds([]);
    }
  }, [bulkMonthDeleteState]);

  useEffect(() => {
    setCardEdits((prev) => {
      const next = { ...prev };
      for (const card of cards) {
        if (!next[card.id]) {
          next[card.id] = {
            nickname: card.nickname ?? "",
            maskedNumber: card.maskedNumber ?? "",
            active: Boolean(card.active)
          };
        }
      }
      return next;
    });
  }, [cards]);

  useEffect(() => {
    setMonthEdits((prev) => {
      const next = { ...prev };
      for (const month of statementMonths) {
        if (!next[month.id]) {
          next[month.id] = {
            statementMonth: month.statementMonth.slice(0, 7),
            creditCardId: month.creditCardId
          };
        }
      }
      return next;
    });
  }, [statementMonths]);

  function toggleMonthSort(key: MonthSortKey): void {
    if (monthSortKey === key) {
      setMonthSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setMonthSortKey(key);
    setMonthSortDirection("asc");
  }

  function toggleCard(id: string): void {
    setSelectedCardIds((prev) => (prev.includes(id) ? prev.filter((entry) => entry !== id) : [...prev, id]));
  }
  function toggleMonth(id: string): void {
    setSelectedMonthIds((prev) => (prev.includes(id) ? prev.filter((entry) => entry !== id) : [...prev, id]));
  }
  function toggleAllCards(): void {
    if (allCardsSelected) {
      setSelectedCardIds([]);
      return;
    }
    setSelectedCardIds(cards.map((card) => card.id));
  }
  function toggleAllMonths(): void {
    if (allMonthsSelected) {
      setSelectedMonthIds([]);
      return;
    }
    setSelectedMonthIds(sortedStatementMonths.map((month) => month.id));
  }

  return (
    <>
      {bulkCardUpdateState.message ? (
        <p className={bulkCardUpdateState.ok ? "successNote" : "errorNote"} key={bulkCardUpdateState.timestamp}>
          {bulkCardUpdateState.message}
        </p>
      ) : null}
      {bulkCardDeleteState.message ? (
        <p className={bulkCardDeleteState.ok ? "successNote" : "errorNote"} key={bulkCardDeleteState.timestamp}>
          {bulkCardDeleteState.message}
        </p>
      ) : null}
      {updateCardState.message ? (
        <p className={updateCardState.ok ? "successNote" : "errorNote"} key={updateCardState.timestamp}>
          {updateCardState.message}
        </p>
      ) : null}
      {deleteCardState.message ? (
        <p className={deleteCardState.ok ? "successNote" : "errorNote"} key={deleteCardState.timestamp}>
          {deleteCardState.message}
        </p>
      ) : null}

      <div className="bulkToolbar" style={{ marginTop: "0.65rem" }}>
        <p className="bulkMeta">Selected cards: {selectedCardIds.length}</p>
        <div className="bulkActions">
          <form action={bulkCardUpdateAction} className="inlineEditForm">
            <input type="hidden" name="selectedIdsJson" value={JSON.stringify(selectedCardIds)} />
            <label className="checkboxLabel">
              <input name="applyActive" type="checkbox" />
              Active
            </label>
            <select name="activeValue" defaultValue="true">
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
            <label className="checkboxLabel">
              <input name="applyMaskedNumber" type="checkbox" />
              Masked
            </label>
            <input name="maskedNumber" placeholder="****1234" />
            <button type="submit" className="tinyButton" disabled={selectedCardIds.length === 0}>
              Bulk Save Cards
            </button>
          </form>
          <form
            action={bulkCardDeleteAction}
            onSubmit={(event) => {
              if (!window.confirm(`Delete ${selectedCardIds.length} selected card(s)?`)) event.preventDefault();
            }}
          >
            <input type="hidden" name="selectedIdsJson" value={JSON.stringify(selectedCardIds)} />
            <button type="submit" className="tinyButton dangerButton" disabled={selectedCardIds.length === 0}>
              Bulk Delete Cards
            </button>
          </form>
        </div>
      </div>

      <div className="tableWrap" style={{ marginTop: "0.5rem" }}>
        <table>
          <thead>
            <tr>
              <th className="rowSelectHeader">
                <input type="checkbox" checked={allCardsSelected} onChange={toggleAllCards} />
              </th>
              <th>Nickname</th>
              <th>Masked</th>
              <th>Active</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {cards.length === 0 ? (
              <tr>
                <td colSpan={5}>No cards yet.</td>
              </tr>
            ) : null}
            {cards.map((card) => (
              <tr key={card.id}>
                <td className="rowSelectCell">
                  <input type="checkbox" checked={selectedCardSet.has(card.id)} onChange={() => toggleCard(card.id)} />
                </td>
                <td>{card.nickname}</td>
                <td>{card.maskedNumber ?? "-"}</td>
                <td>{card.active ? "Yes" : "No"}</td>
                <td className="actionCell">
                  <details>
                    <summary className="tinyButton" style={{ listStyle: "none", cursor: "pointer" }}>
                      Edit
                    </summary>
                    <form action={updateCardAction} className="inlineEditForm" style={{ marginTop: "0.4rem" }}>
                      <input type="hidden" name="id" value={card.id} />
                      <input
                        name="nickname"
                        value={cardEdits[card.id]?.nickname ?? ""}
                        onChange={(event) =>
                          setCardEdits((prev) => ({
                            ...prev,
                            [card.id]: { ...(prev[card.id] ?? { nickname: "", maskedNumber: "", active: true }), nickname: event.target.value }
                          }))
                        }
                        required
                      />
                      <input
                        name="maskedNumber"
                        value={cardEdits[card.id]?.maskedNumber ?? ""}
                        onChange={(event) =>
                          setCardEdits((prev) => ({
                            ...prev,
                            [card.id]: { ...(prev[card.id] ?? { nickname: "", maskedNumber: "", active: true }), maskedNumber: event.target.value }
                          }))
                        }
                        placeholder="****1234"
                      />
                      <label className="checkboxLabel">
                        <input
                          name="active"
                          type="checkbox"
                          checked={cardEdits[card.id]?.active ?? false}
                          onChange={(event) =>
                            setCardEdits((prev) => ({
                              ...prev,
                              [card.id]: { ...(prev[card.id] ?? { nickname: "", maskedNumber: "", active: true }), active: event.target.checked }
                            }))
                          }
                        />
                        Active
                      </label>
                      <button type="submit" className="tinyButton">
                        Save
                      </button>
                    </form>
                  </details>
                  <form action={deleteCardAction}>
                    <input type="hidden" name="id" value={card.id} />
                    <button type="submit" className="tinyButton dangerButton">
                      Trash
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {bulkMonthUpdateState.message ? (
        <p className={bulkMonthUpdateState.ok ? "successNote" : "errorNote"} key={bulkMonthUpdateState.timestamp}>
          {bulkMonthUpdateState.message}
        </p>
      ) : null}
      {bulkMonthDeleteState.message ? (
        <p className={bulkMonthDeleteState.ok ? "successNote" : "errorNote"} key={bulkMonthDeleteState.timestamp}>
          {bulkMonthDeleteState.message}
        </p>
      ) : null}
      {updateMonthState.message ? (
        <p className={updateMonthState.ok ? "successNote" : "errorNote"} key={updateMonthState.timestamp}>
          {updateMonthState.message}
        </p>
      ) : null}
      {deleteMonthState.message ? (
        <p className={deleteMonthState.ok ? "successNote" : "errorNote"} key={deleteMonthState.timestamp}>
          {deleteMonthState.message}
        </p>
      ) : null}
      {reopenMonthState.message ? (
        <p className={reopenMonthState.ok ? "successNote" : "errorNote"} key={reopenMonthState.timestamp}>
          {reopenMonthState.message}
        </p>
      ) : null}

      <div className="bulkToolbar" style={{ marginTop: "1rem" }}>
        <p className="bulkMeta">Selected statement months: {selectedMonthIds.length}</p>
        <div className="bulkActions">
          <form action={bulkMonthUpdateAction} className="inlineEditForm">
            <input type="hidden" name="selectedIdsJson" value={JSON.stringify(selectedMonthIds)} />
            <label className="checkboxLabel">
              <input name="applyCreditCard" type="checkbox" />
              Card
            </label>
            <select name="creditCardId" defaultValue="">
              <option value="">Select card</option>
              {cards.map((card) => (
                <option key={card.id} value={card.id}>
                  {card.nickname} {card.maskedNumber ? `(${card.maskedNumber})` : ""}
                </option>
              ))}
            </select>
            <label className="checkboxLabel">
              <input name="applyStatementMonth" type="checkbox" />
              Month
            </label>
            <input name="statementMonth" type="month" />
            <button type="submit" className="tinyButton" disabled={selectedMonthIds.length === 0}>
              Bulk Save Months
            </button>
          </form>
          <form
            action={bulkMonthDeleteAction}
            onSubmit={(event) => {
              if (!window.confirm(`Delete ${selectedMonthIds.length} selected statement month(s)?`)) event.preventDefault();
            }}
          >
            <input type="hidden" name="selectedIdsJson" value={JSON.stringify(selectedMonthIds)} />
            <button type="submit" className="tinyButton dangerButton" disabled={selectedMonthIds.length === 0}>
              Bulk Delete Months
            </button>
          </form>
        </div>
      </div>

      <div className="tableWrap" style={{ marginTop: "0.5rem" }}>
        <table>
          <thead>
            <tr>
              <th className="rowSelectHeader">
                <input type="checkbox" checked={allMonthsSelected} onChange={toggleAllMonths} />
              </th>
              <th>
                <button type="button" className="sortHeaderButton" onClick={() => toggleMonthSort("statementMonth")}>
                  Month {monthSortKey === "statementMonth" ? (monthSortDirection === "asc" ? "▲" : "▼") : ""}
                </button>
              </th>
              <th>
                <button type="button" className="sortHeaderButton" onClick={() => toggleMonthSort("creditCardName")}>
                  Card {monthSortKey === "creditCardName" ? (monthSortDirection === "asc" ? "▲" : "▼") : ""}
                </button>
              </th>
              <th>
                <button type="button" className="sortHeaderButton" onClick={() => toggleMonthSort("state")}>
                  Status {monthSortKey === "state" ? (monthSortDirection === "asc" ? "▲" : "▼") : ""}
                </button>
              </th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedStatementMonths.length === 0 ? (
              <tr>
                <td colSpan={5}>No statement months yet.</td>
              </tr>
            ) : null}
            {sortedStatementMonths.map((month) => (
              <tr key={month.id}>
                <td className="rowSelectCell">
                  <input type="checkbox" checked={selectedMonthSet.has(month.id)} onChange={() => toggleMonth(month.id)} />
                </td>
                <td>{month.statementMonth.slice(0, 7)}</td>
                <td>{month.creditCardName}</td>
                <td>{month.postedToBannerAt ? "Posted To Banner" : month.postedAt ? "Statement Paid" : "Open"}</td>
                <td className="actionCell">
                  {!month.postedAt ? (
                    <>
                      <details>
                        <summary className="tinyButton" style={{ listStyle: "none", cursor: "pointer" }}>
                          Edit
                        </summary>
                        <form action={updateMonthAction} className="inlineEditForm" style={{ marginTop: "0.4rem" }}>
                          <input type="hidden" name="id" value={month.id} />
                          <input
                            type="month"
                            name="statementMonth"
                            value={monthEdits[month.id]?.statementMonth ?? ""}
                            onChange={(event) =>
                              setMonthEdits((prev) => ({
                                ...prev,
                                [month.id]: { ...(prev[month.id] ?? { statementMonth: "", creditCardId: "" }), statementMonth: event.target.value }
                              }))
                            }
                            required
                          />
                          <select
                            name="creditCardId"
                            value={monthEdits[month.id]?.creditCardId ?? ""}
                            onChange={(event) =>
                              setMonthEdits((prev) => ({
                                ...prev,
                                [month.id]: { ...(prev[month.id] ?? { statementMonth: "", creditCardId: "" }), creditCardId: event.target.value }
                              }))
                            }
                            required
                          >
                            {cards.map((card) => (
                              <option key={card.id} value={card.id}>
                                {card.nickname} {card.maskedNumber ? `(${card.maskedNumber})` : ""}
                              </option>
                            ))}
                          </select>
                          <button type="submit" className="tinyButton">
                            Save
                          </button>
                        </form>
                      </details>
                      <form action={deleteMonthAction}>
                        <input type="hidden" name="id" value={month.id} />
                        <button type="submit" className="tinyButton dangerButton">
                          Trash
                        </button>
                      </form>
                    </>
                  ) : month.postedToBannerAt ? (
                    "-"
                  ) : (
                    <form action={reopenMonthAction}>
                      <input type="hidden" name="statementMonthId" value={month.id} />
                      <button type="submit" className="tinyButton">
                        Reopen
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
