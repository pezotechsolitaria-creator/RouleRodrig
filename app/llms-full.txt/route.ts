import { SITE_URL } from "@/lib/site";
import { buildLlmsFullTxt } from "@/lib/llms-txt";
import { llmsResponse } from "@/lib/llms-data";

// /llms-full.txt — every FAQ the site renders, as plain text, built from the
// same modules the pages render them from (SEO audit 2026-09-29 C8). It
// answered 404 before; the index at /llms.txt links it.

// Hourly, like /llms.txt and the sitemap.
export const revalidate = 3600;

export async function GET() {
  return llmsResponse(SITE_URL, buildLlmsFullTxt);
}
