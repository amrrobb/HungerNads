import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Cinzel } from "next/font/google";
import "./globals.css";
import Providers from "@/components/Providers";
import WalletConnect from "@/components/WalletConnect";
import TokenInfo from "@/components/TokenInfo";

const cinzel = Cinzel({
  subsets: ["latin"],
  weight: ["700", "900"],
  variable: "--font-cinzel",
});

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
          <Image
            src="/logo.png"
            alt="HUNGERNADS"
            width={36}
            height={36}
            className="drop-shadow-[0_0_6px_rgba(245,158,11,0.3)]"
          />
          <span className="font-cinzel text-xl font-black tracking-widest text-gold">
            HUNGERNADS
          </span>
          <span className="hidden text-[10px] font-medium uppercase tracking-wider text-gold-dark/60 sm:inline">
            AI Colosseum
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
    <html lang="en" className={`dark ${cinzel.variable}`}>
      <body className="min-h-screen bg-colosseum-bg font-mono text-[#d4c5a0] antialiased">
        <Providers>
          <NavBar />
          <main className="mx-auto max-w-7xl px-4 py-8">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
