import type { Metadata } from "next";
import AdminNotifications from "./AdminNotifications";

export const metadata: Metadata = { robots: { index: false, follow: false } };

// Auth is the ADMIN_PASSWORD cookie, checked by the API routes this page calls
// (same pattern as /admin/delivery-zones and /admin/monetization). The page
// itself renders no privileged data — every byte arrives through a guarded
// fetch — so there is nothing here to leak before that check runs.
export default function AdminNotificationsPage() {
  return <AdminNotifications />;
}
