"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export type NavMenuGroup = {
  label: string;
  links: Array<{ href: string; label: string }>;
};

function routeIsActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function GroupedNavMenus({ groups }: { groups: NavMenuGroup[] }) {
  const pathname = usePathname();
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setOpenMenu(null);
  }, [pathname]);

  useEffect(() => {
    function closeOnOutsideClick(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpenMenu(null);
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpenMenu(null);
    }

    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  return (
    <div className="navMenuList" ref={containerRef}>
      {groups.map((group) => {
        const isOpen = openMenu === group.label;
        const isActive = group.links.some((link) => routeIsActive(pathname, link.href));
        return (
          <div className="navMenu" key={group.label}>
            <button
              aria-expanded={isOpen}
              aria-haspopup="menu"
              className={isActive ? "navMenuButton active" : "navMenuButton"}
              onClick={() => setOpenMenu(isOpen ? null : group.label)}
              type="button"
            >
              {group.label}
              <span aria-hidden="true" className="navMenuChevron">▾</span>
            </button>
            {isOpen ? (
              <div aria-label={`${group.label} navigation`} className="navMenuDropdown" role="menu">
                {group.links.map((link) => {
                  const linkIsActive = routeIsActive(pathname, link.href);
                  return (
                    <Link
                      aria-current={linkIsActive ? "page" : undefined}
                      className={linkIsActive ? "navMenuLink active" : "navMenuLink"}
                      href={link.href}
                      key={link.href}
                      role="menuitem"
                    >
                      {link.label}
                    </Link>
                  );
                })}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
