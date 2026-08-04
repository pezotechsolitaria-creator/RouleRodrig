"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Store, Package, ImagePlus, X, Loader2, ArrowRight, ArrowLeft, AlertCircle, CheckCircle2,
} from "lucide-react";
import { toCents } from "@/lib/money";

type Category = { id: string; name: string };

const BUSINESS_CATEGORIES = [
  "Supermarket", "Grocery / Convenience", "Fish & Seafood", "Fruit & Vegetables",
  "Honey Producer", "Spices & Piment", "Bakery", "Restaurant / Snacks",
  "Handicraft & Art", "Souvenirs", "Pharmacy", "Hardware", "Other",
];

type Step = "shop" | "product";
type Phase = "idle" | "submitting" | "error";
const STEP_LABEL: Record<Step, string> = {
  shop: "Step 1 of 2: Set up your shop",
  product: "Step 2 of 2: Add your first product",
};

const inputCls =
  "w-full rounded-xl border border-dark-border bg-dark-card px-4 py-3 font-dm text-sm text-offwhite placeholder:text-muted/50 transition-colors focus:border-yellow focus:outline-none";
const labelCls = "mb-1.5 block font-dm text-xs font-medium text-muted";

// Square image picker with preview — used for both the shop logo and the
// first product photo. Upload itself happens later (after the shop/product
// rows exist, since the storage path needs their id), so this only holds the
// File + a local object-URL preview until final submit. The object URL is
// memoized per-File and explicitly revoked on change/unmount — without this,
// every unrelated keystroke elsewhere in the form re-renders ImagePicker and
// leaks a fresh blob URL.
function ImagePicker({ label, file, onChange, disabled }: {
  label: string; file: File | null; onChange: (f: File | null) => void; disabled?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  return (
    <div>
      <p className={labelCls}>{label}</p>
      {preview ? (
        <div className="relative h-28 w-28 overflow-hidden rounded-2xl border border-white/10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="" className="h-full w-full object-cover" />
          <button
            type="button"
            onClick={() => onChange(null)}
            aria-label="Remove photo"
            className="absolute right-1 top-1 flex h-8 w-8 items-center justify-center rounded-full bg-dark/80 text-offwhite hover:text-red-400"
          >
            <X size={13} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => ref.current?.click()}
          disabled={disabled}
          className="flex h-28 w-28 flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-dark-border text-muted/60 transition-colors hover:border-yellow/50 hover:text-yellow disabled:opacity-50"
        >
          <ImagePlus size={20} />
          <span className="font-dm text-[10px]">Add photo</span>
        </button>
      )}
      <input
        ref={ref}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onChange(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}

async function uploadMedia(file: File, storeId: string, target: "store_logo" | "product_photo", productId?: string) {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("storeId", storeId);
  fd.append("target", target);
  if (productId) fd.append("productId", productId);
  const res = await fetch("/api/merchant/media", { method: "POST", body: fd });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Upload failed");
}

export default function OnboardingForm({ categories }: { categories: Category[] }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("shop");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const headingRef = useRef<HTMLHeadingElement>(null);

  const [logo, setLogo] = useState<File | null>(null);
  const [shopName, setShopName] = useState("");
  const [shopDescription, setShopDescription] = useState("");
  const [businessCategory, setBusinessCategory] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [address, setAddress] = useState("");

  const [productPhoto, setProductPhoto] = useState<File | null>(null);
  const [productName, setProductName] = useState("");
  const [productDescription, setProductDescription] = useState("");
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("");
  const [sku, setSku] = useState("");
  const [categoryId, setCategoryId] = useState("");

  // Move focus to the new step's heading on every step change so screen
  // reader users get an announcement (the heading's accessible name is read
  // on focus) instead of a silent panel swap, and keyboard users don't have
  // to tab back up from wherever the "Continue"/"Back" button happened to be.
  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  function validateShop() {
    const errs: Record<string, string> = {};
    if (!shopName.trim()) errs.shopName = "Shop name is required.";
    if (!businessCategory) errs.businessCategory = "Pick a category.";
    if (!contactPhone.trim()) errs.contactPhone = "A contact number is required.";
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function validateProduct() {
    const errs: Record<string, string> = {};
    if (!productName.trim()) errs.productName = "Product name is required.";
    // Same toCents() the server uses — client validation must reject exactly
    // what the server would reject, not an approximation of it.
    if (toCents(price) === null) errs.price = "Enter a valid price.";
    const qtyNum = Number(quantity);
    if (quantity === "" || !Number.isInteger(qtyNum) || qtyNum < 0) errs.quantity = "Enter a valid quantity.";
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function continueToProduct() {
    setError(null);
    setErrorCode(null);
    if (validateShop()) setStep("product");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setErrorCode(null);
    if (!validateProduct()) return;

    setPhase("submitting");
    try {
      const res = await fetch("/api/merchant/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shopName, shopDescription, businessCategory, contactPhone, address,
          productName, productDescription, price, quantity, sku,
          categoryId: categoryId || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorCode(typeof data.code === "string" ? data.code : null);
        throw new Error(data.error || "Something went wrong.");
      }

      const { store_id, product_id } = data as { store_id: string; product_id: string };

      // Best-effort: the shop/product already exist at this point, so a photo
      // upload failure here is recoverable later (dashboard), never a reason
      // to strand the merchant or make them redo onboarding.
      await Promise.all([
        logo ? uploadMedia(logo, store_id, "store_logo").catch(() => {}) : null,
        productPhoto ? uploadMedia(productPhoto, store_id, "product_photo", product_id).catch(() => {}) : null,
      ]);

      router.push("/merchant");
      router.refresh();
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : "Something went wrong.");
      setPhase("error");
    }
  }

  const busy = phase === "submitting";

  return (
    <div className="mx-auto max-w-md py-8">
      {/* Announces step changes to screen readers; the focused heading below
          covers this too, but an explicit live region is more reliable across
          assistive tech than relying solely on focus-triggered reading. */}
      <div aria-live="polite" className="sr-only">{STEP_LABEL[step]}</div>

      <ol className="mb-6 flex items-center gap-2" aria-label="Onboarding steps">
        <StepDot step={1} active={step === "shop"} done={step === "product"} icon={Store} label="Shop" />
        <span aria-hidden="true" className="h-px flex-1 bg-white/10" />
        <StepDot step={2} active={step === "product"} done={false} icon={Package} label="Product" />
      </ol>

      {step === "shop" ? (
        <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-white/[0.01] p-6">
          <h1 ref={headingRef} tabIndex={-1} className="font-syne text-xl font-bold text-offwhite outline-none">
            Set up your shop
          </h1>
          <p className="mt-1 font-dm text-sm text-muted">Just the essentials — you can add more later.</p>

          <div className="mt-6 space-y-4">
            <ImagePicker label="Shop logo (optional)" file={logo} onChange={setLogo} disabled={busy} />

            <div>
              <label htmlFor="shopName" className={labelCls}>Shop name *</label>
              <input id="shopName" className={inputCls} value={shopName} onChange={(e) => setShopName(e.target.value)} placeholder="e.g. Ti Marché Rosalie" disabled={busy}
                aria-invalid={!!fieldErrors.shopName} aria-describedby={fieldErrors.shopName ? "shopName-error" : undefined} />
              {fieldErrors.shopName && <FieldError id="shopName-error" text={fieldErrors.shopName} />}
            </div>

            <div>
              <label htmlFor="shopDescription" className={labelCls}>Description</label>
              <textarea id="shopDescription" className={`${inputCls} resize-none`} rows={2} value={shopDescription} onChange={(e) => setShopDescription(e.target.value)} placeholder="What do you sell?" disabled={busy} />
            </div>

            <div>
              <label htmlFor="businessCategory" className={labelCls}>Business category *</label>
              <select id="businessCategory" className={inputCls} value={businessCategory} onChange={(e) => setBusinessCategory(e.target.value)} disabled={busy}
                aria-invalid={!!fieldErrors.businessCategory} aria-describedby={fieldErrors.businessCategory ? "businessCategory-error" : undefined}>
                <option value="">Select a category</option>
                {BUSINESS_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              {fieldErrors.businessCategory && <FieldError id="businessCategory-error" text={fieldErrors.businessCategory} />}
            </div>

            <div>
              <label htmlFor="contactPhone" className={labelCls}>Contact number *</label>
              <input id="contactPhone" className={inputCls} type="tel" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="+230 5xxx xxxx" disabled={busy}
                aria-invalid={!!fieldErrors.contactPhone} aria-describedby={fieldErrors.contactPhone ? "contactPhone-error" : undefined} />
              {fieldErrors.contactPhone && <FieldError id="contactPhone-error" text={fieldErrors.contactPhone} />}
            </div>

            <div>
              <label htmlFor="address" className={labelCls}>Location (if applicable)</label>
              <input id="address" className={inputCls} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="e.g. Port Mathurin market" disabled={busy} />
            </div>
          </div>

          <button
            type="button"
            onClick={continueToProduct}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-yellow px-5 py-3 font-syne text-sm font-bold text-dark transition-colors hover:bg-yellow-dark"
          >
            Continue <ArrowRight size={15} />
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-white/[0.01] p-6">
          <h1 ref={headingRef} tabIndex={-1} className="font-syne text-xl font-bold text-offwhite outline-none">
            Add your first product
          </h1>
          <p className="mt-1 font-dm text-sm text-muted">List one thing to go live — add the rest anytime.</p>

          <div className="mt-6 space-y-4">
            <ImagePicker label="Product photo (optional)" file={productPhoto} onChange={setProductPhoto} disabled={busy} />

            <div>
              <label htmlFor="productName" className={labelCls}>Product name *</label>
              <input id="productName" className={inputCls} value={productName} onChange={(e) => setProductName(e.target.value)} placeholder="e.g. Red Snapper" disabled={busy}
                aria-invalid={!!fieldErrors.productName} aria-describedby={fieldErrors.productName ? "productName-error" : undefined} />
              {fieldErrors.productName && <FieldError id="productName-error" text={fieldErrors.productName} />}
            </div>

            <div>
              <label htmlFor="productDescription" className={labelCls}>Description</label>
              <textarea id="productDescription" className={`${inputCls} resize-none`} rows={2} value={productDescription} onChange={(e) => setProductDescription(e.target.value)} placeholder="Freshness, size, origin…" disabled={busy} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="price" className={labelCls}>Price (Rs) *</label>
                <input id="price" className={inputCls} type="number" min="0" step="0.01" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" disabled={busy}
                  aria-invalid={!!fieldErrors.price} aria-describedby={fieldErrors.price ? "price-error" : undefined} />
                {fieldErrors.price && <FieldError id="price-error" text={fieldErrors.price} />}
              </div>
              <div>
                <label htmlFor="quantity" className={labelCls}>Quantity *</label>
                <input id="quantity" className={inputCls} type="number" min="0" step="1" inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="0" disabled={busy}
                  aria-invalid={!!fieldErrors.quantity} aria-describedby={fieldErrors.quantity ? "quantity-error" : undefined} />
                {fieldErrors.quantity && <FieldError id="quantity-error" text={fieldErrors.quantity} />}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="sku" className={labelCls}>SKU (optional)</label>
                <input id="sku" className={inputCls} value={sku} onChange={(e) => setSku(e.target.value)} placeholder="Optional" disabled={busy} />
              </div>
              <div>
                <label htmlFor="categoryId" className={labelCls}>Product category</label>
                <select id="categoryId" className={inputCls} value={categoryId} onChange={(e) => setCategoryId(e.target.value)} disabled={busy}>
                  <option value="">None</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>
          </div>

          {error && (
            <div role="alert" className="mt-4 rounded-xl border border-red-500/25 bg-red-500/[0.06] px-4 py-3">
              <p className="flex items-center gap-2 font-dm text-xs text-red-400">
                <AlertCircle size={14} /> {error}
              </p>
              {errorCode === "RR001" && (
                <Link href="/merchant" className="mt-2 inline-block font-dm text-xs font-semibold text-yellow hover:underline">
                  Go to your dashboard →
                </Link>
              )}
            </div>
          )}

          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={() => { setStep("shop"); setError(null); setErrorCode(null); }}
              disabled={busy}
              className="flex items-center justify-center gap-2 rounded-full border border-white/15 px-5 py-3 font-syne text-sm font-bold text-offwhite transition-colors hover:bg-white/[0.06] disabled:opacity-60"
            >
              <ArrowLeft size={15} /> Back
            </button>
            <button
              type="submit"
              disabled={busy}
              className="flex flex-1 items-center justify-center gap-2 rounded-full bg-yellow px-5 py-3 font-syne text-sm font-bold text-dark transition-colors hover:bg-yellow-dark disabled:opacity-60"
            >
              {busy ? <><Loader2 size={16} className="animate-spin" /> Creating your shop…</> : <>Create my shop <CheckCircle2 size={15} /></>}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function FieldError({ id, text }: { id?: string; text: string }) {
  return <p id={id} role="alert" className="mt-1 font-dm text-[11px] text-red-400">{text}</p>;
}

function StepDot({ step, active, done, icon: Icon, label }: {
  step: number; active: boolean; done: boolean; icon: typeof Store; label: string;
}) {
  return (
    <li
      aria-current={active ? "step" : undefined}
      className={`flex items-center gap-2 font-dm text-xs font-medium ${active || done ? "text-yellow" : "text-muted/50"}`}
    >
      <span className={`flex h-7 w-7 items-center justify-center rounded-full border ${
        active || done ? "border-yellow/40 bg-yellow/10" : "border-white/10"
      }`}>
        <Icon size={14} aria-hidden="true" />
      </span>
      <span className="sr-only">Step {step}: </span>{label}
    </li>
  );
}
