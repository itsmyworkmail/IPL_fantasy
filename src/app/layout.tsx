import type { Metadata, Viewport } from "next";
import { Manrope, Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/AuthProvider";
import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700", "800"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "CricTrack — IPL Fantasy Points Tracker",
  description:
    "Premium real-time IPL fantasy cricket points tracker. Track player stats, manage your squad, and compete in private contests with friends.",
  keywords: ["IPL", "fantasy", "cricket", "points", "tracker", "live"],
  /**
   * iOS PWA: "Add to Home Screen" behaviour.
   * apple-icon.tsx handles the <link rel="apple-touch-icon"> automatically.
   * These meta tags control how the app looks once launched from the home screen.
   */
  appleWebApp: {
    capable: true,
    title: "CricTrack",
    statusBarStyle: "black-translucent",
  },
  /** Prevent iOS from auto-linking phone numbers in the UI */
  formatDetection: { telephone: false },
};

/**
 * Viewport export — keeps mobile browsers at device width after OAuth redirects,
 * and sets the status bar / browser chrome colour to match the app theme.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  /** Colours the Android Chrome URL bar / status bar to match the dark theme */
  themeColor: "#080e1a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${manrope.variable} ${inter.variable} dark`}
    >
      <head>
        <link
          rel="icon"
          href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🏏</text></svg>"
        />
      </head>
      <body className="min-h-screen bg-surface text-on-surface antialiased">
        <AuthProvider>
          {children}
        </AuthProvider>
        {/* Registers /sw.js in production — no-op in dev to avoid HMR conflicts */}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
