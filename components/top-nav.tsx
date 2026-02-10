import Link from "next/link";

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/requests", label: "Requests" },
  { href: "/settings", label: "Settings" }
];

export function TopNav(): JSX.Element {
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
        </nav>
      </div>
    </header>
  );
}
