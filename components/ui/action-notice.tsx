import type { ReactNode } from "react";

export function ActionNotice({
  tone,
  children,
  className = ""
}: {
  tone: "success" | "error" | "info" | "warning";
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`uiNotice uiNotice-${tone}${className ? ` ${className}` : ""}`}
      role={tone === "error" ? "alert" : "status"}
      aria-live={tone === "error" ? "assertive" : "polite"}
    >
      {children}
    </div>
  );
}
