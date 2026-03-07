import { redirect } from "next/navigation";
import LoginClient from "@/app/login/login-client";
import { sanitizeNextPath } from "@/lib/sanitize-next";

export default async function LoginPage({
  searchParams
}: {
  searchParams?: Promise<{ code?: string; next?: string; error?: string }>;
}) {
  const params = searchParams ? await searchParams : undefined;
  const code = params?.code ? String(params.code).trim() : "";
  const next = sanitizeNextPath(params?.next);
  const error = params?.error ? String(params.error) : null;

  if (code) {
    redirect(`/auth/callback?code=${encodeURIComponent(code)}&next=${encodeURIComponent(next)}`);
  }

  return <LoginClient initialError={error} />;
}
