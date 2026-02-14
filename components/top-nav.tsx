import Link from "next/link";
import { signOut } from "@/app/auth/actions";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { getCurrentAccessProfile } from "@/lib/db";

export async function TopNav() {
  let userEmail: string | null = null;
  let hasUser = false;
  let role: "admin" | "project_manager" | "buyer" | "viewer" = "viewer";

  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    hasUser = Boolean(user);
    userEmail = user?.email ?? null;
    if (user) {
      const profile = await getCurrentAccessProfile();
      role = profile.role;
    }
  } catch {
    hasUser = false;
    userEmail = null;
    role = "viewer";
  }

  const links =
    role === "admin"
      ? [
          { href: "/", label: "Dashboard" },
          { href: "/my-budget", label: "My Budget" },
          { href: "/overview", label: "Overview" },
          { href: "/requests", label: "Requests" },
          { href: "/procurement", label: "Procurement" },
          { href: "/contracts", label: "Contracts" },
          { href: "/income", label: "Income" },
          { href: "/cc", label: "CC" },
          { href: "/settings", label: "Settings" },
          { href: "/debug", label: "Debug" }
        ]
      : role === "project_manager"
        ? [
            { href: "/", label: "Dashboard" },
            { href: "/my-budget", label: "My Budget" },
            { href: "/overview", label: "Overview" },
            { href: "/requests", label: "Requests" },
            { href: "/procurement", label: "Procurement" },
            { href: "/contracts", label: "Contracts" },
            { href: "/income", label: "Income" },
            { href: "/cc", label: "CC" }
          ]
        : role === "buyer"
          ? [
              { href: "/my-budget", label: "My Budget" },
              { href: "/requests", label: "Requests" },
              { href: "/procurement", label: "Procurement" }
            ]
          : [{ href: "/my-budget", label: "My Budget" }];

  return (
    <header className="topNav">
      <div className="topNavInner">
        <div className="brand">
          <span className="brandMark" aria-hidden="true" />
          <div>
            <p className="brandTitle">Theatre Budget App</p>
            <p className="brandSubtitle">Siena Production Budgeting</p>
          </div>
        </div>
        <nav className="mainNav" aria-label="Primary">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="navLink">
              {link.label}
            </Link>
          ))}
          {hasUser ? (
            <form action={signOut}>
              <button className="navButton" type="submit">
                Sign Out
              </button>
            </form>
          ) : null}
        </nav>
      </div>
      {userEmail ? (
        <div className="userBar">
          <p className="userBarText">Signed in as {userEmail}</p>
        </div>
      ) : null}
    </header>
  );
}
