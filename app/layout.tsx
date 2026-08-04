import type { Metadata, Viewport } from "next";
import { Syne, Bebas_Neue, DM_Sans } from "next/font/google";
import "./globals.css";
import { LanguageProvider } from "@/context/LanguageContext";
import { CurrencyProvider } from "@/context/CurrencyContext";
import { FavoritesProvider } from "@/context/FavoritesContext";
import { CartProvider } from "@/lib/cart/CartContext";
import LanguagePicker from "@/components/LanguagePicker";
import FavoritesPanel from "@/components/FavoritesPanel";
import ReturnWelcome from "@/components/ReturnWelcome";
import PWARegister from "@/components/PWARegister";
import RefCapture from "@/components/RefCapture";
import BottomNav from "@/components/BottomNav";
import GlobalTiRoule from "@/components/GlobalTiRoule";
import { getContent } from "@/lib/content";
import { priceNumber } from "@/lib/site-data";
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
  // 56 chars / 159 — the old pair was 67/186 and Google truncated BOTH, so the
  // half that got cut never reached anyone.
  //
  // The old description named only scooters, cars and restaurants. That's why
  // Google's AI Overview calls this "une plateforme de location de scooters":
  // it can only describe what we tell it, and we never mentioned the trip
  // planner, the island guide or the food concierge anywhere it could read.
  // Everything claimed here is real and reachable from the homepage hub.
  title: "Roule Rodrigues | Scooter & Car Rental, Rodrigues Island",
  description:
    "Scooter and car rental in Rodrigues from Rs 599/day, no minimum. Plus a free island guide, trip planner and WhatsApp food concierge. Booked direct with locals.",
  keywords: [
    "scooter rental Rodrigues",
    "car rental Rodrigues",
    "location scooter Rodrigues",
    "location voiture Rodrigues",
    "Rodrigues Island travel guide",
    "things to do in Rodrigues",
    "Rodrigues Island",
    "Mauritius",
  ],
  openGraph: {
    title: "Roule Rodrigues | Vehicle Rentals & Island Experiences",
    description:
      "Discover Rodrigues on your own terms — scooters, cars, restaurants, activities and local transport. Flexible hours and local support.",
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
    title: "Roule Rodrigues | Vehicle Rentals & Island Experiences",
    description:
      "Discover Rodrigues on your own terms — scooters, cars, restaurants, activities and local transport. Flexible hours, local support.",
    images: ["/og-image.jpg"],
  },
  // Explicit icon set so Google shows the Roule Rodrigues logo beside the
  // search result, not a generic globe. app/favicon.ico was the default Next.js
  // "N" (25931 bytes) — now regenerated from the real logo at 16/32/48px. The
  // .ico is listed first because Google's favicon crawler probes /favicon.ico
  // before reading <link>. icon-192/512 cover higher-DPI and PWA use.
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: "/apple-icon.png",
    shortcut: "/favicon.ico",
  },
  appleWebApp: {
    capable: true,
    title: "Roule Rodrigues",
    statusBarStyle: "black-translucent",
  },
  // Search Console ownership is verified by DNS TXT record on roulerodrig.com
  // (a Domain property, which covers www, non-www, http, https and every
  // subdomain at once). The hardcoded meta tag that used to live here belonged
  // to a Google account that isn't the owner's — it's what made the earlier
  // verification attempt fail. Removed rather than left as a decoy.
  //
  // Only set NEXT_PUBLIC_GOOGLE_VERIFICATION if a URL-prefix property is ever
  // needed alongside the DNS one; leave it unset otherwise.
  ...(process.env.NEXT_PUBLIC_GOOGLE_VERIFICATION
    ? { verification: { google: process.env.NEXT_PUBLIC_GOOGLE_VERIFICATION } }
    : {}),
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
};

// iOS launch images (apple-touch-startup-image) — dark splash with the logo so
// an installed iPhone PWA never shows a blank/black launch screen. Generated for
// the common iPhone portrait resolutions.
const IOS_SPLASH: { m: string; h: string }[] = [
  { m: "(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)", h: "/splash/apple-splash-1290-2796.png" },
  { m: "(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)", h: "/splash/apple-splash-1179-2556.png" },
  { m: "(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)", h: "/splash/apple-splash-1284-2778.png" },
  { m: "(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)", h: "/splash/apple-splash-1170-2532.png" },
  { m: "(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)", h: "/splash/apple-splash-1242-2688.png" },
  { m: "(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)", h: "/splash/apple-splash-1125-2436.png" },
  { m: "(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)", h: "/splash/apple-splash-828-1792.png" },
  { m: "(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)", h: "/splash/apple-splash-750-1334.png" },
  { m: "(device-width: 360px) and (device-height: 780px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)", h: "/splash/apple-splash-1080-2340.png" },
];

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Content for the site-wide Ti Roulé (getContent is cookie-free + ISR-safe and
  // never throws — it falls back to defaults — so it's safe in the root layout).
  const content = await getContent();
  const scooterPrices = content.fleet
    .filter((f) => (f.category ?? "scooter") === "scooter")
    .map((f) => priceNumber(f.price))
    .filter((n): n is number => n != null && n > 0);
  const scooterDailyMur = scooterPrices.length ? Math.min(...scooterPrices) : undefined;
  const tiData = {
    beaches: content.mapLocations.filter((l) => l.category === "beach").slice(0, 3).map((l) => ({ name: l.name, nameFr: l.nameFr, nameCr: l.nameCr })),
    viewpoints: content.mapLocations.filter((l) => l.category === "viewpoint").slice(0, 3).map((l) => ({ name: l.name, nameFr: l.nameFr, nameCr: l.nameCr })),
  };

  return (
    <html
      lang="en"
      className={`${syne.variable} ${bebasNeue.variable} ${dmSans.variable} antialiased`}
      // LANGUAGE: auto-detected from navigator.language before React mounts,
      // written to the same localStorage key LanguageContext reads, so the app
      // boots straight into the visitor's language. The full-screen picker used
      // to block here instead — PageSpeed proved it: Lighthouse's screenshot of
      // the homepage was the "CHOOSE YOUR LANGUAGE" wall, not the site, because
      // that wall WAS the Largest Contentful Paint. Every first-time visitor and
      // every crawler met 1.8s of splash and then a decision before seeing a
      // single scooter. No serious travel site does this — Booking and Airbnb
      // detect and offer a switcher. The Navbar switcher (LANG_CYCLE) still
      // changes language any time, so nothing is lost.
      // To bring the wall back: restore `revealLang()` setting data-show-lang.
      //
      // The splash gate below is an inline script that runs BEFORE React
      // hydrates and stamps data-splash / data-show-lang straight onto <html>
      // (it has to — waiting for React would flash the unstyled page). React
      // then sees attributes the server never rendered and logs a hydration
      // mismatch on every single page load. The script is correct; the warning
      // is noise, and noise in the console is how real errors get missed.
      // This is the documented escape hatch for exactly this pattern, and it
      // only silences <html>'s own attributes — nothing inside it.
      suppressHydrationWarning
    >
      <body className="bg-dark text-offwhite font-dm overflow-x-hidden pb-16 md:pb-0">
        {/* iOS PWA launch images (hoisted to <head> by React) */}
        {IOS_SPLASH.map((s) => (
          <link key={s.h} rel="apple-touch-startup-image" media={s.m} href={s.h} />
        ))}
        {/* ── Installed-app splash ─────────────────────────────────────
            Gate script runs before first paint: shows the splash only when
            launched as an installed app (Android standalone / iOS A2HS),
            once per session, never for reduced-motion users — then removes
            the overlay from the DOM after the CSS animation finishes.     */}
        {/* Capture the Android install event before React loads so the
            "Install" button always has it available (Chrome fires it early). */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){window.__rrInstallEvent=null;window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__rrInstallEvent=e;window.dispatchEvent(new Event('rr:installable'));});window.addEventListener('appinstalled',function(){window.__rrInstallEvent=null;window.dispatchEvent(new Event('rr:installed'));});})();`,
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var d=document.documentElement;var lang=null;try{lang=localStorage.getItem('rr_language');}catch(e){}var hasLang=lang==='en'||lang==='fr'||lang==='cr';if(!hasLang){var nl=(navigator.language||'').toLowerCase();try{localStorage.setItem('rr_language',nl.indexOf('fr')===0?'fr':'en');}catch(e){}}var sa=window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;var force=location.search.indexOf('splash=1')>-1;var seen=false;try{seen=localStorage.getItem('rr-splash-seen')==='1';}catch(e){}var ss=false;try{ss=sessionStorage.getItem('rr-splash-ses')==='1';}catch(e){}var showSplash=force||(!ss&&(sa||!seen));if(showSplash&&!force){try{localStorage.setItem('rr-splash-seen','1');sessionStorage.setItem('rr-splash-ses','1');}catch(e){}}if(showSplash){d.setAttribute('data-splash','on');var pv=function(){try{document.querySelectorAll('video').forEach(function(v){try{if(!v.paused)v.pause();}catch(e){}});}catch(e){}};var iv=setInterval(pv,180);pv();var done=function(){clearInterval(iv);var el=document.getElementById('rr-splash');if(el)el.remove();d.removeAttribute('data-splash');try{document.querySelectorAll('video').forEach(function(v){if(v.autoplay||v.hasAttribute('autoplay')){try{var p=v.play();if(p&&p.catch)p.catch(function(){});}catch(e){}}});}catch(e){}};setTimeout(done,1800);document.addEventListener('DOMContentLoaded',function(){var el=document.getElementById('rr-splash');if(el)el.addEventListener('click',function(){el.classList.add('rr-skip');setTimeout(done,420);},{once:true});});}}catch(e){}})();`,
          }}
        />
        <div id="rr-splash" aria-hidden="true">
          <svg className="rr-sp-rings" viewBox="0 0 600 600" fill="none">
            {[70, 130, 190, 250, 310, 370].map((r) => (
              <ellipse key={r} cx="300" cy="300" rx={r} ry={r * 0.82} stroke="#F5C842" strokeWidth="1" />
            ))}
          </svg>
          <div className="rr-sp-particles" aria-hidden="true">
            <i /><i /><i /><i /><i /><i /><i /><i /><i />
          </div>
          <div className="rr-sp-icon-wrap">
            <span className="rr-sp-burst" />
            <span className="rr-sp-glow" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="rr-sp-icon" src="/icon-192.png" alt="" width={104} height={104} />
            <span className="rr-sp-shine" />
          </div>
          <p className="rr-sp-name">
            <span>Roule</span>
            <em>Rodrigues</em>
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
          <div className="rr-sp-ocean" aria-hidden="true">
            <svg className="rr-sp-wave-a" viewBox="0 0 2880 60" preserveAspectRatio="none">
              <path d="M0,34 C240,14 480,54 720,34 C960,14 1200,54 1440,34 C1680,14 1920,54 2160,34 C2400,14 2640,54 2880,34" fill="none" stroke="#F5C842" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
            <svg className="rr-sp-wave-b" viewBox="0 0 2880 60" preserveAspectRatio="none">
              <path d="M0,30 C240,50 480,10 720,30 C960,50 1200,10 1440,30 C1680,50 1920,10 2160,30 C2400,50 2640,10 2880,30" fill="none" stroke="#F5C842" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
          <span className="rr-sp-bar"><span /></span>
          <span className="rr-sp-skip">TAP TO SKIP</span>
        </div>

        <LanguageProvider>
          <CurrencyProvider>
            <FavoritesProvider>
            <CartProvider>
              <LanguagePicker />
              <RefCapture />
              {children}
              <ReturnWelcome />
              <FavoritesPanel />
              <BottomNav />
              <GlobalTiRoule
                image={content.branding.mascotImage}
                poses={content.branding.mascotPoses}
                whatsapp={content.contact.whatsappNumbers?.[0]?.number || content.social.whatsapp || content.contact.phone}
                scooterDailyMur={scooterDailyMur}
                data={tiData}
              />
              <PWARegister />
            </CartProvider>
            </FavoritesProvider>
          </CurrencyProvider>
        </LanguageProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
