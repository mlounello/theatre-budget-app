import Link from "next/link";
import { signOut } from "@/app/auth/actions";
import { getSupabaseServerClient } from "@/lib/supabase-server";

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/requests", label: "Requests" },
  { href: "/cc", label: "CC" },
  { href: "/settings", label: "Settings" }
];

export async function TopNav() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

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
          {user ? (
            <form action={signOut}>
              <button className="navButton" type="submit">
                Sign Out
              </button>
            </form>
          ) : null}
        </nav>
      </div>
      {user?.email ? (
        <div className="userBar">
          <p className="userBarText">Signed in as {user.email}</p>
        </div>
      ) : null}
    </header>
  );
}
