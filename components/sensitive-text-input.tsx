"use client";

import { useState } from "react";

export function SensitiveTextInput({
  name,
  placeholder = ""
}: {
  name: string;
  placeholder?: string;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <span className="sensitiveInputWrap">
      <input name={name} type={visible ? "text" : "password"} autoComplete="off" placeholder={placeholder} />
      <button
        type="button"
        className="sensitiveInputToggle"
        onClick={() => setVisible((value) => !value)}
        aria-label={visible ? "Hide Tax ID or SSN" : "Show Tax ID or SSN"}
        title={visible ? "Hide" : "Show"}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
          {visible ? (
            <>
              <path d="M3 3l18 18" />
              <path d="M10.6 10.6A2 2 0 0 0 13.4 13.4" />
              <path d="M9.9 4.2A10.7 10.7 0 0 1 12 4c5 0 8.5 4.4 9.5 6a2.6 2.6 0 0 1 0 4c-.4.6-1.1 1.5-2.1 2.4" />
              <path d="M6.6 6.6A15 15 0 0 0 2.5 10a2.6 2.6 0 0 0 0 4c1 1.6 4.5 6 9.5 6 1.4 0 2.7-.3 3.9-.9" />
            </>
          ) : (
            <>
              <path d="M2.5 10a2.6 2.6 0 0 0 0 4c1 1.6 4.5 6 9.5 6s8.5-4.4 9.5-6a2.6 2.6 0 0 0 0-4c-1-1.6-4.5-6-9.5-6S3.5 8.4 2.5 10z" />
              <circle cx="12" cy="12" r="3" />
            </>
          )}
        </svg>
      </button>
    </span>
  );
}
