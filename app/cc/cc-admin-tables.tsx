"use client";

import { useMemo, useState } from "react";
import {
  bulkDeleteCreditCardsAction,
  bulkDeleteStatementMonthsAction,
  bulkUpdateCreditCardsAction,
  bulkUpdateStatementMonthsAction,
  deleteCreditCardAction,
  deleteStatementMonthAction,
  reopenStatementMonthAction,
  updateCreditCardAction,
  updateStatementMonthAction
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
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);
  const [selectedMonthIds, setSelectedMonthIds] = useState<string[]>([]);
  const [monthSortKey, setMonthSortKey] = useState<MonthSortKey>("statementMonth");
  const [monthSortDirection, setMonthSortDirection] = useState<MonthSortDirection>("desc");
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
      <div className="bulkToolbar" style={{ marginTop: "0.65rem" }}>
        <p className="bulkMeta">Selected cards: {selectedCardIds.length}</p>
        <div className="bulkActions">
          <form action={bulkUpdateCreditCardsAction} className="inlineEditForm">
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
            action={bulkDeleteCreditCardsAction}
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
                    <form action={updateCreditCardAction} className="inlineEditForm" style={{ marginTop: "0.4rem" }}>
                      <input type="hidden" name="id" value={card.id} />
                      <input name="nickname" defaultValue={card.nickname} required />
                      <input name="maskedNumber" defaultValue={card.maskedNumber ?? ""} placeholder="****1234" />
                      <label className="checkboxLabel">
                        <input name="active" type="checkbox" defaultChecked={card.active} />
                        Active
                      </label>
                      <button type="submit" className="tinyButton">
                        Save
                      </button>
                    </form>
                  </details>
                  <form action={deleteCreditCardAction}>
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

      <div className="bulkToolbar" style={{ marginTop: "1rem" }}>
        <p className="bulkMeta">Selected statement months: {selectedMonthIds.length}</p>
        <div className="bulkActions">
          <form action={bulkUpdateStatementMonthsAction} className="inlineEditForm">
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
            action={bulkDeleteStatementMonthsAction}
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
                        <form action={updateStatementMonthAction} className="inlineEditForm" style={{ marginTop: "0.4rem" }}>
                          <input type="hidden" name="id" value={month.id} />
                          <input type="month" name="statementMonth" defaultValue={month.statementMonth.slice(0, 7)} required />
                          <select name="creditCardId" defaultValue={month.creditCardId} required>
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
                      <form action={deleteStatementMonthAction}>
                        <input type="hidden" name="id" value={month.id} />
                        <button type="submit" className="tinyButton dangerButton">
                          Trash
                        </button>
                      </form>
                    </>
                  ) : (
                    month.postedToBannerAt ? (
                      "-"
                    ) : (
                      <form action={reopenStatementMonthAction}>
                        <input type="hidden" name="statementMonthId" value={month.id} />
                        <button type="submit" className="tinyButton">
                          Reopen
                        </button>
                      </form>
                    )
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
