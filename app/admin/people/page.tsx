import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySession, COOKIE_NAME } from "@/lib/auth";
import PeopleDesk from "./PeopleDesk";
import type { PersonKind } from "@/lib/admin/people";

export const metadata = { title: "People & Operations — Roule Rodrigues" };

// Reads cookies, so it is dynamic. Correct for an ops desk: this screen must
// never be served from a cache built for somebody else.
export const dynamic = "force-dynamic";

/**
 * People & Operations.
 *
 * The desk for everybody who OPERATES on the platform — the merchants who sell
 * and the partners who deliver. They live in different tables and are the same
 * job: approve, verify, suspend, and be able to say who did it and why.
 *
 * The gate here is belt-and-braces. `middleware.ts` already bounces an
 * unauthenticated request away from /admin, and every mutation this screen
 * makes is re-checked server-side in /api/admin/people through guardAdminApi.
 * Neither of those is a reason to render the page to a stranger.
 */
export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  const cookieStore = await cookies();
  if (!verifySession(cookieStore.get(COOKIE_NAME)?.value)) redirect("/admin/login");

  const { kind } = await searchParams;
  const initialKind: PersonKind = kind === "driver" ? "driver" : "merchant";

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-syne text-xl font-extrabold text-offwhite">People &amp; Operations</h1>
        <p className="mt-1 font-dm text-[13px] text-muted">
          Everybody who trades or delivers on Roulé Rodrigues. Account status,
          verification and what they are doing right now are three separate
          things — and every change made here is recorded.
        </p>
      </div>
      <PeopleDesk initialKind={initialKind} />
    </div>
  );
}
