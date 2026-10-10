import "@localhub/design-tokens/tokens.css";
import "./globals.css";
import "./landing.css";
import { Inter, Instrument_Serif } from "next/font/google";
import { ConvexAuthNextjsServerProvider } from "@convex-dev/auth/nextjs/server";
import ConvexClientProvider from "./ConvexClientProvider";
import { getMe } from "../lib/auth";
import Logo from "../components/Logo";
import NotificationBell from "../components/NotificationBell";
import { HeaderNav, TabBar, type NavLink } from "../components/Nav";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-inter", display: "swap" });
const serif = Instrument_Serif({ subsets: ["latin"], weight: "400", variable: "--font-serif", display: "swap" });

export const metadata = { title: "Localo — trusted local help", description: "Find and book trusted local cleaners, gardeners, handymen and more." };
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
      <html lang="en-NZ" className={`${inter.variable} ${serif.variable}`}>
        <body>
          <ConvexClientProvider>
            <header className="topbar">
              <div className="topbar__inner">
                <Logo />
                <div className="topbar__end">
                  <HeaderNav signedIn={!!me} userRole={me?.role} />
                  {me && <NotificationBell />}
                </div>
              </div>
            </header>
            {me?.suspended && <div className="suspended-bar" role="alert">Your account is suspended. You can look around, but you can&apos;t make changes. Contact support if you think this is a mistake.</div>}
            <main>{children}</main>
            <footer className="footer">Localo does not collect, hold or guarantee payment. Pay your provider directly.</footer>
            <TabBar signedIn={!!me} userRole={me?.role} />
          </ConvexClientProvider>
        </body>
      </html>
    </ConvexAuthNextjsServerProvider>
  );
}
