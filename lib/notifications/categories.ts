// Notification categories — the PURE half, importable from anywhere.
//
// ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
// These constants lived in lib/notifications/queue.ts, which opens with
// `import "server-only"` and pulls in the service-role Supabase client. The
// admin notifications screen is a CLIENT component and needs only the category
// list and its labels — but importing them dragged the whole server module into
// the browser bundle and failed the production build:
//
//   ./lib/supabase/admin.ts [Client Component Browser]
//   ./lib/notifications/queue.ts [Client Component Browser]
//   ./app/admin/notifications/AdminNotifications.tsx [Client Component Browser]
//
// `server-only` did exactly its job: it refused to be bundled for the client.
// The fix is not to weaken it — it is protecting the service-role key — but to
// separate the data from the machinery. A list of strings has no business
// living behind a server guard.
//
// queue.ts re-exports these, so existing server-side imports keep working.

export const NOTIFICATION_CATEGORIES = [
  "deliveries",
  "rentals",
  "ticketing",
  "payments",
  "bookings",
  // M98 — added once the platform actually had these businesses. Until now the
  // only way to alert a kitchen or a taxi desk was to leave a recipient's
  // categories empty, which means "everything" and gives a cook the same
  // traffic as the owner.
  "food",
  "rides",
  "system",
  "admin",
] as const;

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export function isNotificationCategory(v: unknown): v is NotificationCategory {
  return typeof v === "string" && (NOTIFICATION_CATEGORIES as readonly string[]).includes(v);
}

/** Human labels for the admin UI — the owner picks a business event, not an enum. */
export const CATEGORY_LABEL: Record<NotificationCategory, string> = {
  deliveries: "Deliveries",
  rentals: "Rentals",
  ticketing: "Events & tickets",
  payments: "Payments",
  bookings: "Bookings",
  food: "Kitchen & food orders",
  rides: "Taxi & rides",
  system: "System & errors",
  admin: "Needs my attention",
};
