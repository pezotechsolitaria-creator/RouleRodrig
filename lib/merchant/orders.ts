"use client";

import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import type { OrderStatus } from "@/lib/orders/status";

export type OrderListItem = {
  id: string;
  order_number: string;
  status: OrderStatus;
  customer_name: string | null;
  customer_phone: string | null;
  total: number;
  currency: string;
  created_at: string;
  placed_at: string | null;
  order_items: { count: number }[];
  payments: { status: string; provider: string; created_at: string }[];
};

export type OrderItem = {
  id: string;
  product_name: string;
  variant_name: string | null;
  sku: string | null;
  unit_price: number;
  quantity: number;
  line_total: number;
};

export type OrderPayment = {
  id: string;
  provider: string;
  provider_ref: string | null;
  amount: number;
  currency: string;
  status: string;
  created_at: string;
};

export type OrderDetail = {
  id: string;
  order_number: string;
  status: OrderStatus;
  customer_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  notes: string | null;
  internal_notes: string | null;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  currency: string;
  commission_amount: number;
  placed_at: string | null;
  created_at: string;
  updated_at: string;
  fulfillment_method: string | null;
  delivery_fee: number;
  delivery_lat: number | null;
  delivery_lng: number | null;
  delivery_instructions: string | null;
  // The zone the customer picked, embedded from delivery_zones. Null on older
  // orders placed before region pricing, and on pickup orders.
  delivery_zones: { name: string } | null;
  payment_receipt_path: string | null;
  receipt_submitted_at: string | null;
  order_items: OrderItem[];
  payments: OrderPayment[];
  qr_pickup_tokens: { id: string; issued_at: string; expires_at: string; redeemed_at: string | null }[];
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "Something went wrong.");
  return body as T;
}

export const orderKeys = {
  all: ["merchant-orders"] as const,
  list: (params: { q: string; status: string; page: number }) => [...orderKeys.all, "list", params] as const,
  detail: (id: string) => [...orderKeys.all, "detail", id] as const,
};

export function useOrders(params: { q: string; status: string; page: number }) {
  return useQuery({
    queryKey: orderKeys.list(params),
    queryFn: () => {
      const qs = new URLSearchParams({ page: String(params.page) });
      if (params.q) qs.set("q", params.q);
      if (params.status !== "all") qs.set("status", params.status);
      return api<{ orders: OrderListItem[]; total: number; page: number; pageSize: number }>(
        `/api/merchant/orders?${qs.toString()}`,
      );
    },
    placeholderData: keepPreviousData,
  });
}

export function useOrder(id: string | null) {
  return useQuery({
    queryKey: orderKeys.detail(id ?? ""),
    queryFn: () => api<{ order: OrderDetail }>(`/api/merchant/orders/${id}`).then((r) => r.order),
    enabled: !!id,
  });
}

export function useUpdateOrder(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { status?: OrderStatus; internalNote?: string }) =>
      api<{ order_id: string; status: OrderStatus }>(`/api/merchant/orders/${id}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: orderKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: orderKeys.all });
    },
  });
}
