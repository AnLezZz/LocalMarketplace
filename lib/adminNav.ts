/** Admin sidebar. Only pages that exist are listed. */
export function adminSidebarItems(counts: { applications?: number; reports?: number; disputes?: number } = {}) {
  const b = (n?: number) => (n && n > 0 ? n : undefined);
  return [
    { id: "dashboard", label: "Dashboard", icon: "grid" as const, href: "/admin" },
    { id: "providers", label: "Providers", icon: "users" as const, href: "/admin/providers", badge: b(counts.applications) },
    { id: "customers", label: "Accounts", icon: "user" as const, href: "/admin/customers" },
    { id: "bookings", label: "Bookings", icon: "calendar" as const, href: "/admin/bookings" },
    { id: "reviews", label: "Reviews", icon: "star" as const, href: "/admin/reviews", badge: b(counts.reports) },
    { id: "categories", label: "Categories", icon: "tag" as const, href: "/admin/categories" },
    { id: "disputes", label: "Disputes", icon: "alert" as const, href: "/admin/disputes", badge: b(counts.disputes) },
    { id: "audit", label: "Audit log", icon: "shield" as const, href: "/admin/audit" },
  ];
}
