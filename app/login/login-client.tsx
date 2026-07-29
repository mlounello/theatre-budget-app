"use client";

import Image from "next/image";
import { useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-client";
import { sanitizeNextPath } from "@/lib/sanitize-next";

type LoginClientProps = {
  initialError?: string | null;
};

export default function LoginClient({ initialError = null }: LoginClientProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(initialError);
  const [notice, setNotice] = useState<string | null>(null);
  const [email, setEmail] = useState("");

  async function signInWithGoogle() {
    setLoading(true);
    setError(null);
    setNotice(null);

    try {
      const supabase = getSupabaseBrowserClient();
      const next = sanitizeNextPath(new URLSearchParams(window.location.search).get("next"));
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

      const { error: signInError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo }
      });

      if (signInError) {
        setError(signInError.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to start Google sign-in.");
    } finally {
      setLoading(false);
    }
  }

  async function sendMagicLink() {
    setLoading(true);
    setError(null);
    setNotice(null);

    try {
      const next = sanitizeNextPath(new URLSearchParams(window.location.search).get("next"));
      await fetch("/api/auth/magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), next })
      });
      setNotice(
        "If this email has active Theatre Budget access, a sign-in link is on its way. If it does not arrive, verify the address or contact the production manager."
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to send a magic link.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="authShell">
      <article className="authCard">
        <Image
          src="/tktba-square.png"
          alt="Theatre Budget App"
          className="authLogo"
          width={1000}
          height={1000}
          priority
        />
        <h1>Sign in</h1>
        <p className="heroSubtitle">Use Google or an emailed magic link to access assigned budgets and purchase workflows.</p>

        <form
          className="authForm"
          onSubmit={(event) => {
            event.preventDefault();
            void sendMagicLink();
          }}
        >
          <label>
            Email
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
            />
          </label>
          <button type="submit" className="authButton" disabled={loading || !email.trim()}>
            {loading ? "Working..." : "Email me a magic link"}
          </button>
        </form>

        <p className="heroSubtitle">New access is assigned by a Theatre Budget administrator. Public account creation is disabled.</p>

        <div className="authDivider" aria-hidden="true">
          <span>or</span>
        </div>

        <button type="button" className="authButton" onClick={signInWithGoogle} disabled={loading}>
          {loading ? "Connecting..." : "Continue with Google"}
        </button>

        {error ? <p className="authError">{error}</p> : null}
        {notice ? <p className="successNote">{notice}</p> : null}
      </article>
    </section>
  );
}
