// Initials on a tinted disc. The hue is a stable hash of the name, so a provider always gets the same colour.
const PAIRS: [string, string][] = [
  ["#DCE8FF", "#1A47B8"],
  ["#DDF3EA", "#0E6B4A"],
  ["#FDE8D7", "#9A4A0E"],
  ["#FBE3EA", "#A3254D"],
  ["#E9E3FD", "#5B37B8"],
  ["#DFF0FB", "#0B5F94"],
  ["#EEF4D9", "#4D6B0F"],
  ["#FFF0C9", "#7F5A00"],
];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export function initials(name: string): string {
  const words = name.replace(/[^\p{L}\p{N}\s]/gu, " ").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = words[0][0], last = words.length > 1 ? words[words.length - 1][0] : "";
  return (first + last).toUpperCase();
}

export default function Avatar({ name, size = 44 }: { name: string; size?: number }) {
  const [bg, fg] = PAIRS[hash(name) % PAIRS.length];
  return (
    <span
      className="avatar"
      aria-hidden="true"
      style={{ width: size, height: size, background: bg, color: fg, fontSize: Math.round(size * 0.36) }}
    >
      {initials(name)}
    </span>
  );
}
