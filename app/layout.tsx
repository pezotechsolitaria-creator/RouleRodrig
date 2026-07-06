import type { Metadata, Viewport } from "next";
import { Syne, Bebas_Neue, DM_Sans } from "next/font/google";
import "./globals.css";
import { LanguageProvider } from "@/context/LanguageContext";
import { CurrencyProvider } from "@/context/CurrencyContext";
import { FavoritesProvider } from "@/context/FavoritesContext";
import LanguagePicker from "@/components/LanguagePicker";
import FavoritesPanel from "@/components/FavoritesPanel";
import ReturnWelcome from "@/components/ReturnWelcome";
import AppSplash from "@/components/AppSplash";
import PWARegister from "@/components/PWARegister";
import RefCapture from "@/components/RefCapture";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { SITE_URL } from "@/lib/site";

const syne = Syne({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-syne-var",
  display: "swap",
});

const bebasNeue = Bebas_Neue({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-bebas-var",
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-dm-var",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  alternates: { canonical: "/" },
  title: "Roule Rodrigues | Premium Scooter Rentals on Rodrigues Island",
  description:
    "Explore Rodrigues Island on two wheels. Premium Suzuki Burgman 125 and Avenis 125 scooter rentals — helmet included, flexible hours, local support.",
  keywords: [
    "scooter rental",
    "Rodrigues Island",
    "Mauritius",
    "Suzuki Burgman",
    "Avenis 125",
    "moto location Rodrigues",
  ],
  openGraph: {
    title: "Roule Rodrigues | Premium Scooter Rentals",
    description:
      "Discover Rodrigues on your own terms. Premium scooter rentals with helmet included, flexible hours, and local support.",
    type: "website",
    locale: "en_US",
    siteName: "Roule Rodrigues",
    images: [
      {
        url: "/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Roule Rodrigues — scooter at golden hour on Rodrigues Island",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Roule Rodrigues | Premium Scooter Rentals",
    description:
      "Discover Rodrigues on your own terms. Premium scooter rentals — helmet included, flexible hours, local support.",
    images: ["/og-image.jpg"],
  },
  icons: {
    icon: "/icon-192.png",
    apple: "/apple-icon.png",
  },
  appleWebApp: {
    capable: true,
    title: "Roule Rodrigues",
    statusBarStyle: "black-translucent",
  },
  // Google Search Console ownership verification (keep this in place permanently)
  verification: {
    google:
      process.env.NEXT_PUBLIC_GOOGLE_VERIFICATION ||
      "4bcg4HagAw5bOiZ3ktjkB3hxi1cbO2-MJ53krSzv2Pg",
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${syne.variable} ${bebasNeue.variable} ${dmSans.variable} antialiased`}
    >
      <body className="bg-dark text-offwhite font-dm overflow-x-hidden">
        <LanguageProvider>
          <CurrencyProvider>
            <FavoritesProvider>
              <AppSplash />
              <LanguagePicker />
              <RefCapture />
              {children}
              <ReturnWelcome />
              <FavoritesPanel />
              <PWARegister />
            </FavoritesProvider>
          </CurrencyProvider>
        </LanguageProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
