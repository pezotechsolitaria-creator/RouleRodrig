import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { verifySession, COOKIE_NAME } from "@/lib/auth";
import { getContentWithStatus } from "@/lib/content";
import AvailabilityBlocks from "./AvailabilityBlocks";

// ── THE FIX FOR "12 SEPTEMBER SHOWS FREE BUT IT IS TAKEN" ───────────────────
//
// Investigating that report found the availability engine was not the problem.
// /api/availability, the guard in /api/bookings and isVehicleFree() all read
// live rows on every request — there is no cache to go stale, and no race
// between them worth the name.
//
// What was missing was an entrance. All three read one table, `bookings`, so
// the only thing that could make a date unavailable was a booking made THROUGH
// THE SITE. A scooter lent to a friend, taken for a service, or rented over the
// counter stayed on sale, because the owner had nowhere to write it down.
//
// This page is that entrance, and it is the whole feature.

export const dynamic = "force-dynamic";

export const metadata = { title: "Availability — Roule Rodrigues" };

export default async function AdminAvailabilityPage() {
  const jar = await cookies();
  if (!verifySession(jar.get(COOKIE_NAME)?.value)) redirect("/admin/login");

  // Uncached on purpose: this seeds an editor that saves back. getContent() is
  // cached across requests for the public site — editing a stale copy of a
  // 148,807-byte blob and saving it would silently revert the owner's work.
  const content = (await getContentWithStatus()).content;
  // The same fleet the booking form offers, so the ids match what `bookings`
  // and the availability reads compare against. A vehicle missing from here
  // could never be blocked.
  const vehicles = content.fleet
    .filter((f) => f.id && f.name)
    .map((f) => ({ id: f.id, name: f.name }));

  return (
    <main className="min-h-screen bg-dark px-5 py-8 text-offwhite">
      <div className="mx-auto max-w-2xl">
        <Link
          href="/admin"
          className="inline-flex min-h-11 items-center gap-2 font-dm text-sm text-muted transition-colors hover:text-yellow"
        >
          <ArrowLeft size={15} /> Command centre
        </Link>

        <h1 className="mt-3 font-syne text-2xl font-extrabold">Availability</h1>
        <p className="mt-1 font-dm text-sm text-muted">
          The website offers every vehicle for every date it has no booking for.
          This is where you tell it about the ones that left another way.
        </p>

        <div className="mt-7">
          <AvailabilityBlocks vehicles={vehicles} />
        </div>
      </div>
    </main>
  );
}
