-- M242 · Card is a payment method of its own.
--
-- The owner asked to be able to take cards. Stripe does not serve Mauritius,
-- but PayPal's card form does: a guest types a Visa or Mastercard into
-- PayPal's own fields, needs no PayPal account, and the money lands in the
-- same PayPal balance. It was hidden inside "PayPal or card", where a guest
-- without PayPal read "PayPal" and looked for another way to pay.
--
-- So "card" (seeded OFF in M240, waiting for a processor) is switched on and
-- listed first, and "PayPal" now means a PayPal account. Both are processed by
-- the same server route; the ledger records which one paid, from PayPal's
-- answer. The booking page offers them only while PayPal is LIVE
-- (lib/paypal.ts paypalMode) — a sandbox card form takes no real card.
--
-- rsv_guest_view is re-created only to drop its `m.id <> 'card'` exclusion.

update public.reservation_payment_methods
   set enabled = true,
       channel = 'online',
       sort = 5,
       label_i18n = '{"en": "Card · Visa, Mastercard", "fr": "Carte · Visa, Mastercard", "cr": "Kart · Visa, Mastercard"}',
       instructions_i18n = '{"en": "Pay with your card in a secure form. Processed by PayPal — no PayPal account needed.", "fr": "Payez par carte dans un formulaire sécurisé. Traité par PayPal — aucun compte PayPal nécessaire.", "cr": "Pey ar kart dan enn form sekirize. PayPal ki tret li — pa bizin kont PayPal."}',
       updated_at = now()
 where id = 'card';

-- Only while it still says what M240 seeded: an owner's own wording stays.
update public.reservation_payment_methods
   set label_i18n = '{"en": "PayPal account", "fr": "Compte PayPal", "cr": "Kont PayPal"}',
       instructions_i18n = '{"en": "Log in to PayPal to pay. No PayPal? Choose Card.", "fr": "Connectez-vous à PayPal pour payer. Pas de PayPal ? Choisissez Carte.", "cr": "Konekte lor PayPal pou pey. Pena PayPal? Swazir Kart."}',
       updated_at = now()
 where id = 'paypal' and label_i18n->>'en' = 'PayPal or card';

create or replace function public.rsv_guest_view(p_id uuid)
returns jsonb language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select jsonb_build_object(
    'reference', r.booking_reference,
    'status', r.reservation_status,
    'paymentStatus', r.payment_status,
    'paymentMethod', r.payment_method,
    'paymentReportedAt', r.payment_reported_at,
    'paymentReportedMethod', r.payment_reported_method,
    'customerName', r.customer_name,
    'locale', r.customer_locale,
    'productId', r.product_id,
    'productType', r.product_type,
    'product', r.product_snapshot,
    'slot', r.slot,
    'party', r.party,
    'seats', r.seats,
    'slotDate', r.slot_date,
    'slotEndDate', r.slot_end_date,
    'amountMur', r.amount_mur,
    'depositDueMur', r.deposit_due_mur,
    'balanceDueMur', r.balance_due_mur,
    'amountPaidMur', r.amount_paid_mur,
    'paymentDeadlineAt', r.payment_deadline_at,
    'policy', jsonb_build_object('mode', r.payment_policy_snapshot->>'mode'),
    'declineReason', case when r.reservation_status = 'declined' then r.decline_reason end,
    'requestedAt', r.requested_at,
    'confirmedAt', r.confirmed_at,
    'paidAt', r.paid_at,
    'infoRequest', (select jsonb_build_object('fields', i.fields, 'note', i.note, 'askedAt', i.asked_at)
                      from reservation_info_requests i
                     where i.reservation_id = r.id and i.answered_at is null
                     order by i.asked_at desc limit 1),
    -- Only once money is due: the policy's methods that the owner has
    -- switched on, with their instructions.
    'methods', case when r.reservation_status = 'confirmed' and r.payment_status in ('payment_pending', 'partially_paid', 'failed') then (
        select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'channel', m.channel, 'label', m.label_i18n, 'instructions', m.instructions_i18n) order by m.sort), '[]'::jsonb)
          from reservation_payment_methods m
         where m.enabled
           and (r.payment_policy_snapshot->'allowed_methods') ? m.id)
      else '[]'::jsonb end,
    'events', (select coalesce(jsonb_agg(jsonb_build_object('at', e.at, 'type', e.type) order by e.at), '[]'::jsonb)
                 from reservation_events e
                where e.reservation_id = r.id
                  and e.type in ('submitted', 'review_started', 'info_requested', 'info_received', 'confirmed', 'payment_reported',
                                 'payment_recorded', 'pay_in_person', 'ready', 'started', 'completed', 'declined', 'expired', 'cancelled')),
    'messages', (select coalesce(jsonb_agg(jsonb_build_object('at', o.created_at, 'template', o.template, 'payload', o.payload) order by o.created_at), '[]'::jsonb)
                   from reservation_outbox o where o.reservation_id = r.id and o.audience = 'guest')
  )
  from reservations r where r.id = p_id;
$$;

revoke all on function public.rsv_guest_view(uuid) from public, anon, authenticated;

notify pgrst, 'reload schema';
