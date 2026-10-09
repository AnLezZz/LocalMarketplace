import "@localhub/design-tokens/tokens.css";
import "./globals.css";
import Link from "next/link";

export const metadata = { title: "Localo — trusted local help", description: "Find and book trusted local cleaners, gardeners, handymen and more." };

export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-NZ">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Instrument+Serif:ital@0;1&display=swap" rel="stylesheet" />
      </head>
      <body>
        <nav className="nav">
          <div className="wrap">
            <Link href="/" className="logo"><i />Localo</Link>
            <div className="nav-links">
              <Link href="/#how">How it works</Link>
              <Link href="/provider">For providers</Link>
              <Link href="/#browse" className="cta">Find help</Link>
            </div>
          </div>
        </nav>
        {children}
        <footer><div className="wrap">Localo does not collect, hold or guarantee payment. Pay your provider directly. © 2026 Localo, Auckland.</div></footer>
      </body>
    </html>
  );
}
