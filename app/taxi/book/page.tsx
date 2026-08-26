import type { Metadata } from "next";
import { SITE_URL } from "@/lib/site";
import AppPageHeader from "@/components/AppPageHeader";
import BookRide from "./BookRide";
import { RIDE_SERVICES, type RideService } from "@/lib/rides/model";
import BookingHeading from "@/app/taxi/book/BookingHeading";

// ── ONE SCREEN FOR TAXI *AND* EVERY TRANSFER ────────────────────────────────
//
// The owner: "DO NOT FORGET TRANSFERS ALSO IS TAXI BUT A VARIANT."
//
// He is right, and it collapses two half-built flows into one. A taxi, an airport
// run, a ferry run, a hotel transfer and a private hire are the same act — a car
// takes somebody from A to B — differing only in whether there is a flight number
// and whether the far end is fixed. /transfers was a separate WhatsApp form for
// the same thing.
//
// So `service` is a variant on ONE booking screen, and ?service=airport just
// preselects it. One flow to maintain, one to test, one for a customer to learn.
export const metadata: Metadata = {
  title: "Book a taxi or transfer in Rodrigues | Roulé Rodrigues",
  description:
    "Book a taxi, airport transfer or ferry transfer in Rodrigues in under a minute. See the fare before you book, pay your driver directly. No account needed.",
  alternates: { canonical: `${SITE_URL}/taxi/book` },
};

export default async function BookRidePage({
  searchParams,
}: {
  searchParams: Promise<{ service?: string }>;
}) {
  const { service } = await searchParams;
  const initial: RideService =
    service && (RIDE_SERVICES as readonly string[]).includes(service)
      ? (service as RideService)
      : "taxi";

  return (
    <>
      {/* `title` would move the world switch onto a second row and take the
          header from 57px to 110px — measured. `showBack` keeps one row; the
          page carries its own heading below. */}
      <AppPageHeader showBack backHref="/taxi" />
      {/* pb-32 was clearance for the floating tab bar. That bar is gone from
          this path (lib/nav-scope.ts), so what is left is the button and the
          notch. 128px -> 40px.

          And min-h-screen is 100vh on a <main> that STARTS at y=57, under the
          sticky header — so the document was 869px on an 812px screen before a
          word went into it. Subtracting the header is the rest of the fix; it
          is the same defect /deliver had. */}
      <main className="min-h-[calc(100vh-3.5rem)] bg-dark px-4 pb-10 pt-3 text-offwhite">
        <div className="mx-auto max-w-lg">
          {/* ── THE REQUIRED CONTRACT, STATED ONCE ──────────────────────
              Not one field on this flow carried a mark, on a form that cannot
              price a ride without both ends of the journey. The mark is only
              honest if something explains it, so it is explained once here
              rather than repeated beside every field.

              A client component because this page is a server one, and these
              two lines were the last English left on the screen after the
              wizard itself was translated. */}
          <BookingHeading />

          <div className="mt-3">
            <BookRide initialService={initial} />
          </div>

          {/* WAS: a three-up "See the fare first / Driver in minutes / No
              account needed" grid above the form (90px), and a footer pair of
              cross-sell links (~41px). Both are removed from the booking path
              on the owner's instruction — the first answers a question the
              visitor stopped asking the moment they tapped Book, and the second
              offers two ways to leave a form they have already started. The way
              back is the header arrow; "follow your ride" belongs on the
              confirmation, which is where somebody actually needs it. */}
        </div>
      </main>
    </>
  );
}
