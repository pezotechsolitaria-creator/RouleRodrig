import type { Metadata } from "next";
import { Syne, Bebas_Neue, DM_Sans } from "next/font/google";
import "./globals.css";

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
  title: "Roule Rodrigues | Premium Scooter Rentals on Rodrigues Island",
  description:
    "Explore Rodrigues Island on two wheels. Premium Suzuki Burgman 200 and Avenis 125 scooter rentals — helmet included, flexible hours, 24/7 support.",
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
      "Explore Rodrigues Island on two wheels. Premium scooter rentals with helmet included, flexible hours, and 24/7 support.",
    type: "website",
    locale: "en_US",
    siteName: "Roule Rodrigues",
  },
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
        {children}
      </body>
    </html>
  );
}
