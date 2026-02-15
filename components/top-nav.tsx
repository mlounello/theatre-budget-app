import Link from "next/link";
import { signOut } from "@/app/auth/actions";
import { getAccessContext } from "@/lib/access";

function linksForRole(role: string): Array<{ href: string; label: string }> {
  if (role === "procurement_tracker") {
    return [{ href: "/procurement-tracker", label: "Procurement Tracker" }];
  }

  if (role === "viewer") {
    return [
      { href: "/", label: "Dashboard" },
      { href: "/my-budget", label: "My Budget" }
    ];
  }

  if (role === "buyer") {
    return [
      { href: "/", label: "Dashboard" },
      { href: "/my-budget", label: "My Budget" },
      { href: "/requests", label: "Requests" }
    ];
  }

  if (role === "project_manager") {
    return [
      { href: "/", label: "Dashboard" },
      { href: "/overview", label: "Overview" },
      { href: "/requests", label: "Requests" },
      { href: "/procurement", label: "Procurement" },
      { href: "/contracts", label: "Contracts" },
      { href: "/income", label: "Income" },
      { href: "/cc", label: "CC" },
      { href: "/settings", label: "Settings" }
    ];
  }

  if (role === "admin") {
    return [
      { href: "/", label: "Dashboard" },
      { href: "/overview", label: "Overview" },
      { href: "/requests", label: "Requests" },
      { href: "/procurement", label: "Procurement" },
      { href: "/contracts", label: "Contracts" },
      { href: "/income", label: "Income" },
      { href: "/cc", label: "CC" },
      { href: "/settings", label: "Settings" },
      { href: "/debug", label: "Debug" }
    ];
  }

  return [];
}

export async function TopNav() {
  let userEmail: string | null = null;
  let hasUser = false;
  let role = "none";

  try {
    const context = await getAccessContext();
    hasUser = Boolean(context.userId);
    userEmail = context.email;
    role = context.role;
  } catch {
    hasUser = false;
    userEmail = null;
    role = "none";
  }

  const links = linksForRole(role);

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
