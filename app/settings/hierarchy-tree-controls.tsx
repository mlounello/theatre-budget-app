"use client";

export function HierarchyTreeControls({ containerId }: { containerId: string }) {
  function setAllDetails(open: boolean): void {
    const container = document.getElementById(containerId);
    if (!container) return;
    const detailsList = container.querySelectorAll("details");
    detailsList.forEach((node) => {
      node.open = open;
    });
  }

  return (
    <div className="inlineActionRow">
      <button type="button" className="tinyButton" onClick={() => setAllDetails(true)}>
        Open All
      </button>
      <button type="button" className="tinyButton" onClick={() => setAllDetails(false)}>
        Close All
      </button>
    </div>
  );
}
