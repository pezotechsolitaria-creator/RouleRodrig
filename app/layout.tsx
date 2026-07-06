import type { Metadata, Viewport } from "next";
import { Syne, Bebas_Neue, DM_Sans } from "next/font/google";
import "./globals.css";
import { LanguageProvider } from "@/context/LanguageContext";
import { CurrencyProvider } from "@/context/CurrencyContext";
import { FavoritesProvider } from "@/context/FavoritesContext";
import LanguagePicker from "@/components/LanguagePicker";
import FavoritesPanel from "@/components/FavoritesPanel";
import ReturnWelcome from "@/components/ReturnWelcome";
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
        {/* ── Installed-app splash ─────────────────────────────────────
            Gate script runs before first paint: shows the splash only when
            launched as an installed app (Android standalone / iOS A2HS),
            once per session, never for reduced-motion users — then removes
            the overlay from the DOM after the CSS animation finishes.     */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var d=document.documentElement;var sa=window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;var rm=window.matchMedia('(prefers-reduced-motion: reduce)').matches;if(sa&&!rm&&!sessionStorage.getItem('rr-splash')){sessionStorage.setItem('rr-splash','1');d.setAttribute('data-splash','on');setTimeout(function(){var el=document.getElementById('rr-splash');if(el)el.remove();d.removeAttribute('data-splash');},5300);}}catch(e){}})();`,
          }}
        />
        <div id="rr-splash" aria-hidden="true">
          <svg className="rr-sp-rings" viewBox="0 0 600 600" fill="none">
            {[70, 130, 190, 250, 310, 370].map((r) => (
              <ellipse key={r} cx="300" cy="300" rx={r} ry={r * 0.82} stroke="#F5C842" strokeWidth="1" />
            ))}
          </svg>
          <div className="rr-sp-icon-wrap">
            <span className="rr-sp-glow" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="rr-sp-icon" src="/icon-192.png" alt="" width={104} height={104} />
          </div>
          <p className="rr-sp-name">
            Roule <em>Rodrigues</em>
          </p>
          <p className="rr-sp-tag">EXPLORE THE ISLAND</p>
          <svg className="rr-sp-route" viewBox="0 0 208 24" fill="none">
            <path
              d="M4 18 C 48 6, 80 22, 116 12 S 178 4, 204 10"
              pathLength={300}
              stroke="#F5C842"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <circle cx="204" cy="10" r="3.5" fill="#F5C842" />
          </svg>
          <span className="rr-sp-bar"><span /></span>
        </div>

        <LanguageProvider>
          <CurrencyProvider>
            <FavoritesProvider>
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
