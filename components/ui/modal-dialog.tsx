"use client";

import { useId, useRef, type ReactNode } from "react";
import { useDialogBehavior } from "@/components/ui/use-dialog-behavior";

export function ModalDialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  closeLabel = "Close dialog",
  size = "medium"
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  closeLabel?: string;
  size?: "small" | "medium" | "large";
}) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLElement>(null);
  useDialogBehavior(open, panelRef, onClose);

  if (!open) return null;

  return (
    <div className="uiOverlay uiModalOverlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section
        className={`uiModal uiModal-${size}`}
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
      >
        <header className="uiModalHeader">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description ? <p id={descriptionId}>{description}</p> : null}
          </div>
          <button type="button" className="drawerCloseButton" onClick={onClose} aria-label={closeLabel}>
            <span aria-hidden="true">×</span>
          </button>
        </header>
        <div className="uiModalBody">{children}</div>
        {footer ? <footer className="uiModalFooter">{footer}</footer> : null}
      </section>
    </div>
  );
}

export function ConfirmationDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  dangerous = false
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: ReactNode;
  description: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  dangerous?: boolean;
}) {
  return (
    <ModalDialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size="small"
      footer={
        <div className="uiDialogActions">
          <button type="button" className="tinyButton" onClick={onClose}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`tinyButton ${dangerous ? "dangerButton" : "primaryButton"}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      }
    >
      <span className="srOnly">Confirm this action or cancel to return.</span>
    </ModalDialog>
  );
}
