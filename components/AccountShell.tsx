import Link from "next/link";
import Icon, { type IconName } from "./Icon";
import Avatar from "./Avatar";
import { getMe } from "../lib/auth";
import "./account-shell.css";

const ITEMS: { id: "bookings" | "favourites" | "notifications" | "settings"; label: string; icon: IconName; href: string }[] = [
  { id: "bookings", label: "My bookings", icon: "calendar", href: "/bookings" },
  { id: "favourites", label: "Favourites", icon: "heart", href: "/favourites" },
  { id: "notifications", label: "Notifications", icon: "bell", href: "/notifications" },
  { id: "settings", label: "Account settings", icon: "user", href: "/account" },
];

/** The customer's account area: one side menu (tabs on a phone) around bookings, favourites, notifications and settings. */
export default async function AccountShell({ active, children }: { active: (typeof ITEMS)[number]["id"]; children: React.ReactNode }) {
  const me = await getMe();
  return (
    <div className="page page--wide acct-shell">
      <aside className="acct-shell__side">
        {me && (
          <div className="acct-shell__who">
            <Avatar name={me.name ?? me.email ?? "You"} size={44} />
            <span><strong>{me.name ?? "Your account"}</strong>{me.email && <small>{me.email}</small>}</span>
          </div>
        )}
        <nav aria-label="Your account">
          <ul>
            {ITEMS.map((i) => (
              <li key={i.id}>
                <Link href={i.href} aria-current={i.id === active ? "page" : undefined}><Icon name={i.icon} size={18} />{i.label}</Link>
              </li>
            ))}
          </ul>
        </nav>
      </aside>
      <div className="acct-shell__main">{children}</div>
    </div>
  );
}
