import { Toaster } from "@/components/ui/sonner";
import { CartBar } from "@/components/shop/ShopChrome";

// Shared chrome for the whole /shop segment. Two things every marketplace
// page here needs and none had:
//  - a mounted <Toaster>: AddToCartForm has toasted "Added to cart" since M4,
//    but no Toaster existed on the public pages, so the confirmation never
//    rendered — the "did that even work?" complaint in one line.
//  - the floating CartBar, which follows the shopper across directory,
//    storefront and product pages (it hides itself on /cart and /checkout).
export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <CartBar />
      <Toaster
        position="top-center"
        theme="dark"
        toastOptions={{
          classNames: {
            toast: "bg-dark-card! border-white/10! text-offwhite! font-dm!",
            title: "text-offwhite!",
            description: "text-muted!",
            actionButton: "bg-yellow! text-dark!",
            cancelButton: "bg-white/10! text-offwhite!",
          },
        }}
      />
    </>
  );
}
