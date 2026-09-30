import { SITE_URL } from "@/lib/site";
import { buildLlmsTxt } from "@/lib/llms-txt";
import { llmsResponse } from "@/lib/llms-data";

// /llms.txt — generated, not typed (SEO audit 2026-09-29 C8, T20). It replaces
// public/llms.txt, which had to go: a static file at the same path shadows the
// route. The builder is lib/llms-txt.ts; the reads and the never-a-500
// fallback are lib/llms-data.ts.
//
// middleware.ts matches this path and does nothing to it: no redirect entry,
// no auth prefix, so it falls through to NextResponse.next().

// Regenerated hourly, like the sitemap and the content row it reads.
export const revalidate = 3600;

export async function GET() {
  return llmsResponse(SITE_URL, buildLlmsTxt);
}
