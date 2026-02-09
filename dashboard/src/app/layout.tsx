import type { Metadata } from "next";
import { Cinzel } from "next/font/google";
import "./globals.css";
import Providers from "@/components/Providers";
import Navbar from "@/components/nav/Navbar";
import BottomTabs from "@/components/nav/BottomTabs";

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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`dark ${cinzel.variable}`}>
      <body className="min-h-screen bg-colosseum-bg font-mono text-[#d4c5a0] antialiased">
        <Providers>
          <Navbar />
          {/* pb-20 on mobile to account for fixed bottom tab bar */}
          <main className="mx-auto max-w-7xl px-4 py-8 pb-24 md:pb-8">
            {children}
          </main>
          <BottomTabs />
        </Providers>
      </body>
    </html>
  );
}
