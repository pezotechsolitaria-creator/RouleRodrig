import AdminShell from "@/components/admin/AdminShell";

export const metadata = { title: "Admin — Roule Rodrigues" };

// One frame for the whole control plane. The shell itself decides which
// routes stay bare (login, and the content studio with its own nav) — that
// choice needs the pathname, which only a client component can read without
// forcing every admin page dynamic.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
