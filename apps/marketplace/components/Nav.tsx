"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Icon, { type IconName } from "./Icon";
import SignOutButton from "../app/SignOutButton";

export type NavLink = { href: string; label: string; short: string; icon: IconName };

function isActive(path: string, href: string) {
  return href === "/" ? path === "/" : path === href || path.startsWith(href + "/");
}

export function HeaderNav({ signedIn, userRole }: { signedIn: boolean; userRole?: string }) {
  const path = usePathname();

  return (
    <nav className="header-nav" aria-label="Main">
      <div className="header-nav__center">
        <Link
          href="/search"
          className="header-nav__link"
          aria-current={isActive(path, "/search") ? "page" : undefined}
        >
          Find Services
        </Link>
        <Link
          href="/#how-it-works"
          className="header-nav__link"
          aria-current={path === "/#how-it-works" ? "page" : undefined}
        >
          How It Works
        </Link>
        <Link
          href="/provider/register"
          className="header-nav__link"
          aria-current={path === "/provider/register" ? "page" : undefined}
        >
          For Providers
        </Link>
      </div>

      <div className="header-nav__actions">
        {!signedIn ? (
          <>
            <Link href="/signin" className="header-nav__login">
              Log in
            </Link>
            <Link href="/signin" className="btn btn--forest btn--pill">
              Sign up
            </Link>
          </>
        ) : (
          <div className="header-nav__user-menu">
            {userRole === "admin" && (
              <Link href="/admin" className="header-nav__link header-nav__link--badge">
                Admin
              </Link>
            )}
            {userRole === "provider" && (
              <Link href="/provider" className="header-nav__link header-nav__link--badge">
                Provider Hub
              </Link>
            )}
            <Link href="/bookings" className="header-nav__link">
              My Bookings
            </Link>
            <SignOutButton className="btn btn--secondary btn--sm" />
          </div>
        )}
      </div>
    </nav>
  );
}

export function TabBar({ signedIn, userRole }: { signedIn: boolean; userRole?: string }) {
  const path = usePathname();

  const tabs: NavLink[] = [
    { href: "/", label: "Home", short: "Home", icon: "home" },
    { href: "/search", label: "Search", short: "Search", icon: "search" },
    {
      href: userRole === "provider" ? "/provider" : "/bookings",
      label: "Bookings",
      short: "Bookings",
      icon: "calendar",
    },
    {
      href: signedIn ? (userRole === "admin" ? "/admin" : userRole === "provider" ? "/provider" : "/bookings") : "/signin",
      label: signedIn ? "Profile" : "Log in",
      short: signedIn ? "Profile" : "Log in",
      icon: "user",
    },
  ];

  return (
    <nav className="tabbar" aria-label="Main">
      {tabs.map((t) => {
        const active = isActive(path, t.href);
        return (
          <Link
            key={t.short}
            href={t.href}
            className="tabbar__item"
            aria-current={active ? "page" : undefined}
          >
            <Icon name={t.icon} size={22} />
            <span>{t.short}</span>
          </Link>
        );
      })}
    </nav>
  );
}

