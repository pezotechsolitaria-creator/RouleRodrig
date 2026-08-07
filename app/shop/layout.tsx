import { CartBar } from "@/components/shop/ShopChrome";

// Shared chrome for the whole /shop segment: the floating CartBar, which
// follows the shopper across directory, storefront and product pages (it hides
// itself on /cart and /checkout).
//
// The <Toaster> that used to live here now lives in app/layout.tsx — it was
// mounted per-segment, so every toast on /checkout, /orders and /manage-booking
// was a silent no-op. One global Toaster serves the whole site; two would
// render duplicate toasts.
export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <CartBar />
    </>
  );
}
