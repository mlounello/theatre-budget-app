"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase-client";

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [fullName, setFullName] = useState("");
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

  async function signInWithPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setNotice(null);

    try {
      const supabase = getSupabaseBrowserClient();
      const next = new URLSearchParams(window.location.search).get("next") ?? "/";
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password
      });

      if (signInError) {
        setError(signInError.message);
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

  async function signUpWithPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setNotice(null);

    try {
      const supabase = getSupabaseBrowserClient();
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            full_name: fullName.trim()
          }
        }
      });

      if (signUpError) {
        setError(signUpError.message);
        return;
      }

      if (data.session) {
        await upsertCurrentUserProfile(fullName);
        const next = new URLSearchParams(window.location.search).get("next") ?? "/";
        router.push(next);
        router.refresh();
        return;
      }

      setNotice("Account created. Check your email to confirm, then sign in.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create account.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="authShell">
      <article className="authCard">
        <p className="eyebrow">Theatre Budget App</p>
        <h1>Sign in</h1>
        <p className="heroSubtitle">Use Google or email/password to access project budgets and purchase workflows.</p>

        <div className="authModeSwitch" role="tablist" aria-label="Sign in options">
          <button
            type="button"
            className={`authModeButton ${mode === "signin" ? "active" : ""}`}
            onClick={() => {
              setMode("signin");
              setError(null);
              setNotice(null);
            }}
          >
            Sign In
          </button>
          <button
            type="button"
            className={`authModeButton ${mode === "signup" ? "active" : ""}`}
            onClick={() => {
              setMode("signup");
              setError(null);
              setNotice(null);
            }}
          >
            Create Account
          </button>
        </div>

        <form className="authForm" onSubmit={mode === "signin" ? signInWithPassword : signUpWithPassword}>
          {mode === "signup" ? (
            <label>
              Full name
              <input
                type="text"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                placeholder="Your name"
                autoComplete="name"
              />
            </label>
          ) : null}
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
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
            />
          </label>
          <button type="submit" className="authButton" disabled={loading}>
            {loading ? "Working..." : mode === "signin" ? "Sign In with Email" : "Create Email Account"}
          </button>
        </form>

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
