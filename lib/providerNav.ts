/** Provider dashboard sidebar. Only pages that exist are listed. */
export function providerSidebarItems(pendingRequests = 0) {
  return [
    { id: "overview", label: "Overview", icon: "grid" as const, href: "/provider" },
    { id: "bookings", label: "Bookings", icon: "inbox" as const, href: "/provider/bookings", badge: pendingRequests > 0 ? pendingRequests : undefined },
    { id: "calendar", label: "Calendar", icon: "calendar" as const, href: "/provider/calendar" },
    { id: "availability", label: "Availability", icon: "clock" as const, href: "/provider/availability" },
    { id: "services", label: "Services", icon: "briefcase" as const, href: "/provider/services" },
    { id: "category-requests", label: "Category requests", icon: "tag" as const, href: "/provider/category-requests" },
    { id: "reviews", label: "Reviews", icon: "star" as const, href: "/provider/reviews" },
    { id: "profile", label: "Profile", icon: "user" as const, href: "/provider/profile" },
  ];
}
