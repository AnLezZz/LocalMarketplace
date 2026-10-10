"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import Icon from "../Icon";
import { api } from "../../lib/convex";
import { aucklandParts, clock, hourLabel, hourRows, weekOf } from "../../lib/calendarWeek";

type Booking = { _id: string; customerName: string; description: string; serviceName?: string; startsAt: number; endsAt: number; status: "requested" | "accepted" | "declined" | "cancelled" | "completed" };

const statusClass = (s: string) => (s === "requested" ? "cal-event--requested" : s === "accepted" ? "cal-event--accepted" : s === "completed" ? "cal-event--completed" : "cal-event--neutral");

/**
 * One week of the provider's bookings. The week is Monday to Sunday in Auckland time whatever the device's timezone is, and only
 * that week's bookings are fetched (so it stays correct for a provider with years of history). Updates live as bookings change.
 */
export default function WeeklyCalendar({ providerCategory = "Service" }: { providerCategory?: string }) {
  const [offset, setOffset] = useState(0);
  // The week is computed once per page view per offset: "today" must not shift under the user mid-session.
  const [openedAt] = useState(() => Date.now());
  const week = useMemo(() => weekOf(openedAt, offset), [openedAt, offset]);
  const rows = useQuery(api.bookings.providerRange, { from: week.from, to: week.to }) as Booking[] | undefined;

  const byDay = useMemo(() => {
    const m = new Map<string, Booking[]>(week.days.map((d) => [d.key, []]));
    for (const b of rows ?? []) m.get(aucklandParts(b.startsAt).key)?.push(b);
    return m;
  }, [rows, week]);
  const hours = useMemo(() => hourRows((rows ?? []).map((b) => b.startsAt)), [rows]);
  const range = `${week.days[0].date} ${week.days[0].month} - ${week.days[6].date} ${week.days[6].month}`;

  return (
    <div className="card cal-card" aria-busy={rows === undefined}>
      <div className="cal-card__head">
        <div>
          <h2 className="cal-card__title">Week</h2>
          <span className="cal-card__range num">{range} · Auckland time</span>
        </div>
        <div className="cal-card__nav">
          <button type="button" className="cal-btn" onClick={() => setOffset((w) => w - 1)} aria-label="Previous week"><Icon name="chevronLeft" size={16} /></button>
          <button type="button" className="cal-btn cal-btn--text" onClick={() => setOffset(0)}>This week</button>
          <button type="button" className="cal-btn" onClick={() => setOffset((w) => w + 1)} aria-label="Next week"><Icon name="chevronRight" size={16} /></button>
        </div>
      </div>

      <div className="cal-grid">
        <div className="cal-grid__gutter" />
        {week.days.map((d) => (
          <div key={d.key} className={`cal-grid__day-head ${d.isToday ? "cal-grid__day-head--today" : ""}`}>
            <span className="cal-grid__day-name">{d.name}</span>
            <span className="cal-grid__day-num num">{d.date}</span>
          </div>
        ))}
      </div>

      <div className="cal-body">
        {hours.map((hour) => (
          <div key={hour} className="cal-row">
            <div className="cal-row__label num">{hourLabel(hour)}</div>
            {week.days.map((d) => (
              <div key={d.key} className="cal-cell">
                {(byDay.get(d.key) ?? []).filter((b) => { const h = aucklandParts(b.startsAt).hour; return h >= hour && h < hour + 2; }).map((b) => (
                  <Link key={b._id} href={`/provider/bookings/${b._id}`} className={`cal-event ${statusClass(b.status)}`}>
                    <div className="cal-event__title">{b.serviceName || b.description || providerCategory}</div>
                    <div className="cal-event__time num">{clock(b.startsAt)} - {clock(b.endsAt)}</div>
                    <div className="cal-event__client">{b.customerName}</div>
                  </Link>
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>
      {rows !== undefined && rows.length === 0 && <p className="field__hint cal-empty">Nothing booked this week.</p>}
    </div>
  );
}
