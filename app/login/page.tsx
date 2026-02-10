"use client";

import { useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-client";

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signInWithGoogle() {
    setLoading(true);
    setError(null);

    try {
      const supabase = getSupabaseBrowserClient();
      const next = new URLSearchParams(window.location.search).get("next") ?? "/";
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

  return (
    <section className="authShell">
      <article className="authCard">
        <p className="eyebrow">Theatre Budget App</p>
        <h1>Sign in</h1>
        <p className="heroSubtitle">Use your Google account to access project budgets and purchase workflows.</p>

        <button type="button" className="authButton" onClick={signInWithGoogle} disabled={loading}>
          {loading ? "Connecting..." : "Continue with Google"}
        </button>

        {error ? <p className="authError">{error}</p> : null}
      </article>
    </section>
  );
}
