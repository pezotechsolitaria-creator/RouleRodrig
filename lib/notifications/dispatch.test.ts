import { describe, expect, it, vi, beforeEach } from "vitest";

const sendOrderNotificationEmail = vi.fn();
const sendOwnerWhatsApp = vi.fn();

vi.mock("@/lib/email", () => ({ sendOrderNotificationEmail: (...args: unknown[]) => sendOrderNotificationEmail(...args) }));
vi.mock("@/lib/whatsapp", () => ({ sendOwnerWhatsApp: (...args: unknown[]) => sendOwnerWhatsApp(...args) }));

const { dispatchNotification } = await import("./dispatch");

describe("dispatchNotification", () => {
  beforeEach(() => {
    sendOrderNotificationEmail.mockReset();
    sendOwnerWhatsApp.mockReset();
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

  it("never calls the WhatsApp channel for a customer recipient — sendOwnerWhatsApp structurally can't reach a customer", async () => {
    sendOrderNotificationEmail.mockResolvedValue(true);
    await dispatchNotification({
      recipientType: "customer",
      recipientEmail: "customer@example.com",
      orderNumber: "ORD-1",
      type: "order_status_changed",
      title: "t",
      body: "b",
    });
    expect(sendOwnerWhatsApp).not.toHaveBeenCalled();
  });

  it("fires the WhatsApp channel for a merchant recipient", async () => {
    sendOwnerWhatsApp.mockResolvedValue(true);
    await dispatchNotification({
      recipientType: "merchant",
      orderNumber: "ORD-2",
      type: "order_created",
      title: "New order",
      body: "You have a new order.",
    });
    expect(sendOwnerWhatsApp).toHaveBeenCalledWith(expect.stringContaining("ORD-2"));
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

  it("never throws even if every channel rejects", async () => {
    sendOrderNotificationEmail.mockRejectedValue(new Error("smtp down"));
    sendOwnerWhatsApp.mockRejectedValue(new Error("callmebot down"));
    await expect(
      dispatchNotification({
        recipientType: "customer",
        recipientEmail: "customer@example.com",
        orderNumber: "ORD-4",
        type: "order_status_changed",
        title: "t",
        body: "b",
      }),
    ).resolves.toBeUndefined();
  });
});
