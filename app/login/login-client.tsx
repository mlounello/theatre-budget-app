"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase-client";
import { sanitizeNextPath } from "@/lib/sanitize-next";

type LoginClientProps = {
  initialError?: string | null;
};

export default function LoginClient({ initialError = null }: LoginClientProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(initialError);
  const [notice, setNotice] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function upsertCurrentUserProfile(displayName?: string) {
    const supabase = getSupabaseBrowserClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) return;
    const resolvedName =
      (displayName && displayName.trim()) ||
      (user.user_metadata?.full_name as string | undefined) ||
      (user.user_metadata?.name as string | undefined) ||
      user.email ||
      "User";

    await supabase.from("users").upsert(
      {
        id: user.id,
        full_name: resolvedName
      },
      { onConflict: "id" }
    );
  }

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

  async function signInWithPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setNotice(null);

    try {
      const supabase = getSupabaseBrowserClient();
      const next = sanitizeNextPath(new URLSearchParams(window.location.search).get("next"));
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password
      });

      if (signInError && !/signups? not allowed|user not found/i.test(signInError.message)) {
        setError(signInError.message);
        return;
      }

      const accessResponse = await fetch("/api/auth/access", { cache: "no-store" });
      if (!accessResponse.ok) {
        await supabase.auth.signOut({ scope: "local" });
        setError("This account does not have active Theatre Budget access. Ask an app administrator for access.");
        return;
      }

      await upsertCurrentUserProfile();
      router.push(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to sign in.");
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
      setNotice("If this email has active Theatre Budget access, a sign-in link is on its way.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to send a magic link.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="authShell">
      <article className="authCard">
        <p className="eyebrow">Theatre Budget App</p>
        <h1>Sign in</h1>
        <p className="heroSubtitle">Use Google, an emailed magic link, or an existing password to access assigned budgets and purchase workflows.</p>

        <form className="authForm" onSubmit={signInWithPassword}>
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
          <label>
            Password
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="At least 6 characters"
              autoComplete="current-password"
            />
          </label>
          <button type="submit" className="authButton" disabled={loading}>
            {loading ? "Working..." : "Sign In with Password"}
          </button>
          <button type="button" className="authButton" onClick={sendMagicLink} disabled={loading || !email.trim()}>
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
