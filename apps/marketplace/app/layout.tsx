import "@localhub/design-tokens/tokens.css";
import "./globals.css";
import Link from "next/link";
import { ConvexAuthNextjsServerProvider } from "@convex-dev/auth/nextjs/server";
import ConvexClientProvider from "./ConvexClientProvider";
import SignOutButton from "./SignOutButton";
import { getMe } from "../lib/auth";

export const metadata = { title: "Localo — trusted local help", description: "Find and book trusted local cleaners, gardeners, handymen and more." };

export default async function Root({ children }: { children: React.ReactNode }) {
  const me = await getMe();
  return (
    <ConvexAuthNextjsServerProvider>
      <html lang="en-NZ">
        <head>
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
          <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Instrument+Serif:ital@0;1&display=swap" rel="stylesheet" />
        </head>
        <body>
          <ConvexClientProvider>
            <nav className="nav">
              <div className="wrap">
                <Link href="/" className="logo"><i />Localo</Link>
                <div className="nav-links">
                  {me && me.role !== "admin" && <Link href="/bookings">My bookings</Link>}
                  {me?.role === "customer" && <Link href="/provider/register">Become a provider</Link>}
                  {me?.role === "provider" && <Link href="/provider">Provider inbox</Link>}
                  {me?.role === "admin" && <Link href="/admin">Admin</Link>}
                  {me ? <SignOutButton /> : <Link href="/signin" className="cta">Sign in</Link>}
                </div>
              </div>
            </nav>
            {children}
            <footer><div className="wrap">Localo does not collect, hold or guarantee payment. Pay your provider directly. © 2026 Localo, Auckland.</div></footer>
          </ConvexClientProvider>
        </body>
      </html>
    </ConvexAuthNextjsServerProvider>
  );
}
