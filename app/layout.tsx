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
  title: "Roule Rodrigues | Vehicle Rentals & Island Experiences on Rodrigues",
  description:
    "Explore Rodrigues Island your way — rent scooters and cars, and discover the best restaurants, activities and local transport. Flexible hours, local support, helmet included on scooters.",
  keywords: [
    "scooter rental Rodrigues",
    "car rental Rodrigues",
    "Rodrigues Island",
    "Mauritius",
    "vehicle rental Rodrigues",
    "location voiture Rodrigues",
    "moto location Rodrigues",
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
            __html: `(function(){try{var d=document.documentElement;var lang=null;try{lang=localStorage.getItem('rr_language');}catch(e){}var hasLang=lang==='en'||lang==='fr'||lang==='cr';var sa=window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;var force=location.search.indexOf('splash=1')>-1;var seen=false;try{seen=localStorage.getItem('rr-splash-seen')==='1';}catch(e){}var ss=false;try{ss=sessionStorage.getItem('rr-splash-ses')==='1';}catch(e){}var showSplash=force||(!ss&&(sa||!seen));if(showSplash&&!force){try{localStorage.setItem('rr-splash-seen','1');sessionStorage.setItem('rr-splash-ses','1');}catch(e){}}var revealLang=function(){if(!hasLang)d.setAttribute('data-show-lang','1');};if(showSplash){d.setAttribute('data-splash','on');var pv=function(){try{document.querySelectorAll('video').forEach(function(v){try{if(!v.paused)v.pause();}catch(e){}});}catch(e){}};var iv=setInterval(pv,180);pv();var done=function(){clearInterval(iv);var el=document.getElementById('rr-splash');if(el)el.remove();d.removeAttribute('data-splash');revealLang();try{document.querySelectorAll('video').forEach(function(v){if(v.autoplay||v.hasAttribute('autoplay')){try{var p=v.play();if(p&&p.catch)p.catch(function(){});}catch(e){}}});}catch(e){}};setTimeout(done,3000);document.addEventListener('DOMContentLoaded',function(){var el=document.getElementById('rr-splash');if(el)el.addEventListener('click',function(){el.classList.add('rr-skip');setTimeout(done,420);},{once:true});});}else{revealLang();}}catch(e){}})();`,
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
