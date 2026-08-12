"use client";

import { usePathname } from "next/navigation";
import { isConsole } from "@/lib/nav-scope";
import TiRouleGuide from "@/components/TiRouleGuide";

type TiProps = React.ComponentProps<typeof TiRouleGuide>;

// Mounts Ti Roulé once, site-wide, launched from the bottom-nav button (no
// floating orb). Excluded from the admin area and the /v2 alias.
export default function GlobalTiRoule(props: TiProps) {
  const pathname = usePathname() || "/";
  // Was its own hardcoded list of three prefixes, so the mascot floated over
  // /driver, /organizer, /partner and /kitchen — every console added after it
  // was written. isConsole() is the shared rule; /v2 stays separate because it
  // is a design sandbox, not a console.
  if (isConsole(pathname) || pathname.startsWith("/v2")) return null;
  return <TiRouleGuide hideFab {...props} />;
}
