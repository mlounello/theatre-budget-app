"use client";

import { useMemo, useState } from "react";
import { reorderProjectsAction } from "@/app/settings/actions";

type Item = {
  id: string;
  label: string;
};

export function ProjectReorder({ organizationId, items }: { organizationId: string | null; items: Item[] }) {
  const initial = useMemo(() => items, [items]);
  const [ordered, setOrdered] = useState<Item[]>(initial);
  const [draggedId, setDraggedId] = useState<string | null>(null);

  if (items.length < 2) return null;

  function moveItem(fromId: string, toId: string): void {
    if (fromId === toId) return;
    const fromIndex = ordered.findIndex((item) => item.id === fromId);
    const toIndex = ordered.findIndex((item) => item.id === toId);
    if (fromIndex < 0 || toIndex < 0) return;
    const next = [...ordered];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    setOrdered(next);
  }

  return (
    <details className="reorderDetails">
      <summary>Reorder Projects</summary>
      <form action={reorderProjectsAction} className="reorderBlock">
        <input type="hidden" name="organizationId" value={organizationId ?? ""} />
        <input type="hidden" name="orderedProjectIds" value={JSON.stringify(ordered.map((item) => item.id))} />
        <p className="reorderHint">Drag to reorder, then save.</p>
        <ul className="reorderList">
          {ordered.map((item) => (
            <li
              key={item.id}
              className="reorderItem"
              draggable
              onDragStart={() => setDraggedId(item.id)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => {
                if (draggedId) moveItem(draggedId, item.id);
                setDraggedId(null);
              }}
              onDragEnd={() => setDraggedId(null)}
            >
              <span className="dragHandle" aria-hidden="true">
                ::
              </span>
              {item.label}
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
