"use client";

import { useEffect, useRef } from "react";
import { trackMarketplaceViewed } from "@/lib/marketplace/analytics";

// Renders nothing; reports that the marketplace landing screen was seen, with
// the catalogue size it was seen at. That last part is what makes the number
// readable a year from now — "marketplace_viewed" against a six-product
// catalogue and against a six-hundred-product one are not the same event.
export default function HomeAnalytics({
  productCount, categoryCount, sellerCount,
}: {
  productCount: number; categoryCount: number; sellerCount: number;
}) {
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    trackMarketplaceViewed({ productCount, categoryCount, sellerCount });
  }, [productCount, categoryCount, sellerCount]);
  return null;
}
