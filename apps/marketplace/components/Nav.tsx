"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Icon, { type IconName } from "./Icon";
import SignOutButton from "../app/SignOutButton";

export type NavLink = { href: string; label: string; short: string; icon: IconName };

function isActive(path: string, href: string) {
  return href === "/" ? path === "/" : path === href || path.startsWith(href + "/");
}

/** Inline links in the top bar (>= 720px). Same links and visibility rules as the tab bar. */
export function HeaderNav({ links, signedIn }: { links: NavLink[]; signedIn: boolean }) {
  const path = usePathname();
  return (
    <nav className="header-nav" aria-label="Main">
      {links.map((l) => (
        <Link key={l.href} href={l.href} className="header-nav__link" aria-current={isActive(path, l.href) ? "page" : undefined}>
          {l.label}
        </Link>
      ))}
      {signedIn && <SignOutButton className="btn btn--secondary btn--sm" />}
    </nav>
  );
}

/** Fixed bottom tab bar (< 720px). Home first, then the role's links, then Sign out. */
export function TabBar({ links, signedIn }: { links: NavLink[]; signedIn: boolean }) {
  const path = usePathname();
  const tabs: NavLink[] = [{ href: "/", label: "Home", short: "Home", icon: "home" }, ...links];
  return (
    <nav className="tabbar" aria-label="Main">
      {tabs.map((t) => {
        const active = isActive(path, t.href);
        return (
          <Link key={t.href} href={t.href} className="tabbar__item" aria-current={active ? "page" : undefined}>
            <Icon name={t.icon} size={24} />
            <span>{t.short}</span>
          </Link>
        );
      })}
      {signedIn && (
        <SignOutButton className="tabbar__item">
          <Icon name="signOut" size={24} />
          <span>Sign out</span>
        </SignOutButton>
      )}
    </nav>
  );
}
