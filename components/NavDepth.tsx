"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { bumpDepth } from "@/lib/nav/back";

// Counts in-app navigations so a back arrow can tell "go back" from "there is
// nowhere to go back to". See lib/nav/back.ts for why document.referrer cannot
// answer that question.
//
// Mounted once in the root layout beside the other global chrome. Writes one
// number to sessionStorage and renders nothing.
export default function NavDepth() {
  const pathname = usePathname();

  useEffect(() => {
    bumpDepth();
  }, [pathname]);

  return null;
}
