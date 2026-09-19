"use client";

import { useId, useRef, type ReactNode } from "react";
import { useDialogBehavior } from "@/components/ui/use-dialog-behavior";

export function SideDrawer({
  open,
  onClose,
  title,
  eyebrow,
  description,
  closeLabel = "Close panel",
  children,
  footer,
  size = "wide",
  bodyClassName = ""
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  eyebrow?: ReactNode;
  description?: ReactNode;
  closeLabel?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: "medium" | "wide";
  bodyClassName?: string;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLElement>(null);
  useDialogBehavior(open, panelRef, onClose);

  if (!open) return null;

  return (
    <div
      className="uiOverlay uiDrawerOverlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className={`uiDrawer uiDrawer-${size}`}
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
      >
        <header className="uiDrawerHeader">
          <div>
            {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
            <h2 id={titleId}>{title}</h2>
            {description ? (
              <p className="helperText" id={descriptionId}>
                {description}
              </p>
            ) : null}
          </div>
          <button type="button" className="drawerCloseButton" onClick={onClose} aria-label={closeLabel}>
            <span aria-hidden="true">×</span>
          </button>
        </header>
        <div className={`uiDrawerBody${bodyClassName ? ` ${bodyClassName}` : ""}`}>{children}</div>
        {footer ? <footer className="uiDrawerFooter">{footer}</footer> : null}
      </section>
    </div>
  );
}
