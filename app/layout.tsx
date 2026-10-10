import "./tokens.css";
import "./globals.css";
import "./landing.css";
import localFont from "next/font/local";
import { ConvexAuthNextjsServerProvider } from "@convex-dev/auth/nextjs/server";
import ConvexClientProvider from "./ConvexClientProvider";
import { getMe } from "../lib/auth";
import Logo from "../components/Logo";
import { HeaderNav, TabBar } from "../components/Nav";

// Self-hosted (SIL Open Font License, see app/fonts), so a build never depends on fetching Google Fonts.
const inter = localFont({ src: "./fonts/inter-latin-wght-normal.woff2", weight: "100 900", style: "normal", variable: "--font-inter", display: "swap" });
const serif = localFont({ src: "./fonts/instrument-serif-latin-400-normal.woff2", weight: "400", style: "normal", variable: "--font-serif", display: "swap" });

export const metadata = { title: "Localo — trusted local help", description: "Find and book trusted local cleaners, gardeners, handymen and more." };
export const viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#F0F5F9" };

export default async function Root({ children }: { children: React.ReactNode }) {
  const me = await getMe();
  return (
    <ConvexAuthNextjsServerProvider>
      <html lang="en-NZ" className={`${inter.variable} ${serif.variable}`}>
        <body>
          <ConvexClientProvider>
            <header className="topbar">
              <div className="topbar__inner">
                <Logo />
                <div className="topbar__end">
                  <HeaderNav signedIn={!!me} userRole={me?.role} name={me?.name ?? me?.email ?? "You"} photo={me?.photo ?? null} />
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
