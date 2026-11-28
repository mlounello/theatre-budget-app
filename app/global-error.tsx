"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "Arial, sans-serif", margin: 0, padding: "2rem", background: "#f6f8f6", color: "#1d2b22" }}>
        <main role="alert" style={{ maxWidth: 560, margin: "10vh auto" }}>
          <h1>Theatre Budget App hit an unexpected error.</h1>
          <p>Your data has not been changed. Reload the page to continue.</p>
          <button type="button" onClick={reset} style={{ padding: "0.5rem 1rem", fontSize: "1rem" }}>
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
