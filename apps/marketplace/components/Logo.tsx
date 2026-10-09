import Link from "next/link";

export default function Logo() {
  return (
    <Link href="/" className="brand" aria-label="LocalHub home">
      <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true" focusable="false" className="brand__mark">
        <defs>
          <linearGradient id="brandGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#1E6AEB" />
            <stop offset="1" stopColor="#0A44DB" />
          </linearGradient>
        </defs>
        <rect width="30" height="30" rx="9" fill="url(#brandGrad)" />
        <path d="M8.5 15.25 15 9.5l6.5 5.75" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="15" cy="19.5" r="2.2" fill="#fff" />
      </svg>
      <span className="brand__word">LocalHub</span>
    </Link>
  );
}
