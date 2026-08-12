import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySession, COOKIE_NAME } from "@/lib/auth";
import { getContent } from "@/lib/content";
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

  const content = await getContent();
  return <AdminDashboard initialContent={content} />;
}
