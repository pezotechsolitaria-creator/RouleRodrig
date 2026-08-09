"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import posthog from "posthog-js";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2, ImagePlus, ArrowLeft } from "lucide-react";
import { productSchema, type ProductInput } from "@/lib/schemas/product";
import { centsToDecimalString, toCents } from "@/lib/money";
import {
  useCreateProduct, useUpdateProduct, useDeleteProductMedia, type ProductDetail,
} from "@/lib/merchant/queries";
import SortableImageGrid, { type GridImage } from "./SortableImageGrid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Category = { id: string; name: string };
type PendingImage = { key: string; file: File; url: string };

export default function ProductForm({
  mode, storeId, categories, product,
}: {
  mode: "create" | "edit";
  storeId: string;
  categories: Category[];
  product?: ProductDetail;
}) {
  const router = useRouter();
  const variant = product?.product_variants[0];

  const {
    register, handleSubmit, watch, setValue, formState: { errors, isSubmitting },
  } = useForm<ProductInput>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      name: product?.name ?? "",
      description: product?.description ?? "",
      price: variant ? centsToDecimalString(variant.price) : "",
      categoryId: product?.category_id ?? null,
      sku: variant?.sku ?? "",
      stockQuantity: variant?.stock_quantity ?? 0,
      status: (product?.status === "active" ? "active" : "draft") as "draft" | "active",
    },
  });

  const [existingImages, setExistingImages] = useState<GridImage[]>(
    (product?.product_media ?? [])
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((m) => ({ id: m.id, url: m.url })),
  );
  const [removedExisting, setRemovedExisting] = useState<Set<string>>(new Set());
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const [reordered, setReordered] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Hooks must run unconditionally on every render (Rules of Hooks) — always
  // call useUpdateProduct, with a harmless placeholder id in create mode
  // where it's never actually invoked (see onSubmit).
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct(product?.id ?? "");
  const deleteMedia = useDeleteProductMedia(product?.id ?? "");

  const priceValue = watch("price");
  const pricePreview = useMemo(() => {
    const cents = toCents(priceValue || "");
    return cents === null ? null : `Rs ${centsToDecimalString(cents)}`;
  }, [priceValue]);

  const visibleExisting = existingImages.filter((img) => !removedExisting.has(img.id));
  const gridImages: GridImage[] = [
    ...visibleExisting,
    ...pendingImages.map((p) => ({ id: p.key, url: p.url })),
  ];

  function addFiles(files: FileList) {
    const next = Array.from(files)
      .slice(0, 8 - gridImages.length)
      .map((file) => ({ key: `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`, file, url: URL.createObjectURL(file) }));
    if (Array.from(files).length + gridImages.length > 8) {
      toast.error("Up to 8 photos per product.");
    }
    setPendingImages((prev) => [...prev, ...next]);
  }

  function removeImage(id: string) {
    if (existingImages.some((img) => img.id === id)) {
      setRemovedExisting((prev) => new Set(prev).add(id));
    } else {
      setPendingImages((prev) => {
        const removed = prev.find((p) => p.key === id);
        if (removed) URL.revokeObjectURL(removed.url);
        return prev.filter((p) => p.key !== id);
      });
    }
  }

  // Pending-image object URLs are created once per file (in addFiles), not
  // per render, so they don't leak on every keystroke the way the M2
  // ImagePicker's did — but they still need revoking on removal (handled
  // above) and on unmount (a submit navigates away without ever revoking the
  // ones that got uploaded). A ref (not a `[pendingImages]` dependency) so
  // the effect registers ONE cleanup at mount that still sees the LATEST
  // images at unmount time, rather than a stale closure over the initial
  // (empty) state or re-registering a new cleanup on every add/remove.
  const pendingImagesRef = useRef(pendingImages);
  pendingImagesRef.current = pendingImages;
  useEffect(() => {
    return () => {
      for (const p of pendingImagesRef.current) URL.revokeObjectURL(p.url);
    };
  }, []);

  function reorderImages(newOrder: GridImage[]) {
    const newPendingOrder: PendingImage[] = [];
    const newExistingOrder: GridImage[] = [];
    for (const img of newOrder) {
      const pending = pendingImages.find((p) => p.key === img.id);
      if (pending) newPendingOrder.push(pending);
      else {
        const existing = existingImages.find((e) => e.id === img.id);
        if (existing) newExistingOrder.push(existing);
      }
    }
    // Keeps removed-but-not-yet-committed images out of the reordered arrays
    // is fine — they're filtered from gridImages anyway and dropped on submit.
    setPendingImages(newPendingOrder);
    setExistingImages([...newExistingOrder, ...existingImages.filter((e) => removedExisting.has(e.id))]);
    setReordered(true);
  }

  async function onSubmit(input: ProductInput) {
    try {
      let productId = product?.id;

      if (mode === "create") {
        const result = await createProduct.mutateAsync(input);
        productId = result.product_id;
      } else {
        await updateProduct.mutateAsync(input);
      }

      if (!productId) throw new Error("Something went wrong creating the product.");

      posthog.capture(mode === "create" ? "merchant_product_created" : "merchant_product_updated", {
        store_id: storeId,
        product_id: productId,
        status: input.status,
        has_category: Boolean(input.categoryId),
        image_count: gridImages.length,
      });

      // Sequential, not parallel — predictable gallery order matches upload
      // order without depending on server-side race handling for the common
      // case (add_product_media() is still race-safe if this ever changes).
      for (const pending of pendingImages) {
        await uploadMediaFor(productId, pending.file);
      }
      for (const id of removedExisting) {
        await deleteMedia.mutateAsync(id);
      }
      if (reordered && mode === "edit") {
        const orderedIds = existingImages.filter((img) => !removedExisting.has(img.id)).map((img) => img.id);
        if (orderedIds.length > 0) {
          await fetch("/api/merchant/media/reorder", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ productId, mediaIds: orderedIds }),
          });
        }
      }

      toast.success(mode === "create" ? "Product created." : "Product updated.");
      router.push("/merchant/products");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong.");
    }
  }

  async function uploadMediaFor(productId: string, file: File) {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("storeId", storeId);
    fd.append("target", "product_photo");
    fd.append("productId", productId);
    const res = await fetch("/api/merchant/media", { method: "POST", body: fd });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || "Photo upload failed.");
    }
  }

  const busy = isSubmitting || createProduct.isPending || updateProduct?.isPending;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="mx-auto max-w-2xl py-8">
      <button
        type="button"
        onClick={() => router.push("/merchant/products")}
        className="mb-4 flex items-center gap-1.5 font-dm text-xs text-muted transition-colors hover:text-yellow"
      >
        <ArrowLeft size={14} /> Back to products
      </button>

      <h1 className="font-syne text-xl font-bold text-offwhite">
        {mode === "create" ? "Add a product" : "Edit product"}
      </h1>

      <div className="mt-6 rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-white/[0.01] p-6">
        <div className="space-y-4">
          <div>
            <Label className="mb-1.5 font-dm text-xs font-medium text-muted">Photos</Label>
            <div className="mt-2 flex flex-wrap items-start gap-2">
              <SortableImageGrid images={gridImages} onReorder={reorderImages} onRemove={removeImage} />
              {gridImages.length < 8 && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex aspect-square w-full max-w-[calc(33.333%-0.34rem)] flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-dark-border text-muted/60 transition-colors hover:border-yellow/50 hover:text-yellow sm:max-w-[calc(25%-0.375rem)]"
                >
                  <ImagePlus size={18} />
                  <span className="font-dm text-[10px]">Add</span>
                </button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) addFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <p className="mt-1.5 font-dm text-[11px] text-muted/70">Drag to reorder. Up to 8 photos.</p>
          </div>

          <div>
            <Label htmlFor="name" className="mb-1.5 font-dm text-xs font-medium text-muted">Product name *</Label>
            <Input id="name" {...register("name")} aria-invalid={!!errors.name} disabled={busy} />
            {errors.name && <p role="alert" className="mt-1 font-dm text-[11px] text-red-400">{errors.name.message}</p>}
          </div>

          <div>
            <Label htmlFor="description" className="mb-1.5 font-dm text-xs font-medium text-muted">Description</Label>
            <Textarea id="description" rows={3} {...register("description")} disabled={busy} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="price" className="mb-1.5 font-dm text-xs font-medium text-muted">Price (Rs) *</Label>
              <Input id="price" type="text" inputMode="decimal" placeholder="0.00" {...register("price")} aria-invalid={!!errors.price} disabled={busy} />
              {pricePreview && <p className="mt-1 font-dm text-[11px] text-yellow">{pricePreview}</p>}
              {errors.price && <p role="alert" className="mt-1 font-dm text-[11px] text-red-400">{errors.price.message}</p>}
            </div>
            <div>
              <Label htmlFor="stockQuantity" className="mb-1.5 font-dm text-xs font-medium text-muted">Stock quantity *</Label>
              <Input id="stockQuantity" type="number" min="0" step="1" {...register("stockQuantity", { valueAsNumber: true })} aria-invalid={!!errors.stockQuantity} disabled={busy} />
              {errors.stockQuantity && <p role="alert" className="mt-1 font-dm text-[11px] text-red-400">{errors.stockQuantity.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="sku" className="mb-1.5 font-dm text-xs font-medium text-muted">SKU (optional)</Label>
              <Input id="sku" {...register("sku")} disabled={busy} />
            </div>
            <div>
              <Label htmlFor="categoryId" className="mb-1.5 font-dm text-xs font-medium text-muted">Category</Label>
              <Select
                defaultValue={product?.category_id ?? undefined}
                onValueChange={(v) => setValue("categoryId", v)}
                disabled={busy}
              >
                <SelectTrigger id="categoryId" className="w-full"><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-dark-border bg-dark-card px-4 py-3">
            <div>
              <p className="font-dm text-sm text-offwhite">Available for sale</p>
              <p className="font-dm text-[11px] text-muted">Off = saved as a draft, hidden from customers.</p>
            </div>
            <Switch
              defaultChecked={product?.status === "active"}
              onCheckedChange={(checked) => setValue("status", checked ? "active" : "draft")}
              disabled={busy}
              aria-label="Available for sale"
            />
          </div>
        </div>

        <Button type="submit" disabled={busy} className="mt-6 w-full py-5">
          {busy ? <><Loader2 size={16} className="mr-2 animate-spin" /> Saving…</> : mode === "create" ? "Create product" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
