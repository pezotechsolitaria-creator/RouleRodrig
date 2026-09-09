"use client";

import { useState } from "react";
import { CalendarCheck } from "lucide-react";
import type { RecommendedPlace } from "@/lib/defaults";
import PlaceBookingModal from "@/components/PlaceBookingModal";

/**
 * The booking control on an experience's OWN page.
 *
 * PlaceBookingModal is an overlay: it takes an onClose and expects something
 * to have opened it. On the listing pages that something is a card. A detail
 * page has no card — it IS the place — so this is the smallest client island
 * that can hold the open/closed state, and every rule about capacity, time
 * slots, deposits and live availability stays inside the modal where the rest
 * of the site already relies on it.
 */
export default function PlaceBookingButton({
  place,
  whatsapp,
  label,
}: {
  place: RecommendedPlace;
  whatsapp?: string;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-[52px] items-center gap-2 rounded-full bg-yellow px-6 font-syne text-sm font-bold text-dark transition-opacity hover:opacity-90"
      >
        <CalendarCheck size={17} /> {label}
      </button>
      {open && (
        <PlaceBookingModal
          place={place}
          whatsapp={whatsapp}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
