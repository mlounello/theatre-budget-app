"use client";

import { useEffect } from "react";

export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[route-error]", error.digest ?? "", error.message);
  }, [error]);

  return (
    <section className="heroCard" role="alert">
      <p className="eyebrow">Something went wrong</p>
      <h1 className="heroTitle">This page could not be loaded.</h1>
      <p className="heroSubtitle">
        Your data has not been changed. Try again, and if the problem continues, return to the dashboard.
        {error.digest ? ` Reference: ${error.digest}` : ""}
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", marginTop: "1rem" }}>
        <button type="button" className="buttonLink buttonPrimary" onClick={reset}>
          Try again
        </button>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- full reload clears a broken client state */}
        <a href="/" className="buttonLink">
          Return to Dashboard
        </a>
      </div>
    </section>
  );
}
