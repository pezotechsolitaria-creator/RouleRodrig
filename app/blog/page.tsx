import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Clock } from "lucide-react";
import { getContent } from "@/lib/content";
import { SITE_URL } from "@/lib/site";
import { BLOG_POSTS } from "@/lib/blog";
import { breadcrumbLd, itemListLd } from "@/lib/schema";
import JsonLd from "@/components/JsonLd";
import Navbar from "@/components/Navbar";

export const revalidate = 3600;

const TITLE = "Rodrigues Island Travel Blog | Roule Rodrigues";
const DESCRIPTION =
  "Honest, local answers to the questions you have before visiting Rodrigues: how many days you need, when to go, how to get around, and what not to miss.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/blog` },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: `${SITE_URL}/blog`,
    type: "website",
    images: [`${SITE_URL}/og-image.jpg`],
  },
};

export default async function BlogIndexPage() {
  const content = await getContent();
  const posts = [...BLOG_POSTS].sort((a, b) => b.published.localeCompare(a.published));

  return (
    <>
      <JsonLd
        data={[
          breadcrumbLd([
            { name: "Home", url: SITE_URL },
            { name: "Blog", url: `${SITE_URL}/blog` },
          ]),
          itemListLd("Rodrigues travel articles", posts.map((p) => ({ name: p.title }))),
        ]}
      />
      <Navbar
        branding={content.branding}
        announcementActive={false}
        showStayEatDo={content.recommended.enabled && content.recommended.items.length > 0}
        showRoutes={content.rideRoutes.length > 0}
        showEvents={content.events.some((e) => e.title)}
      />

      <main className="bg-dark min-h-screen">
        <header className="border-b border-dark-border bg-gradient-to-b from-yellow/[0.06] to-transparent px-5 py-16 md:py-24">
          <div className="mx-auto max-w-3xl">
            <p className="font-bebas text-yellow text-xs tracking-[0.3em]">TRAVEL BLOG</p>
            <h1 className="mt-3 font-syne text-4xl md:text-5xl font-extrabold text-offwhite leading-tight">
              Planning a trip to Rodrigues?
            </h1>
            <p className="mt-4 font-dm text-muted leading-relaxed max-w-2xl">{DESCRIPTION}</p>
          </div>
        </header>

        <div className="mx-auto max-w-3xl px-5 py-14">
          <ul className="space-y-5">
            {posts.map((p) => (
              <li key={p.slug}>
                <Link
                  href={`/blog/${p.slug}`}
                  className="block rounded-2xl border border-dark-border bg-white/[0.02] p-6 transition-colors hover:border-yellow/40"
                >
                  <h2 className="font-syne text-xl md:text-2xl font-bold text-offwhite">{p.title}</h2>
                  <p className="mt-2 font-dm text-muted leading-relaxed">{p.description}</p>
                  <p className="mt-4 flex items-center gap-2 font-dm text-xs text-yellow/80">
                    <Clock size={13} /> {p.readMinutes} min read
                    <ArrowRight size={14} className="ml-1" />
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </main>
    </>
  );
}
