import { describe, expect, it, vi, beforeEach } from "vitest";

const sendOrderNotificationEmail = vi.fn();
// M44: the WhatsApp channel ENQUEUES instead of sending inline, so the double
// is the queue rather than the transport. The behaviour these tests protect is
// unchanged — merchant-only, one message per order, failures never throw —
// only the collaborator moved.
const enqueueNotification = vi.fn();

vi.mock("@/lib/email", () => ({ sendOrderNotificationEmail: (...args: unknown[]) => sendOrderNotificationEmail(...args) }));
vi.mock("./queue", () => ({
  enqueueNotification: (...args: unknown[]) => enqueueNotification(...args),
  // Separator is irrelevant to these assertions — they check that the order
  // number reaches the message, not how the lines are spaced. The real
  // formatter is covered where its output actually matters.
  formatWhatsAppMessage: (o: { title: string; lines?: (string | null | undefined)[] }) =>
    [o.title, ...(o.lines ?? [])].filter(Boolean).join(" "),
}));

const { dispatchNotification } = await import("./dispatch");

describe("dispatchNotification", () => {
  beforeEach(() => {
    sendOrderNotificationEmail.mockReset();
    enqueueNotification.mockReset();
  });

  it("emails the customer when a recipientEmail is provided", async () => {
    sendOrderNotificationEmail.mockResolvedValue(true);
    await dispatchNotification({
      recipientType: "customer",
      recipientEmail: "customer@example.com",
      orderNumber: "ORD-1",
      type: "order_status_changed",
      title: "Order ORD-1: Ready",
      body: "Your order is now: Ready.",
    });
    expect(sendOrderNotificationEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "customer@example.com", orderNumber: "ORD-1" }),
    );
  });

  it("never calls the WhatsApp channel for a customer recipient — the WhatsApp channel is merchant-only", async () => {
    sendOrderNotificationEmail.mockResolvedValue(true);
    await dispatchNotification({
      recipientType: "customer",
      recipientEmail: "customer@example.com",
      orderNumber: "ORD-1",
      type: "order_status_changed",
      title: "t",
      body: "b",
    });
    expect(enqueueNotification).not.toHaveBeenCalled();
  });

  it("fires the WhatsApp channel for a merchant recipient", async () => {
    enqueueNotification.mockResolvedValue(1);
    await dispatchNotification({
      recipientType: "merchant",
      orderNumber: "ORD-2",
      type: "order_created",
      title: "New order",
      body: "You have a new order.",
    });
    expect(enqueueNotification).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("ORD-2"), category: "admin" }),
    );
  });

  it("skips the email channel silently when no recipientEmail is given", async () => {
    await dispatchNotification({
      recipientType: "merchant",
      orderNumber: "ORD-3",
      type: "order_created",
      title: "t",
      body: "b",
    });
    expect(sendOrderNotificationEmail).not.toHaveBeenCalled();
  });

  it("never throws even if every channel rejects — and reports nothing delivered", async () => {
    sendOrderNotificationEmail.mockRejectedValue(new Error("smtp down"));
    enqueueNotification.mockRejectedValue(new Error("queue unavailable"));
    await expect(
      dispatchNotification({
        recipientType: "customer",
        recipientEmail: "customer@example.com",
        orderNumber: "ORD-4",
        type: "order_status_changed",
        title: "t",
        body: "b",
      }),
    ).resolves.toBe(false);
  });

  it("returns true when at least one channel delivers", async () => {
    sendOrderNotificationEmail.mockRejectedValue(new Error("smtp down"));
    enqueueNotification.mockResolvedValue(1);
    await expect(
      dispatchNotification({
        recipientType: "merchant",
        recipientEmail: "shop@example.com",
        orderNumber: "ORD-5",
        type: "order_created",
        title: "t",
        body: "b",
      }),
    ).resolves.toBe(true);
  });

  it("returns false when every channel merely skips (no address, wrong recipient type)", async () => {
    await expect(
      dispatchNotification({
        recipientType: "customer",
        orderNumber: "ORD-6",
        type: "order_created",
        title: "t",
        body: "b",
      }),
    ).resolves.toBe(false);
  });

  it("honours the channels filter — an email-only merchant event never reaches WhatsApp", async () => {
    sendOrderNotificationEmail.mockResolvedValue(true);
    enqueueNotification.mockResolvedValue(1);
    await dispatchNotification({
      recipientType: "merchant",
      recipientEmail: "staff@example.com",
      orderNumber: "ORD-7",
      type: "order_created",
      title: "t",
      body: "b",
      channels: ["email"],
    });
    expect(sendOrderNotificationEmail).toHaveBeenCalledTimes(1);
    expect(enqueueNotification).not.toHaveBeenCalled();
  });

  it("forwards details and cta to the email channel", async () => {
    sendOrderNotificationEmail.mockResolvedValue(true);
    await dispatchNotification({
      recipientType: "customer",
      recipientEmail: "customer@example.com",
      orderNumber: "ORD-8",
      type: "order_created",
      title: "t",
      body: "b",
      details: [["Total", "Rs 100.00"]],
      cta: { url: "https://example.com/orders/x", label: "Track your order →" },
      channels: ["email"],
    });
    expect(sendOrderNotificationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        details: [["Total", "Rs 100.00"]],
        cta: { url: "https://example.com/orders/x", label: "Track your order →" },
      }),
    );
  });
});
