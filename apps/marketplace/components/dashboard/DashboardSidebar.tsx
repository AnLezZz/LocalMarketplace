import Link from "next/link";
import Icon, { type IconName } from "../Icon";
import Avatar from "../Avatar";
import SignOutButton from "../../app/SignOutButton";

export interface NavItem {
  id: string;
  label: string;
  icon: IconName;
  href: string;
  badge?: number | string;
}

export interface DashboardSidebarProps {
  portal: "business" | "admin";
  activeId?: string;
  user: {
    name: string;
    subtext: string;
    profileHref?: string;
  };
  items: NavItem[];
}

export default function DashboardSidebar({
  portal,
  activeId = "overview",
  user,
  items,
}: DashboardSidebarProps) {
  const isBusiness = portal === "business";

  return (
    <aside className="d-sidebar">
      {/* Brand header */}
      <div className="d-sidebar__brand">
        <Link href="/" className="d-sidebar__logo">
          <span className="d-sidebar__logo-mark">
            <svg width="24" height="24" viewBox="0 0 28 28" fill="none">
              <rect width="28" height="28" rx="8" fill={isBusiness ? "#16A34A" : "#2563EB"} />
              <path
                d="M7 14.5L12 19.5L21 8.5"
                stroke="#FFFFFF"
                strokeWidth="2.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span className="d-sidebar__logo-text">LocalHub</span>
        </Link>
        <span
          className={`d-sidebar__badge ${
            isBusiness ? "d-sidebar__badge--business" : "d-sidebar__badge--admin"
          }`}
        >
          {isBusiness ? "Business" : "Admin"}
        </span>
      </div>

      {/* Nav links */}
      <nav className="d-sidebar__nav" aria-label="Dashboard navigation">
        <ul className="d-sidebar__list">
          {items.map((item) => {
            const isActive = item.id === activeId;
            return (
              <li key={item.id} className="d-sidebar__item">
                <Link
                  href={item.href}
                  className={`d-sidebar__link ${isActive ? "d-sidebar__link--active" : ""}`}
                >
                  <Icon name={item.icon} size={18} />
                  <span className="d-sidebar__label">{item.label}</span>
                  {item.badge !== undefined && (
                    <span className="d-sidebar__count">{item.badge}</span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Profile Footer */}
      <div className="d-sidebar__footer">
        <div className="d-sidebar__user">
          <Avatar name={user.name} size={36} />
          <div className="d-sidebar__user-info">
            <span className="d-sidebar__user-name">{user.name}</span>
            {user.profileHref ? (
              <Link href={user.profileHref} className="d-sidebar__user-sub">
                {user.subtext}
              </Link>
            ) : (
              <span className="d-sidebar__user-sub">{user.subtext}</span>
            )}
          </div>
        </div>
        <div className="d-sidebar__actions">
          <SignOutButton className="d-sidebar__signout">
            <Icon name="signOut" size={16} />
            <span>Sign out</span>
          </SignOutButton>
        </div>
      </div>
    </aside>
  );
}
