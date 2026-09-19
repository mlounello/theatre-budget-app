import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { signOut } from "@/app/auth/actions";
import { getAccessContext } from "@/lib/access";
import { getFiscalYearOptions } from "@/lib/db";
import { resolveCurrentFiscalYearId } from "@/lib/fiscal-year-context";
import { GlobalFiscalYearPicker } from "@/components/global-fiscal-year-picker";
import { GroupedNavMenus, type NavMenuGroup } from "@/components/grouped-nav-menus";

type Navigation = {
  directLinks: Array<{ href: string; label: string }>;
  groups: NavMenuGroup[];
};

function navigationForRole(role: string): Navigation {
  if (role === "procurement_tracker") {
    return { directLinks: [{ href: "/procurement-tracker", label: "Procurement Tracker" }], groups: [] };
  }

  if (role === "viewer" || role === "buyer") {
    return {
      directLinks: [
        { href: "/", label: "Dashboard" },
        { href: "/my-budget", label: "My Budget" }
      ],
      groups: []
    };
  }

  if (role === "project_manager" || role === "admin") {
    return {
      directLinks: [{ href: "/", label: "Dashboard" }],
      groups: [
        {
          label: "Spending",
          links: [
            { href: "/procurement", label: "Procurement" },
            { href: "/cc", label: "Credit Cards" }
          ]
        },
        {
          label: "Hiring",
          links: [
            { href: "/contracts", label: "Hiring & Payments" },
            { href: "/guest-artists", label: "People & Artists" },
            { href: "/union-agreements", label: "Union Agreements" }
          ]
        },
        {
          label: "Budgets",
          links: [
            { href: "/budget-planning", label: "Budget Planning" },
            { href: "/institutional-budget", label: "Institutional Budget" },
            { href: "/variance", label: "Variances" },
            { href: "/income", label: "Revenue" }
          ]
        },
        {
          label: "Reports",
          links: [
            { href: "/reports", label: "Reports Hub" },
            { href: "/overview", label: "Overview" },
            { href: "/my-budget", label: "Department Totals" }
          ]
        },
        {
          label: "Administration",
          links: [{ href: "/settings", label: "Settings" }]
        }
      ]
    };
  }

  return { directLinks: [], groups: [] };
}

export async function TopNav() {
  let userEmail: string | null = null;
  let hasUser = false;
  let role = "none";
  let isImpersonating = false;
  let impersonatedUserName: string | null = null;
  let fiscalYears: Array<{ id: string; name: string }> = [];
  let defaultFiscalYearId = "";

  try {
    const context = await getAccessContext();
    hasUser = Boolean(context.userId);
    userEmail = context.email;
    role = context.role;
    isImpersonating = context.isImpersonating;
    impersonatedUserName = context.impersonatedUserName;
    if (hasUser && role !== "none") {
      const fiscalYearOptions = await getFiscalYearOptions();
      fiscalYears = fiscalYearOptions.map((fy) => ({ id: fy.id, name: fy.name }));
      defaultFiscalYearId = resolveCurrentFiscalYearId(fiscalYearOptions);
    }
  } catch {
    hasUser = false;
    userEmail = null;
    role = "none";
  }

  if (hasUser && role === "none") {
    redirect("/auth/denied");
  }

  const navigation = navigationForRole(role);
  if (!hasUser) return null;

  return (
    <header className="topNav">
      {isImpersonating ? (
        <div className="impersonationBanner">
          <strong>READ-ONLY: Viewing as {impersonatedUserName ?? "user"}</strong>
          <a href="/api/admin/impersonation/exit">Exit View as User</a>
        </div>
      ) : null}
      <div className="topNavInner">
        <Link href="/" className="brand" aria-label="Theatre Budget App home">
          <span className="brandLogoFrame">
            <Image
              src="/tktba-horizontal.png"
              alt="Theatre Budget App"
              className="brandLogo"
              width={1200}
              height={391}
              priority
            />
          </span>
        </Link>
        <nav className="mainNav" aria-label="Primary">
          {navigation.directLinks.map((link) => (
            <Link key={link.href} href={link.href} className="navLink">
              {link.label}
            </Link>
          ))}
          <GroupedNavMenus groups={navigation.groups} />
          {hasUser ? <GlobalFiscalYearPicker fiscalYears={fiscalYears} defaultFiscalYearId={defaultFiscalYearId} /> : null}
          {hasUser && !isImpersonating ? (
            <form action={signOut}>
              <button className="navButton" type="submit">
                Sign Out
              </button>
            </form>
          ) : null}
        </nav>
      </div>
      {!isImpersonating && userEmail ? (
        <div className="userBar">
          <p className="userBarText">Signed in as {userEmail}</p>
        </div>
      ) : null}
    </header>
  );
}
