"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const SCROLL_KEY = "tba:scroll-restore";

type ScrollPayload = {
  path: string;
  y: number;
  ts: number;
};

function readPayload(): ScrollPayload | null {
  const raw = sessionStorage.getItem(SCROLL_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ScrollPayload>;
    if (typeof parsed.path !== "string" || typeof parsed.y !== "number") return null;
    return {
      path: parsed.path,
      y: parsed.y,
      ts: typeof parsed.ts === "number" ? parsed.ts : Date.now()
    };
  } catch {
    return null;
  }
}

export function ScrollRestore() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();

  useEffect(() => {
    function onSubmit(event: Event): void {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      if (form.getAttribute("method")?.toLowerCase() === "get") return;
      if (form.dataset.noScrollRestore === "true") return;

      const payload: ScrollPayload = {
        path: window.location.pathname,
        y: window.scrollY,
        ts: Date.now()
      };
      sessionStorage.setItem(SCROLL_KEY, JSON.stringify(payload));
    }

    document.addEventListener("submit", onSubmit, true);
    return () => document.removeEventListener("submit", onSubmit, true);
  }, []);

  useEffect(() => {
    const payload = readPayload();
    if (!payload) return;
    if (payload.path !== window.location.pathname) return;
    if (Date.now() - payload.ts > 60_000) {
      sessionStorage.removeItem(SCROLL_KEY);
      return;
    }

    requestAnimationFrame(() => {
      window.scrollTo({ top: payload.y, behavior: "auto" });
      setTimeout(() => window.scrollTo({ top: payload.y, behavior: "auto" }), 0);
      sessionStorage.removeItem(SCROLL_KEY);
    });
  }, [pathname, search]);

  return null;
}
