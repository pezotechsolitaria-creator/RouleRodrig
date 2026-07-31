"use client";

import { usePathname } from "next/navigation";
import TiRouleGuide from "@/components/TiRouleGuide";

type TiProps = React.ComponentProps<typeof TiRouleGuide>;

// Mounts Ti Roulé once, site-wide, launched from the bottom-nav button (no
// floating orb). Excluded from the admin area and the /v2 alias.
export default function GlobalTiRoule(props: TiProps) {
  const pathname = usePathname() || "/";
  if (pathname.startsWith("/admin") || pathname.startsWith("/v2") || pathname.startsWith("/merchant")) return null;
  return <TiRouleGuide hideFab {...props} />;
}
