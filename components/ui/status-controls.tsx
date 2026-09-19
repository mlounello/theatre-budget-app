import type { ReactNode } from "react";

export type StatusTone = "neutral" | "info" | "warning" | "success" | "danger";

export function StatusPill({
  tone = "neutral",
  children,
  className = ""
}: {
  tone?: StatusTone;
  children: ReactNode;
  className?: string;
}) {
  return <span className={`uiStatusPill uiStatusPill-${tone}${className ? ` ${className}` : ""}`}>{children}</span>;
}

export function StatusSelector({
  label,
  children,
  className = ""
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`uiStatusSelector${className ? ` ${className}` : ""}`}>
      <span>{label}</span>
      {children}
    </div>
  );
}
