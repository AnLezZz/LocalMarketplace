"use client";

import { useState, useMemo } from "react";
import Icon from "../Icon";

export interface CalendarBooking {
  _id: string;
  customerName: string;
  description: string;
  startsAt: number;
  endsAt: number;
  status: "requested" | "accepted" | "declined" | "cancelled" | "completed";
}

interface WeeklyCalendarProps {
  bookings: CalendarBooking[];
  providerCategory?: string;
}

const HOURS = [8, 10, 12, 14, 16];
const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function WeeklyCalendar({ bookings, providerCategory = "Service" }: WeeklyCalendarProps) {
  // Offset in weeks from today
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedBooking, setSelectedBooking] = useState<CalendarBooking | null>(null);

  // Calculate the dates for the currently viewed Monday - Sunday
  const weekDays = useMemo(() => {
    const now = new Date();
    // Get Monday of the current week (in NZ time or local time)
    const currentDay = now.getDay(); // 0 is Sun, 1 is Mon...
    const diffToMonday = currentDay === 0 ? -6 : 1 - currentDay;

    const monday = new Date(now);
    monday.setDate(now.getDate() + diffToMonday + weekOffset * 7);
    monday.setHours(0, 0, 0, 0);

    return DAY_NAMES.map((name, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const isToday =
        d.toDateString() === new Date().toDateString();
      return {
        name,
        date: d.getDate(),
        month: d.toLocaleString("en-NZ", { month: "short" }),
        fullDate: d,
        isToday,
      };
    });
  }, [weekOffset]);

  // Filter bookings that fall into this week
  const weekBookings = useMemo(() => {
    if (!weekDays.length) return [];
    const weekStart = new Date(weekDays[0].fullDate);
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekDays[6].fullDate);
    weekEnd.setHours(23, 59, 59, 999);

    const startMs = weekStart.getTime();
    const endMs = weekEnd.getTime();

    return bookings.filter(
      (b) => b.startsAt >= startMs && b.startsAt <= endMs && b.status !== "declined" && b.status !== "cancelled"
    );
  }, [bookings, weekDays]);

  // Map bookings to day index (0 to 6) and hour slot
  const eventsByDay = useMemo(() => {
    const map = new Map<number, CalendarBooking[]>();
    for (let i = 0; i < 7; i++) map.set(i, []);

    for (const b of weekBookings) {
      const d = new Date(b.startsAt);
      const day = d.getDay();
      const index = day === 0 ? 6 : day - 1; // Mon = 0, Sun = 6
      map.get(index)?.push(b);
    }
    return map;
  }, [weekBookings]);

  const monthRangeText = useMemo(() => {
    if (!weekDays.length) return "";
    const first = weekDays[0];
    const last = weekDays[6];
    return `${first.date} ${first.month} - ${last.date} ${last.month}`;
  }, [weekDays]);

  function getStatusColor(status: string) {
    switch (status) {
      case "requested":
        return "cal-event--requested";
      case "accepted":
        return "cal-event--accepted";
      case "completed":
        return "cal-event--completed";
      default:
        return "cal-event--neutral";
    }
  }

  function formatTime(ms: number) {
    return new Date(ms).toLocaleTimeString("en-NZ", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  }

  return (
    <div className="card cal-card">
      <div className="cal-card__head">
        <div>
          <h2 className="cal-card__title">Your calendar</h2>
          <span className="cal-card__range num">{monthRangeText}</span>
        </div>
        <div className="cal-card__nav">
          <button
            type="button"
            className="cal-btn"
            onClick={() => setWeekOffset((w) => w - 1)}
            aria-label="Previous week"
          >
            <Icon name="chevronLeft" size={16} />
          </button>
          <button
            type="button"
            className="cal-btn cal-btn--text"
            onClick={() => setWeekOffset(0)}
          >
            This week
          </button>
          <button
            type="button"
            className="cal-btn"
            onClick={() => setWeekOffset((w) => w + 1)}
            aria-label="Next week"
          >
            <Icon name="chevronRight" size={16} />
          </button>
        </div>
      </div>

      {/* Week header */}
      <div className="cal-grid">
        <div className="cal-grid__gutter" />
        {weekDays.map((d, i) => (
          <div
            key={d.name}
            className={`cal-grid__day-head ${d.isToday ? "cal-grid__day-head--today" : ""}`}
          >
            <span className="cal-grid__day-name">{d.name}</span>
            <span className="cal-grid__day-num num">{d.date}</span>
          </div>
        ))}
      </div>

      {/* Hourly timetable */}
      <div className="cal-body">
        {HOURS.map((hour) => (
          <div key={hour} className="cal-row">
            <div className="cal-row__label num">
              {hour > 12 ? `${hour - 12} PM` : hour === 12 ? "12 PM" : `${hour} AM`}
            </div>
            {weekDays.map((_, dayIdx) => {
              const dayEvents = (eventsByDay.get(dayIdx) ?? []).filter((b) => {
                const h = new Date(b.startsAt).getHours();
                return h >= hour && h < hour + 2;
              });

              return (
                <div key={dayIdx} className="cal-cell">
                  {dayEvents.map((evt) => (
                    <button
                      key={evt._id}
                      type="button"
                      className={`cal-event ${getStatusColor(evt.status)}`}
                      onClick={() => setSelectedBooking(evt)}
                    >
                      <div className="cal-event__title">{evt.description || providerCategory}</div>
                      <div className="cal-event__time num">
                        {formatTime(evt.startsAt)} - {formatTime(evt.endsAt)}
                      </div>
                      <div className="cal-event__client">{evt.customerName}</div>
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Selected event popup modal/card if clicked */}
      {selectedBooking && (
        <div className="cal-modal-backdrop" onClick={() => setSelectedBooking(null)}>
          <div className="cal-modal card" onClick={(e) => e.stopPropagation()}>
            <div className="cal-modal__head">
              <h3>Booking Details</h3>
              <button
                type="button"
                className="cal-modal__close"
                onClick={() => setSelectedBooking(null)}
              >
                <Icon name="x" size={18} />
              </button>
            </div>
            <div className="cal-modal__body">
              <p><strong>Customer:</strong> {selectedBooking.customerName}</p>
              <p><strong>Service:</strong> {selectedBooking.description}</p>
              <p><strong>Time:</strong> {formatTime(selectedBooking.startsAt)} - {formatTime(selectedBooking.endsAt)}</p>
              <p><strong>Status:</strong> <span className="capitalize">{selectedBooking.status}</span></p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
