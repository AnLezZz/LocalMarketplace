import Link from "next/link";

export default function Logo() {
  return (
    <Link href="/" className="brand" aria-label="Localo home">
      <span className="brand__word">Localo</span>
    </Link>
  );
}
