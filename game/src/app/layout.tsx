import type { Metadata, Viewport } from "next";
import { Press_Start_2P } from "next/font/google";
import "./globals.css";
import { AppProviders } from "@/context/AppProviders";

const pressStart = Press_Start_2P({
  variable: "--font-press-start",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  title: "Deathball",
  description: "Deathball - Every goal... is a scream.",
  icons: {
    icon: "favicon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#0a0a0a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${pressStart.variable} h-full antialiased`}>
      <body className="min-h-full bg-neutral-950">
        {/* Which providers, in what order, and why they are up here rather than in
            a route: see `AppProviders`. */}
        <AppProviders>
          {/* Phone-shaped stage. Full-bleed height everywhere; on desktop it stays a
              centered narrow column so the game always reads as mobile. */}
          <div className="flex h-dvh justify-center sm:py-4">
            <div className="relative flex h-full w-full max-w-[400px] flex-col overflow-hidden bg-neutral-900 sm:rounded-2xl sm:border-4 sm:border-neutral-800 sm:shadow-2xl">
              {children}
            </div>
          </div>
        </AppProviders>
      </body>
    </html>
  );
}
