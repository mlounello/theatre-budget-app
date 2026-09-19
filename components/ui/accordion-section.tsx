"use client";

import { useState, type ReactNode } from "react";

export function AccordionSection({
  title,
  description,
  open,
  defaultOpen,
  onToggle,
  children,
  className = ""
}: {
  title: ReactNode;
  description?: ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onToggle?: (open: boolean) => void;
  children: ReactNode;
  className?: string;
}) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen ?? false);
  const resolvedOpen = open ?? internalOpen;

  return (
    <details
      className={`uiAccordion${className ? ` ${className}` : ""}`}
      open={resolvedOpen}
      onToggle={(event) => {
        if (open === undefined) setInternalOpen(event.currentTarget.open);
        onToggle?.(event.currentTarget.open);
      }}
    >
      <summary>
        <span>{title}</span>
        {description ? <small>{description}</small> : null}
      </summary>
      {children}
    </details>
  );
}
