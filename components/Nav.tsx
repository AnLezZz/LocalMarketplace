"use client";
import { useEffect, useRef } from "react";
import NotificationBell from "./NotificationBell";
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
  const profile = useRef<HTMLDetailsElement>(null);
  const dashboard = (userRole === "admin" && isActive(path, "/admin")) ||
    (userRole === "provider" && isActive(path, "/provider") && path !== "/provider/register");

  useEffect(() => { if (profile.current) profile.current.open = false; }, [path]);
  useEffect(() => {
    function dismiss(event: PointerEvent) {
      if (profile.current && !profile.current.contains(event.target as Node)) profile.current.open = false;
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape" && profile.current?.open) {
        profile.current.open = false;
        profile.current.querySelector("summary")?.focus();
      }
    }
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, []);

  const link = (href: string, label: string) => <Link href={href} className="header-nav__link"
    aria-current={isActive(path, href) ? "page" : undefined}>{label}</Link>;

  return (
    <nav className="header-nav" aria-label="Main">
      <div className="header-nav__center">
        {link("/search", dashboard ? "Find services ↗" : "Find services")}
        {signedIn ? !dashboard && link("/bookings", "My bookings") : <>
          {link("/#how-it-works", "How it works")}
          {link("/provider/register", "Become a provider")}
        </>}
      </div>
      <div className="header-nav__actions">
        {!signedIn ? <>
          <Link href="/signin" className="header-nav__login">Log in</Link>
          <Link href="/signin" className="btn btn--forest btn--pill">Sign up</Link>
        </> : <>
          <NotificationBell />
          <details className="profile-nav" ref={profile}>
            <summary className="profile-nav__trigger"><Icon name="user" size={18} /><span>Profile</span><span className="profile-nav__caret" aria-hidden="true">⌄</span></summary>
            <div className="profile-nav__panel" onClick={(event) => {
              if ((event.target as HTMLElement).closest("a, button") && profile.current) profile.current.open = false;
            }}>
              {link("/favourites", "Favourites")}
              {link("/account", "Account settings")}
              {userRole === "admin" && link("/admin", "Admin dashboard")}
              {userRole === "provider" && link("/provider", "Provider dashboard")}
              {userRole === "customer" && link("/provider/register", "Become a provider")}
              <div className="profile-nav__divider" />
              <SignOutButton className="profile-nav__signout" />
            </div>
          </details>
        </>}
      </div>
    </nav>
  );
}

export function TabBar({ signedIn, userRole }: { signedIn: boolean; userRole?: string }) {
  const path = usePathname();

  // On a provider's own dashboard pages the bottom bar is theirs, not the customer's (Home, Search, Bookings).
  const providerArea = userRole === "provider" && path.startsWith("/provider") && path !== "/provider/register";
  const providerTabs: (NavLink & { exact?: boolean })[] = [
    { href: "/provider", label: "Overview", short: "Overview", icon: "grid", exact: true },
    { href: "/provider/availability", label: "Availability", short: "Availability", icon: "clock" },
    { href: "/provider/services", label: "Services", short: "Services", icon: "briefcase" },
    { href: "/provider/profile", label: "Profile", short: "Profile", icon: "user" },
  ];

  const tabs: (NavLink & { exact?: boolean })[] = providerArea ? providerTabs : [
    { href: "/", label: "Home", short: "Home", icon: "home" },
    { href: "/search", label: "Search", short: "Search", icon: "search" },
    {
      href: "/bookings",
      label: "Bookings",
      short: "Bookings",
      icon: "calendar",
    },
    {
      href: signedIn ? "/account" : "/signin",
      label: signedIn ? "Profile" : "Log in",
      short: signedIn ? "Profile" : "Log in",
      icon: "user",
    },
  ];

  return (
    <nav className="tabbar" aria-label="Main">
      {tabs.map((t) => {
        const active = t.exact ? path === t.href : isActive(path, t.href);
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

