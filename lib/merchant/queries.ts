"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ProductInput } from "@/lib/schemas/product";

export type ProductVariant = { id: string; price: number; stock_quantity: number; is_active: boolean; sku?: string | null };
export type ProductMedia = { id: string; url: string; position: number };
export type ProductListItem = {
  id: string;
  name: string;
  status: "draft" | "active" | "archived";
  category_id: string | null;
  created_at: string;
  product_variants: ProductVariant[];
  product_media: ProductMedia[];
};
export type ProductDetail = ProductListItem & { description: string | null };

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "Something went wrong.");
  return body as T;
}

export const productKeys = {
  all: ["merchant-products"] as const,
  list: () => [...productKeys.all, "list"] as const,
  detail: (id: string) => [...productKeys.all, "detail", id] as const,
};

export function useProducts() {
  return useQuery({
    queryKey: productKeys.list(),
    queryFn: () => api<{ products: ProductListItem[] }>("/api/merchant/products").then((r) => r.products),
  });
}

export function useProduct(id: string | null) {
  return useQuery({
    queryKey: productKeys.detail(id ?? ""),
    queryFn: () => api<{ product: ProductDetail }>(`/api/merchant/products/${id}`).then((r) => r.product),
    enabled: !!id,
  });
}

export function useCreateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ProductInput) =>
      api<{ product_id: string; variant_id: string }>("/api/merchant/products", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: productKeys.list() });
    },
  });
}

export function useUpdateProduct(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<ProductInput>) =>
      api<{ ok: true }>(`/api/merchant/products/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: productKeys.list() });
      queryClient.invalidateQueries({ queryKey: productKeys.detail(id) });
    },
  });
}

export function useDeleteProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<{ ok: true }>(`/api/merchant/products/${id}`, { method: "DELETE" }),
    // Optimistic: archived products disappear from the list immediately —
    // safe here because DELETE is a soft-archive (see the API route), not a
    // destructive operation, so an optimistic removal can't lose data even
    // if the request ultimately fails (the rollback below restores the row).
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: productKeys.list() });
      const previous = queryClient.getQueryData<ProductListItem[]>(productKeys.list());
      queryClient.setQueryData<ProductListItem[]>(productKeys.list(), (old) => old?.filter((p) => p.id !== id));
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) queryClient.setQueryData(productKeys.list(), context.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: productKeys.list() });
    },
  });
}

export function useUploadProductMedia(productId: string, storeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("storeId", storeId);
      fd.append("target", "product_photo");
      fd.append("productId", productId);
      const res = await fetch("/api/merchant/media", { method: "POST", body: fd });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Upload failed.");
      return body as { url: string };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: productKeys.detail(productId) });
      queryClient.invalidateQueries({ queryKey: productKeys.list() });
    },
  });
}

export function useDeleteProductMedia(productId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (mediaId: string) => api<{ ok: true }>(`/api/merchant/media/${mediaId}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: productKeys.detail(productId) });
      queryClient.invalidateQueries({ queryKey: productKeys.list() });
    },
  });
}
