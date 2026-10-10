"use client";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../lib/convex";
import Icon from "../../components/Icon";

type N = { _id: string; kind: string; title: string; body: string; href: string; read: boolean; at: number };
const fmt = new Intl.DateTimeFormat("en-NZ", { timeZone: "Pacific/Auckland", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

/** Live list. New notifications appear and read state flips without a refresh. */
export default function NotificationList() {
  const router = useRouter();
  const items = useQuery(api.notifications.mine) as N[] | undefined;
  const markRead = useMutation(api.notifications.markRead);
  const markAll = useMutation(api.notifications.markAllRead);

  if (items === undefined) return <div className="card card--pad nt-skel" aria-busy="true" aria-label="Loading notifications"><span /><span /><span /></div>;
  if (items.length === 0) {
    return (
      <div className="empty card">
        <span className="empty__icon"><Icon name="bell" size={26} /></span>
        <h2 className="empty__title">You&apos;re all caught up</h2>
        <p className="empty__text">Booking updates and reviews will show up here.</p>
      </div>
    );
  }
  const unread = items.filter((n) => !n.read).length;
  return (
    <>
      <div className="nt-bar">
        <span className="num">{unread} unread</span>
        <button className="link-btn" disabled={unread === 0} onClick={() => void markAll({})}>Mark all as read</button>
      </div>
      <ul className="nt-list">
        {items.map((n) => (
          <li key={n._id}>
            <button className={`nt${n.read ? "" : " nt--unread"}`} onClick={async () => { if (!n.read) await markRead({ id: n._id }); router.push(n.href); }}>
              <span className="nt__dot" aria-hidden="true" />
              <span className="nt__text"><strong>{n.title}</strong><span>{n.body}</span></span>
              <time dateTime={new Date(n.at).toISOString()}>{fmt.format(n.at)}</time>
              {!n.read && <span className="sr-only">Unread</span>}
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
