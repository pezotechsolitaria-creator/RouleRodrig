"use client";

import { useLanguage } from "@/context/LanguageContext";
import { RIDES_COPY } from "@/lib/rides/copy.i18n";

/**
 * The heading and the required-field contract, above a booking wizard.
 *
 * It exists because /taxi/book and /transfers are SERVER components and the
 * language lives in a client context. Their headings were the last English left
 * on those screens after the wizard itself was translated — "Book a ride * =
 * required, or we cannot price your ride." sitting on top of a form that had
 * just answered in French. A visitor cannot tell which half of a page is
 * translated and which is not; they only see that it is broken.
 *
 * The asterisk is aria-hidden and the note carries the meaning, because a
 * screen reader announcing "star equals required" is noise — the fields
 * themselves are marked aria-required by PlacePicker and the inputs.
 */
export default function BookingHeading({
  variant = "ride",
}: {
  /** "transfer" names the airport service instead of the generic booking. */
  variant?: "ride" | "transfer";
}) {
  const { language } = useLanguage();
  const c = RIDES_COPY[language].book;
  const heading =
    variant === "transfer" ? c.services.airport.label : c.chrome.heading;

  return (
    <>
      <h1 className="font-syne text-base font-extrabold leading-tight text-offwhite md:text-3xl">
        {heading}
      </h1>
      <p className="mt-1.5 font-dm text-[13px] leading-snug text-[#B0B0B0]">
        <span className="font-bold text-red-400" aria-hidden="true">
          *
        </span>{" "}
        {c.chrome.requiredNote}
      </p>
    </>
  );
}
