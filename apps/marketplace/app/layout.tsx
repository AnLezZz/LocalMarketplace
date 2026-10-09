import "@localhub/design-tokens/tokens.css";
import "./globals.css";
import { Inter } from "next/font/google";
import { ConvexAuthNextjsServerProvider } from "@convex-dev/auth/nextjs/server";
import ConvexClientProvider from "./ConvexClientProvider";
import { getMe } from "../lib/auth";
import Logo from "../components/Logo";
import { HeaderNav, TabBar, type NavLink } from "../components/Nav";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-inter", display: "swap" });

export const metadata = { title: "LocalHub", description: "Find trusted local help in Auckland" };
export const viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#F0F5F9" };

const SIGN_IN: NavLink = { href: "/signin", label: "Sign in", short: "Sign in", icon: "signIn" };
const BOOKINGS: NavLink = { href: "/bookings", label: "My bookings", short: "Bookings", icon: "calendar" };
const REGISTER: NavLink = { href: "/provider/register", label: "Become a provider", short: "Become a pro", icon: "briefcase" };
const INBOX: NavLink = { href: "/provider", label: "Provider inbox", short: "Inbox", icon: "inbox" };
const ADMIN: NavLink = { href: "/admin", label: "Admin", short: "Admin", icon: "shield" };

export default async function Root({ children }: { children: React.ReactNode }) {
  const me = await getMe();
  // Header keeps the original link order; the tab bar puts each role's main task first.
  const header: NavLink[] = !me ? [SIGN_IN]
    : me.role === "admin" ? [ADMIN]
    : me.role === "provider" ? [BOOKINGS, INBOX]
    : [BOOKINGS, REGISTER];
  const tabs: NavLink[] = !me ? [SIGN_IN]
    : me.role === "admin" ? [ADMIN]
    : me.role === "provider" ? [INBOX, BOOKINGS]
    : [BOOKINGS, REGISTER];

  return (
    <ConvexAuthNextjsServerProvider>
      <html lang="en-NZ" className={inter.variable}>
        <body>
          <ConvexClientProvider>
            <header className="topbar">
              <div className="topbar__inner">
                <Logo />
                <HeaderNav links={header} signedIn={!!me} />
              </div>
            </header>
            <main>{children}</main>
            <footer className="footer">LocalHub does not collect, hold or guarantee payment. Pay your provider directly.</footer>
            <TabBar links={tabs} signedIn={!!me} />
          </ConvexClientProvider>
        </body>
      </html>
    </ConvexAuthNextjsServerProvider>
  );
}
