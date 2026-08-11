import type { Metadata } from "next";

// The whole merchant portal is noindex, set once here rather than per page.
//
// robots.txt disallows /admin and /api but says nothing about /merchant, so
// every screen behind this path — sign-in, the dashboard, order lists, payment
// settings — was crawlable. Most of it redirects an anonymous visitor, which is
// not the same as being unindexable: the sign-in page itself renders fine for
// anybody, and a login screen in search results is pure noise that competes
// with the pages meant to rank.
//
// Metadata cascades, so a child that does not set `robots` inherits this. It is
// deliberately NOT a robots.txt Disallow: that would stop crawling but still
// permit a URL to be listed from external links, whereas a noindex on a page
// Google can actually fetch is what removes it from the index.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function MerchantLayout({ children }: { children: React.ReactNode }) {
  return children;
}
