import "@localhub/design-tokens/tokens.css";
import "./globals.css";
import Link from "next/link";

export const metadata = { title: "LocalHub", description: "Find trusted local help in Auckland" };

export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-NZ">
      <body>
        <header><Link href="/" className="logo">LocalHub</Link></header>
        <main>{children}</main>
        <footer>LocalHub does not collect, hold or guarantee payment. Pay your provider directly.</footer>
      </body>
    </html>
  );
}
