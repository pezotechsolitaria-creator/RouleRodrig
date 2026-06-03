import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySession, COOKIE_NAME } from "@/lib/auth";
import { getContent } from "@/lib/content";
import AdminDashboard from "./AdminDashboard";

export default async function AdminPage() {
  const cookieStore = await cookies();
  const session = cookieStore.get(COOKIE_NAME);

  if (!verifySession(session?.value)) {
    redirect("/admin/login");
  }

  const content = getContent();
  return <AdminDashboard initialContent={content} />;
}
