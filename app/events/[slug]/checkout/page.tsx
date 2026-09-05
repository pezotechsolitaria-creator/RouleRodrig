import { redirect } from "next/navigation";

// Events are off the public site (see app/events/page.tsx). A checkout for a
// product that is no longer sold goes home, not to a half-working form.
export default function EventCheckoutGone() {
  redirect("/");
}
