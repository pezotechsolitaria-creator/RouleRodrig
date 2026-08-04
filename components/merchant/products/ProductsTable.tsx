"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Search, Plus, Pencil, Trash2, PackageOpen, ImageOff } from "lucide-react";
import { useProducts, useDeleteProduct, type ProductListItem } from "@/lib/merchant/queries";
import { centsToDecimalString } from "@/lib/money";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Category = { id: string; name: string };
type SortKey = "newest" | "oldest" | "name" | "price_low" | "price_high";
const PAGE_SIZE = 10;

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  active: { label: "Active", className: "bg-green-500/15 text-green-400 border-green-500/30" },
  draft: { label: "Draft", className: "bg-white/10 text-muted border-white/15" },
  archived: { label: "Archived", className: "bg-red-500/10 text-red-400/80 border-red-500/20" },
};

function statusBadge(status: string) {
  const cfg = STATUS_BADGE[status] ?? STATUS_BADGE.draft;
  return <Badge variant="outline" className={cfg.className}>{cfg.label}</Badge>;
}

export default function ProductsTable({ categories }: { categories: Category[] }) {
  const { data: products, isLoading, isError, error } = useProducts();
  const deleteProduct = useDeleteProduct();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [sort, setSort] = useState<SortKey>("newest");
  const [page, setPage] = useState(1);
  const [pendingDelete, setPendingDelete] = useState<ProductListItem | null>(null);

  const visible = useMemo(() => {
    // Archived products are never shown here by default — they're
    // soft-deleted, not "a status to browse."
    let rows = (products ?? []).filter((p) => p.status !== "archived");

    if (statusFilter !== "all") rows = rows.filter((p) => p.status === statusFilter);
    if (categoryFilter !== "all") rows = rows.filter((p) => p.category_id === categoryFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter((p) => p.name.toLowerCase().includes(q));
    }

    rows = [...rows].sort((a, b) => {
      switch (sort) {
        case "oldest": return a.created_at.localeCompare(b.created_at);
        case "name": return a.name.localeCompare(b.name);
        case "price_low": return (a.product_variants[0]?.price ?? 0) - (b.product_variants[0]?.price ?? 0);
        case "price_high": return (b.product_variants[0]?.price ?? 0) - (a.product_variants[0]?.price ?? 0);
        default: return b.created_at.localeCompare(a.created_at);
      }
    });
    return rows;
  }, [products, search, statusFilter, categoryFilter, sort]);

  const totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const pageRows = visible.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function categoryName(id: string | null) {
    return categories.find((c) => c.id === id)?.name ?? "—";
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    const name = pendingDelete.name;
    setPendingDelete(null);
    try {
      await deleteProduct.mutateAsync(pendingDelete.id);
      toast.success(`"${name}" removed from your shop.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete product.");
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl bg-white/[0.04]" />)}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-2xl border border-red-500/20 bg-red-500/[0.04] p-6 text-center">
        <p className="font-dm text-sm text-red-400">{error instanceof Error ? error.message : "Failed to load products."}</p>
      </div>
    );
  }

  if ((products ?? []).filter((p) => p.status !== "archived").length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-white/[0.01] p-10 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-yellow/10 text-yellow ring-1 ring-inset ring-yellow/20">
          <PackageOpen size={22} />
        </span>
        <h3 className="mt-4 font-syne text-lg font-bold text-offwhite">No products yet</h3>
        <p className="mx-auto mt-1 max-w-xs font-dm text-sm text-muted">
          Add your first product to start selling. It only takes a minute.
        </p>
        <Button render={<Link href="/merchant/products/new" />} nativeButton={false} className="mt-5">
          <Plus size={15} className="mr-1.5" /> Add product
        </Button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <Input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search products…"
            className="pl-8"
            aria-label="Search products"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v ?? "all"); setPage(1); }}>
          <SelectTrigger className="w-full sm:w-36" aria-label="Filter by status"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
          </SelectContent>
        </Select>
        <Select value={categoryFilter} onValueChange={(v) => { setCategoryFilter(v ?? "all"); setPage(1); }}>
          <SelectTrigger className="w-full sm:w-40" aria-label="Filter by category"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
          <SelectTrigger className="w-full sm:w-36" aria-label="Sort products"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest</SelectItem>
            <SelectItem value="oldest">Oldest</SelectItem>
            <SelectItem value="name">Name (A–Z)</SelectItem>
            <SelectItem value="price_low">Price: low to high</SelectItem>
            <SelectItem value="price_high">Price: high to low</SelectItem>
          </SelectContent>
        </Select>
        <Button render={<Link href="/merchant/products/new" />} nativeButton={false} className="shrink-0">
          <Plus size={15} className="mr-1.5" /> Add
        </Button>
      </div>

      {visible.length === 0 ? (
        <p className="mt-8 text-center font-dm text-sm text-muted">No products match your filters.</p>
      ) : (
        <>
          {/* Desktop table */}
          <div className="mt-4 hidden overflow-hidden rounded-2xl border border-white/10 sm:block">
            <table className="w-full text-left">
              <thead className="bg-white/[0.03]">
                <tr className="font-dm text-xs text-muted">
                  <th className="px-4 py-3 font-medium">Product</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium">Price</th>
                  <th className="px-4 py-3 font-medium">Stock</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium sr-only">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((p) => (
                  <ProductRow key={p.id} product={p} categoryName={categoryName(p.category_id)} onDelete={() => setPendingDelete(p)} />
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="mt-4 space-y-2 sm:hidden">
            {pageRows.map((p) => (
              <ProductCard key={p.id} product={p} categoryName={categoryName(p.category_id)} onDelete={() => setPendingDelete(p)} />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between font-dm text-xs text-muted">
              <span>Page {page} of {totalPages}</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </>
      )}

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &ldquo;{pendingDelete?.name}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes it from your shop. It won&apos;t appear in listings, but past orders referencing it are kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-500 text-white hover:bg-red-600">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Thumb({ url }: { url?: string }) {
  if (!url) {
    return (
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-dark-card text-muted/50">
        <ImageOff size={16} />
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" className="h-11 w-11 shrink-0 rounded-lg object-cover" />;
}

function ProductRow({ product, categoryName, onDelete }: { product: ProductListItem; categoryName: string; onDelete: () => void }) {
  const variant = product.product_variants[0];
  const media = [...product.product_media].sort((a, b) => a.position - b.position)[0];
  return (
    <tr className="border-t border-white/10 font-dm text-sm text-offwhite">
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <Thumb url={media?.url} />
          <span className="font-medium">{product.name}</span>
        </div>
      </td>
      <td className="px-4 py-3 text-muted">{categoryName}</td>
      <td className="px-4 py-3">Rs {centsToDecimalString(variant?.price ?? 0)}</td>
      <td className="px-4 py-3">{variant?.stock_quantity ?? 0}</td>
      <td className="px-4 py-3">{statusBadge(product.status)}</td>
      <td className="px-4 py-3">
        <div className="flex justify-end gap-1">
          <Button render={<Link href={`/merchant/products/${product.id}/edit`} />} nativeButton={false} variant="ghost" size="icon-sm" aria-label={`Edit ${product.name}`}>
            <Pencil size={14} />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label={`Delete ${product.name}`} onClick={onDelete} className="hover:text-red-400">
            <Trash2 size={14} />
          </Button>
        </div>
      </td>
    </tr>
  );
}

function ProductCard({ product, categoryName, onDelete }: { product: ProductListItem; categoryName: string; onDelete: () => void }) {
  const variant = product.product_variants[0];
  const media = [...product.product_media].sort((a, b) => a.position - b.position)[0];
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-dark-card p-3">
      <Thumb url={media?.url} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-dm text-sm font-medium text-offwhite">{product.name}</p>
        <p className="font-dm text-xs text-muted">{categoryName} · Rs {centsToDecimalString(variant?.price ?? 0)} · {variant?.stock_quantity ?? 0} in stock</p>
        <div className="mt-1">{statusBadge(product.status)}</div>
      </div>
      <div className="flex flex-col gap-1">
        <Button render={<Link href={`/merchant/products/${product.id}/edit`} />} nativeButton={false} variant="ghost" size="icon-sm" aria-label={`Edit ${product.name}`}>
          <Pencil size={14} />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label={`Delete ${product.name}`} onClick={onDelete} className="hover:text-red-400">
          <Trash2 size={14} />
        </Button>
      </div>
    </div>
  );
}
