"use client";

import { useEffect, useRef } from "react";
import { trackProductViewed } from "@/lib/marketplace/analytics";

// Renders nothing; reports that a product page was seen.
//
// `hasImage` is carried deliberately: "viewed a lot, bought never, has no
// photograph" is a specific, actionable finding about a specific product, and
// it is the finding this catalogue most needs — the honest fix for a
// marketplace with two photographs in it is photographs, and this is how the
// owner learns which ones to take first.
export default function ProductAnalytics(props: {
  productId: string;
  productName: string;
  storeId: string;
  storeName: string;
  price: number;
  inStock: boolean;
  hasImage: boolean;
  category: string | null;
}) {
  const sent = useRef("");
  useEffect(() => {
    if (sent.current === props.productId) return;
    sent.current = props.productId;
    trackProductViewed(props);
  }, [props]);
  return null;
}
