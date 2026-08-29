import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Clock } from "lucide-react";
import { getContent } from "@/lib/content";
import { SITE_URL } from "@/lib/site";
import { BLOG_POSTS, getPost } from "@/lib/blog";
import { blogPostingLd, breadcrumbLd } from "@/lib/schema";
import JsonLd from "@/components/JsonLd";
import Navbar from "@/components/Navbar";
import ScrollProgress from "@/components/ScrollProgress";
import AskTiRouleButton from "@/components/AskTiRouleButton";

export const revalidate = 3600;

// Pre-render every post at build time.
export function generateStaticParams() {
  return BLOG_POSTS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) return { title: "Article not found | Roule Rodrigues", robots: { index: false, follow: false } };
  const url = `${SITE_URL}/blog/${post.slug}`;
  return {
    title: post.metaTitle,
    description: post.description,
    alternates: {
      canonical: url,
      // Only when a real French page exists — and it must annotate us back
      // (a one-way hreflang is silently ignored by Google).
      ...(post.fr
        ? {
            languages: {
              "en": url,
              "fr": `${SITE_URL}${post.fr}`,
              "x-default": url,
            },
          }
        : {}),
    },
    openGraph: {
      title: post.metaTitle,
      description: post.description,
      url,
      type: "article",
      publishedTime: post.published,
      modifiedTime: post.updated,
      images: [`${SITE_URL}/og-image.jpg`],
    },
    twitter: { card: "summary_large_image", title: post.metaTitle, description: post.description },
  };
}

const fmt = (iso: string) => {
  try {
    return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  } catch {
    return iso;
  }
};

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();
  const content = await getContent();
  const businessWhatsApp =
    content.social.whatsapp ||
    content.contact.whatsappNumbers?.[0]?.number ||
    content.contact.phone ||
    "";

  return (
    <>
      <ScrollProgress />
      <JsonLd
        data={[
          blogPostingLd({
            slug: post.slug,
            title: post.title,
            description: post.description,
            published: post.published,
            updated: post.updated,
          }),
          breadcrumbLd([
            { name: "Home", url: SITE_URL },
            { name: "Blog", url: `${SITE_URL}/blog` },
            { name: post.title, url: `${SITE_URL}/blog/${post.slug}` },
          ]),
          // FAQPage from the sections whose headings literally ARE questions,
          // with the section's own visible paragraphs as the answer — the
          // markup can never claim a Q&A the page does not render, which is
          // the honesty rule the browse pages' FAQ blocks follow. Emitted
          // only when a post has question sections at all; Google has retired
          // FAQ rich results for ordinary sites, so this exists for Bing and
          // for answer engines, both of which still read it.
          ...(() => {
            const qs = post.sections.filter((s) => s.heading.trim().endsWith("?"));
            return qs.length
              ? [
                  {
                    "@context": "https://schema.org",
                    "@type": "FAQPage",
                    "@id": `${SITE_URL}/blog/${post.slug}#faq`,
                    mainEntity: qs.map((s) => ({
                      "@type": "Question",
                      name: s.heading.trim(),
                      acceptedAnswer: {
                        "@type": "Answer",
                        text: s.paragraphs.join(" "),
                      },
                    })),
                  },
                ]
              : [];
          })(),
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
        <header className="border-b border-dark-border bg-gradient-to-b from-yellow/[0.06] to-transparent px-5 py-16 md:py-20">
          <div className="mx-auto max-w-2xl">
            <Link href="/blog" className="font-bebas text-yellow text-xs tracking-[0.3em] hover:underline">
              ← TRAVEL BLOG
            </Link>
            <h1 className="mt-3 font-syne text-3xl md:text-4xl font-extrabold text-offwhite leading-tight">
              {post.title}
            </h1>
            <p className="mt-4 flex items-center gap-3 font-dm text-xs text-muted">
              <span className="flex items-center gap-1.5">
                <Clock size={13} className="text-yellow/70" /> {post.readMinutes} min read
              </span>
              <span aria-hidden="true">·</span>
              <span>Updated {fmt(post.updated)}</span>
            </p>
          </div>
        </header>

        <article className="mx-auto max-w-2xl px-5 py-12">
          <p className="font-dm text-lg text-offwhite/90 leading-relaxed">{post.intro}</p>

          {post.sections.map((s) => (
            <section key={s.heading} className="mt-10">
              <h2 className="font-syne text-xl md:text-2xl font-bold text-offwhite">{s.heading}</h2>
              {s.paragraphs.map((para, i) => (
                <p key={i} className="mt-3 font-dm text-muted leading-relaxed">
                  {para}
                </p>
              ))}
              {/* Comparison tables scroll inside their own container — the
                  article column is 2xl and a 4-column table at phone width
                  must never make the PAGE scroll sideways. */}
              {s.table && (
                <div className="mt-4 overflow-x-auto rounded-lg border border-offwhite/10">
                  <table className="w-full min-w-[560px] border-collapse font-dm text-sm">
                    <thead>
                      <tr className="bg-offwhite/5 text-left">
                        {s.table.headers.map((h) => (
                          <th key={h} className="px-3 py-2 font-semibold text-offwhite">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {s.table.rows.map((row, ri) => (
                        <tr key={ri} className="border-t border-offwhite/10 align-top">
                          {row.map((cell, ci) => (
                            <td key={ci} className="px-3 py-2 text-muted">
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          ))}

          {/* CTA — the article's commercial purpose: continue the journey either
              to booking, or to Ti Roulé for a personalised plan (Google → blog →
              Ti Roulé → booking). */}
          <div className="mt-12 rounded-2xl border border-yellow/20 bg-gradient-to-br from-yellow/[0.08] to-transparent p-6">
            <p className="font-syne text-lg font-bold text-offwhite">Ready to explore Rodrigues?</p>
            <p className="mt-1.5 font-dm text-sm text-muted">
              Rent a scooter or car directly from local owners — or let Ti Roulé, our free island
              guide, build a plan around your dates.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                href="/browse/scooter"
                className="inline-flex items-center gap-2 rounded-full bg-yellow px-6 py-3 font-syne font-bold text-dark text-sm transition-transform hover:scale-[1.03]"
              >
                See scooters &amp; book <ArrowRight size={16} />
              </Link>
              <AskTiRouleButton />
            </div>
          </div>

          <nav className="mt-12 border-t border-dark-border pt-8">
            <p className="font-syne text-sm font-bold text-offwhite">Keep reading</p>
            <ul className="mt-3 space-y-2">
              {post.related.map((r) => (
                <li key={r.href}>
                  <Link
                    href={r.href}
                    className="inline-flex items-center gap-1.5 font-dm text-sm text-yellow/80 hover:text-yellow transition-colors"
                  >
                    {r.label} <ArrowRight size={14} />
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </article>
      </main>
    </>
  );
}
