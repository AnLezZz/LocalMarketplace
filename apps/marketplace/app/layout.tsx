import "@localhub/design-tokens/tokens.css";
import "./globals.css";
import Link from "next/link";
import { ConvexAuthNextjsServerProvider } from "@convex-dev/auth/nextjs/server";
import ConvexClientProvider from "./ConvexClientProvider";
import SignOutButton from "./SignOutButton";
import { getMe } from "../lib/auth";

export const metadata = { title: "LocalHub", description: "Find trusted local help in Auckland" };

export default async function Root({ children }: { children: React.ReactNode }) {
  const me = await getMe();
  return (
    <ConvexAuthNextjsServerProvider>
      <html lang="en-NZ">
        <body>
          <ConvexClientProvider>
            <header>
              <Link href="/" className="logo">LocalHub</Link>
              <nav style={{ display: "inline-flex", gap: 16, marginLeft: 16, alignItems: "center" }}>
                {!me && <Link href="/signin">Sign in</Link>}
                {me && me.role !== "admin" && <Link href="/bookings">My bookings</Link>}
                {me?.role === "customer" && <Link href="/provider/register">Become a provider</Link>}
                {me?.role === "provider" && <Link href="/provider">Provider inbox</Link>}
                {me?.role === "admin" && <Link href="/admin">Admin</Link>}
                {me && <SignOutButton />}
              </nav>
            </header>
            <main>{children}</main>
            <footer>LocalHub does not collect, hold or guarantee payment. Pay your provider directly.</footer>
          </ConvexClientProvider>
        </body>
      </html>
    </ConvexAuthNextjsServerProvider>
  );
}
