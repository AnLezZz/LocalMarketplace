"use client";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "../lib/convex";
import Icon from "./Icon";

/** Header bell. The count is a live query, so it changes the moment something happens. */
export default function NotificationBell() {
  const count = useQuery(api.notifications.unreadCount) as number | undefined;
  const label = count ? `Notifications, ${count} unread` : "Notifications";
  return (
    <Link href="/notifications" className="bell" aria-label={label}>
      <Icon name="bell" size={22} />
      {!!count && <span className="bell__badge num">{count > 99 ? "99+" : count}</span>}
    </Link>
  );
}
