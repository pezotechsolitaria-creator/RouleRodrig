import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySession, COOKIE_NAME } from "@/lib/auth";
import RidesDesk from "./RidesDesk";

// The taxi & transfer desk. Replaces nothing, because nothing existed: taxi and
// transfer were a WhatsApp redirect plus a row in lead_events that recorded a tap
// and no customer, pickup or status. This is the first screen on which a ride is
// a thing that can be dispatched, assigned, tracked and completed.
export const dynamic = "force-dynamic";
export const metadata = { title: "Taxi & transfers — Roulé Rodrigues" };

export default async function AdminRidesPage() {
  const cookieStore = await cookies();
  if (!verifySession(cookieStore.get(COOKIE_NAME)?.value)) redirect("/admin/login");
  return <RidesDesk />;
}
