import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import Providers from "@/components/Providers";
import WalletConnect from "@/components/WalletConnect";
import TokenInfo from "@/components/TokenInfo";

export const metadata: Metadata = {
  title: "HUNGERNADS - AI Gladiator Colosseum",
  description:
    "May the nads be ever in your favor. AI gladiators fight to survive. Bet, sponsor, and watch the carnage on Monad.",
  keywords: ["AI", "gladiator", "Monad", "betting", "blockchain", "nad.fun"],
};

function NavBar() {
  return (
    <nav className="sticky top-0 z-50 border-b border-colosseum-surface-light bg-colosseum-bg/90 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-xl font-bold tracking-wider text-blood">
            HUNGERNADS
          </span>
          <span className="hidden text-xs text-gray-600 sm:inline">
            {"// AI COLOSSEUM"}
          </span>
        </Link>
        <div className="flex items-center gap-1">
          <Link href="/" className="nav-link">
            Home
          </Link>
          <Link href="/battle/demo" className="nav-link">
            Battles
          </Link>
          <Link href="/agent/demo" className="nav-link">
            Agents
          </Link>
          <div className="ml-2 border-l border-colosseum-surface-light pl-3">
            <TokenInfo />
          </div>
          <div className="ml-2 border-l border-colosseum-surface-light pl-3">
            <WalletConnect />
          </div>
        </div>
      </div>
    </nav>
  );
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-colosseum-bg font-mono text-gray-200 antialiased">
        <Providers>
          <NavBar />
          <main className="mx-auto max-w-7xl px-4 py-8">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
