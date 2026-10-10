// Authored line icons: 24px grid, 1.75 stroke, round joins. Decorative by default (aria-hidden).
import type { ReactNode } from "react";

const PATHS = {
  home: <><path d="M3.5 10.5 12 4l8.5 6.5" /><path d="M5.5 9v10a1 1 0 0 0 1 1h3.75v-5.5h3.5V20h3.75a1 1 0 0 0 1-1V9" /></>,
  calendar: <><rect x="3.5" y="5" width="17" height="15.5" rx="3.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>,
  briefcase: <><rect x="3.5" y="7.5" width="17" height="12.5" rx="3" /><path d="M9 7.5V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5M3.5 13h17" /></>,
  inbox: <><path d="M3.5 13.5 6 6.3A2 2 0 0 1 7.9 5h8.2A2 2 0 0 1 18 6.3l2.5 7.2V18a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" /><path d="M3.5 13.5h4.75L9.75 16h4.5l1.5-2.5h4.75" /></>,
  shield: <><path d="M12 3.5 19 6v5.5c0 4.3-2.9 7.6-7 9-4.1-1.4-7-4.7-7-9V6z" /><path d="m9 12 2 2 4-4" /></>,
  signIn: <><path d="M14 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" /><path d="m10 8 4 4-4 4M14 12H4" /></>,
  signOut: <><path d="M10 4H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3" /><path d="m15 8 4 4-4 4M19 12H9" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></>,
  pin: <><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" /><circle cx="12" cy="10" r="2.3" /></>,
  star: <path d="m12 3.8 2.5 5.1 5.6.8-4 3.9.9 5.6-5-2.6-5 2.6.9-5.6-4-3.9 5.6-.8z" fill="currentColor" />,
  chevronLeft: <path d="M14.5 6 8.5 12l6 6" />,
  chevronRight: <path d="m9.5 6 6 6-6 6" />,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  x: <path d="m6.5 6.5 11 11M17.5 6.5l-11 11" />,
  alert: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5v5M12 16.2v.3" /></>,
  info: <><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5M12 7.8v.3" /></>,
  user: <><circle cx="12" cy="8.5" r="3.75" /><path d="M4.5 20c.8-3.6 3.8-5.75 7.5-5.75s6.7 2.15 7.5 5.75" /></>,
  heart: <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />,
  leaf: <><path d="M11 20A7 7 0 0 1 4 13a7 7 0 0 1 7-7 7 7 0 0 1 7 7v1a6 6 0 0 1-6 6h-1Z" /><path d="M11 20v-9" /></>,
  dots: <><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /><circle cx="5" cy="12" r="1.5" /></>,
  users: <><circle cx="9" cy="8.5" r="3" /><path d="M3.5 19c.7-2.8 3-4.5 5.5-4.5s4.8 1.7 5.5 4.5" /><circle cx="17" cy="9.5" r="2.5" /><path d="M16 14.8c1.8.3 3.5 1.5 4 3.7" /></>,
  grid: <><rect x="3.5" y="3.5" width="7" height="7" rx="2" /><rect x="13.5" y="3.5" width="7" height="7" rx="2" /><rect x="3.5" y="13.5" width="7" height="7" rx="2" /><rect x="13.5" y="13.5" width="7" height="7" rx="2" /></>,
  chart: <><path d="M4 20h16M7 16v-4M12 16V8M17 16v-6" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" /></>,
  tag: <><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82zM7 7h.01" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  trendUp: <><path d="m18 8-7 7-4-4-4 4" /><path d="M14 8h4v4" /></>,
  trendDown: <><path d="m18 16-7-7-4 4-4-4" /><path d="M14 16h4v-4" /></>,
  filter: <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />,
  card: <><rect x="3.5" y="5.5" width="17" height="13" rx="3" /><path d="M3.5 10h17M7.5 14.5h3" /></>,
  // Categories
  cleaning: <><path d="M8.5 10.5h6a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1h-6a1 1 0 0 1-1-1v-8.5a1 1 0 0 1 1-1z" /><path d="M10 10.5v-3h3v3M9 7.5V5a1 1 0 0 1 1-1h4.5L13 7.5" /><path d="M18 4.5h2M18 7.5l1.6 1M18 1.75l1.6-1" /></>,
  gardening: <><path d="M12 20v-8" /><path d="M12 12c0-4 2.5-6.5 7-6.5 0 4.5-2.5 6.5-7 6.5zM12 14.5c0-3.5-2-5.5-6.5-5.5 0 3.8 2 5.5 6.5 5.5z" /><path d="M7 20h10" /></>,
  handyman: <path d="M15.5 4.2a4.5 4.5 0 0 0-4.6 6.1l-6.3 6.3a1.9 1.9 0 0 0 2.7 2.7l6.3-6.3a4.5 4.5 0 0 0 6.1-4.6l-2.6 2.6-2.4-.6-.6-2.4z" />,
  petCare: <><path d="M12 13c-2.6 0-5 2.6-5 4.7 0 1.4 1 2.3 2.4 2.3.9 0 1.7-.5 2.6-.5s1.7.5 2.6.5c1.4 0 2.4-.9 2.4-2.3 0-2.1-2.4-4.7-5-4.7z" /><circle cx="5.75" cy="10.5" r="1.75" /><circle cx="9.5" cy="6.5" r="1.9" /><circle cx="14.5" cy="6.5" r="1.9" /><circle cx="18.25" cy="10.5" r="1.75" /></>,
  car: <><path d="M4 16.5v-3.2l1.8-4.6a2 2 0 0 1 1.9-1.2h8.6a2 2 0 0 1 1.9 1.2l1.8 4.6v3.2a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" /><path d="M4 13.3h16M7 17.5V19.5M17 17.5V19.5M7.5 10.5h9" /></>,
  bell: <><path d="M6 17V11a6 6 0 0 1 12 0v6l1.5 2h-15z" /><path d="M10 21a2 2 0 0 0 4 0" /></>,
  moving: <><path d="M4 8l8-4 8 4v8l-8 4-8-4z" /><path d="m4 8 8 4 8-4M12 12v8M8 6l8 4" /></>,
  // More categories
  scissors: <><circle cx="6" cy="6.5" r="2.5" /><circle cx="6" cy="17.5" r="2.5" /><path d="M8 8.2 20 18M8 15.8 20 6" /></>,
  spa: <><path d="M12 20c-4 0-7-2.5-7.5-6.5 3 0 5.5 1 7.5 3.5 2-2.5 4.5-3.5 7.5-3.5C19 17.5 16 20 12 20z" /><path d="M12 17.5C9.5 15 9.5 9.5 12 4c2.5 5.5 2.5 11 0 13.5z" /></>,
  smile: <><circle cx="12" cy="12" r="8.5" /><path d="M8.5 14.2c.9 1.2 2.1 1.8 3.5 1.8s2.6-.6 3.5-1.8M9.2 10v.4M14.8 10v.4" /></>,
  book: <><path d="M5 5.5A1.5 1.5 0 0 1 6.5 4H19v14.5H6.5A1.5 1.5 0 0 0 5 20z" /><path d="M5 20a1.5 1.5 0 0 1 1.5-1.5H19M9 8h6" /></>,
  droplet: <path d="M12 3.5s6 6 6 10.2a6 6 0 0 1-12 0C6 9.5 12 3.5 12 3.5z" />,
  bolt: <path d="M13 3 5 13.5h6L10 21l8-10.5h-6z" />,
  paint: <><rect x="4" y="4" width="14" height="5" rx="1.5" /><path d="M18 6.5h2v5h-8v3" /><rect x="10.5" y="14.5" width="3" height="6" rx="1" /></>,
  window: <><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M12 4v16M4 12h16" /></>,
  tree: <><path d="M12 21v-6" /><path d="M12 15c-3.5 0-6-2.4-6-5.5 0-1.6.8-3 2-3.9.5-2 2-3.1 4-3.1s3.5 1.1 4 3.1c1.2.9 2 2.3 2 3.9 0 3.1-2.5 5.5-6 5.5z" /></>,
  truck: <><path d="M3 7h11v9H3z" /><path d="M14 10h3.5L21 13v3h-7" /><circle cx="7" cy="17.5" r="2" /><circle cx="17" cy="17.5" r="2" /></>,
  sparkles: <><path d="M10 4l1.6 4.4L16 10l-4.4 1.6L10 16l-1.6-4.4L4 10l4.4-1.6z" /><path d="M18 14l.8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8z" /></>,
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof PATHS;

export default function Icon({ name, size = 20, className, label }: { name: IconName; size?: number; className?: string; label?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ? `icon ${className}` : "icon"}
      aria-hidden={label ? undefined : true}
      role={label ? "img" : undefined}
      aria-label={label}
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
