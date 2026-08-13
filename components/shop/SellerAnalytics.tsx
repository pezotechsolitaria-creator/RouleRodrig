"use client";

import { useEffect, useRef } from "react";
import { trackSellerViewed } from "@/lib/marketplace/analytics";

// Renders nothing; reports that a seller's storefront was opened. Which shops
// buyers actually look at — as opposed to which shops appear in a grid — is
// what tells the owner whether the seller layer is earning its place.
export default function SellerAnalytics({
  storeId, storeName, productCount,
}: {
  storeId: string; storeName: string; productCount: number;
}) {
  const sent = useRef("");
  useEffect(() => {
    if (sent.current === storeId) return;
    sent.current = storeId;
    trackSellerViewed({ storeId, storeName, productCount });
  }, [storeId, storeName, productCount]);
  return null;
}
