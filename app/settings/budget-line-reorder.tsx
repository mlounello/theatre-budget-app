"use client";

import { useMemo, useState } from "react";
import { reorderBudgetLinesAction } from "@/app/settings/actions";

type Line = {
  id: string;
  label: string;
};

type Props = {
  projectId: string;
  lines: Line[];
};

export function BudgetLineReorder({ projectId, lines }: Props) {
  const initial = useMemo(() => lines, [lines]);
  const [ordered, setOrdered] = useState<Line[]>(initial);
  const [draggedId, setDraggedId] = useState<string | null>(null);

  function moveLine(fromId: string, toId: string): void {
    if (fromId === toId) return;
    const fromIndex = ordered.findIndex((line) => line.id === fromId);
    const toIndex = ordered.findIndex((line) => line.id === toId);
    if (fromIndex < 0 || toIndex < 0) return;

    const next = [...ordered];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    setOrdered(next);
  }

  if (lines.length < 2) return null;

  return (
    <details className="reorderDetails">
      <summary>Reorder Budget Lines</summary>
      <form action={reorderBudgetLinesAction} className="reorderBlock">
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="orderedLineIds" value={JSON.stringify(ordered.map((line) => line.id))} />
        <p className="reorderHint">Drag to reorder, then save.</p>
        <ul className="reorderList">
          {ordered.map((line) => (
            <li
              key={line.id}
              className="reorderItem"
              draggable
              onDragStart={() => setDraggedId(line.id)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => {
                if (draggedId) moveLine(draggedId, line.id);
                setDraggedId(null);
              }}
              onDragEnd={() => setDraggedId(null)}
            >
              <span className="dragHandle" aria-hidden="true">
                ::
              </span>
              {line.label}
            </li>
          ))}
        </ul>
        <button type="submit" className="tinyButton">
          Save Order
        </button>
      </form>
    </details>
  );
}
