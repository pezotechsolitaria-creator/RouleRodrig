"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export type NotificationRow = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  data: Record<string, unknown>;
  order_id: string | null;
  read_at: string | null;
  created_at: string;
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

export const notificationKeys = {
  all: ["notifications"] as const,
};

// Polled rather than realtime — this app has no websocket/Realtime channel
// wired up yet, and a 30s poll is more than enough for "new order" alerts on
// a merchant dashboard that's typically kept open in a background tab.
export function useNotifications() {
  return useQuery({
    queryKey: notificationKeys.all,
    queryFn: () => api<{ notifications: NotificationRow[] }>("/api/notifications").then((r) => r.notifications),
    refetchInterval: 30_000,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<{ ok: true }>(`/api/notifications/${id}`, { method: "PATCH" }),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: notificationKeys.all });
      const previous = queryClient.getQueryData<NotificationRow[]>(notificationKeys.all);
      queryClient.setQueryData<NotificationRow[]>(notificationKeys.all, (old) =>
        old?.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n)),
      );
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) queryClient.setQueryData(notificationKeys.all, context.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}
