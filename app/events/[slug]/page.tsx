import { redirect } from "next/navigation";

// Events are off the public site (see app/events/page.tsx). Old shared links
// land home instead of on a 404; ticket holders' proof lives on
// /orders/track, which is untouched.
export default function EventGone() {
  redirect("/");
}
