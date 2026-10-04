import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySession, COOKIE_NAME } from "@/lib/auth";
import { getContentWithStatus } from "@/lib/content";
import AdminDashboard from "../AdminDashboard";

// The content studio — the original admin monolith, unchanged in capability.
//
// It used to BE /admin, which made the platform's front door a content form.
// /admin is now the Command Center (what is happening, what needs a decision),
// and everything editorial lives here: homepage, tiles, fleet, Stay·Eat·Do,
// bookings, FAQ, branding — all 80+ sections, with their own navigation.
//
// Deep links work: /admin/content#bookings opens straight onto that section.
export default async function AdminContentPage() {
  const cookieStore = await cookies();
  if (!verifySession(cookieStore.get(COOKIE_NAME)?.value)) redirect("/admin/login");

  // Uncached on purpose: this seeds an editor that saves back. getContent() is
  // cached across requests for the public site — editing a stale copy of a
  // 148,807-byte blob and saving it would silently revert the owner's work.
  //
  // The version travels with it (architecture review 2026-09-30, item 4): the
  // studio sends it back on Save, and the route refuses with 409 if another
  // tab, /admin/legal or a history restore has written the row since.
  const { content, updatedAt } = await getContentWithStatus();
  return <AdminDashboard initialContent={content} initialVersion={updatedAt} />;
}
