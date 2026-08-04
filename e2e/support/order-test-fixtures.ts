import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { hasServiceRole } from "./merchant-test-user";

export { hasServiceRole };

function admin(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type OrderFixture = {
  merchant: { id: string; email: string; password: string; userId: string };
  customer: { id: string; email: string; password: string };
  storeId: string;
  orderId: string;
  orderNumber: string;
};

/**
 * Seeds a fully-approved merchant + store + a signed-in customer + one
 * "paid" order (with an item and a captured payment) directly via the
 * service-role client, bypassing RLS entirely — the same pattern
 * merchant-test-user.ts uses to dodge Supabase's signup email flow and rate
 * limit. Order-management E2E tests need real rows to click through, not
 * just an authenticated empty account.
 */
export async function seedOrderFixture(label: string): Promise<OrderFixture> {
  const client = admin();
  const suffix = `${label}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
  const password = "TestPass123!";

  const { data: merchantAuth, error: merchantErr } = await client.auth.admin.createUser({
    email: `e2e.merchant.${suffix}@example.test`,
    password,
    email_confirm: true,
  });
  if (merchantErr || !merchantAuth.user) throw new Error(`merchant user: ${merchantErr?.message}`);

  const { data: customerAuth, error: customerErr } = await client.auth.admin.createUser({
    email: `e2e.customer.${suffix}@example.test`,
    password,
    email_confirm: true,
  });
  if (customerErr || !customerAuth.user) throw new Error(`customer user: ${customerErr?.message}`);

  const { data: merchant, error: mErr } = await client
    .from("merchants")
    .insert({
      owner_id: merchantAuth.user.id,
      legal_name: `E2E Orders ${suffix}`,
      display_name: `E2E Orders Shop ${suffix}`,
      contact_email: `e2e.merchant.${suffix}@example.test`,
      status: "approved",
      kyc_status: "approved",
    })
    .select("id")
    .single();
  if (mErr || !merchant) throw new Error(`merchant row: ${mErr?.message}`);

  const { data: store, error: sErr } = await client
    .from("stores")
    .insert({ merchant_id: merchant.id, name: `E2E Orders Shop ${suffix}`, slug: `e2e-orders-${suffix}`, currency: "MUR" })
    .select("id")
    .single();
  if (sErr || !store) throw new Error(`store row: ${sErr?.message}`);

  await client.from("merchant_staff").insert({ merchant_id: merchant.id, user_id: merchantAuth.user.id, role: "owner" });

  const orderNumber = `E2E-${suffix.slice(0, 8).toUpperCase()}`;
  const { data: order, error: oErr } = await client
    .from("orders")
    .insert({
      order_number: orderNumber,
      store_id: store.id,
      customer_id: customerAuth.user.id,
      customer_name: "E2E Test Customer",
      customer_phone: "+230 5000 0000",
      status: "paid",
      subtotal: 5000,
      total: 5000,
      currency: "MUR",
      placed_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (oErr || !order) throw new Error(`order row: ${oErr?.message}`);

  await client.from("order_items").insert({
    order_id: order.id, product_name: "E2E Test Product", unit_price: 2500, quantity: 2, line_total: 5000,
  });
  await client.from("payments").insert({
    order_id: order.id, provider: "paypal", amount: 5000, currency: "MUR", status: "captured",
  });

  return {
    merchant: { id: merchant.id, email: merchantAuth.user.email!, password, userId: merchantAuth.user.id },
    customer: { id: customerAuth.user.id, email: customerAuth.user.email!, password },
    storeId: store.id,
    orderId: order.id,
    orderNumber,
  };
}

export async function deleteOrderFixture(fixture: OrderFixture): Promise<void> {
  const client = admin();
  await client.from("merchants").delete().eq("owner_id", fixture.merchant.userId);
  await client.auth.admin.deleteUser(fixture.merchant.userId);
  await client.auth.admin.deleteUser(fixture.customer.id);
}
