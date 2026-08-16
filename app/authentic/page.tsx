import { redirect } from "next/navigation";

// Authentic is the HOMEPAGE — see the note on WORLD_PAGE in lib/worlds.ts.
//
// This route existed for about an hour and rendered a second copy of the
// curated composition, which is exactly the duplication the owner objected to.
// It stays as a redirect rather than a 404 so anything already shared or
// bookmarked still lands somewhere correct. Same pattern as /v2.
export default function AuthenticPage() {
  redirect("/");
}
