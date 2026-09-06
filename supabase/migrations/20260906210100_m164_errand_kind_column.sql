-- ── An errand's own question ───────────────────────────────────────────────
--
-- The owner, on the first cut: "do it for me should not have things like
-- parcel, hot food, fragile, heavy, bigger than cars — because it is not
-- delivering something, it should have its own stuffs."
--
-- Right, and the reason is structural. `cargo_kind` and `size_class` answer
-- "what is being CARRIED", which is the only thing that decides which vehicles
-- may take the job. An errand often carries nothing at all — paying a bill
-- brings back a receipt in a pocket — so asking whether it is hot food or
-- bigger than a car is asking about an object that does not exist.
--
-- So an errand gets its own question, and it needs somewhere to live. Encoding
-- it in the free-text `what` was the alternative and it is worse in both
-- directions: the driver board could not show the job type at a glance, and
-- the service dashboard would go on grouping typed sentences instead of real
-- categories.
alter table delivery_requests
  add column if not exists errand_kind text;

-- TWO constraints, each saying ONE thing, rather than one clever equivalence.
-- The last equivalence on this table — (kind = 'shop_and_deliver') =
-- (max_budget IS NOT NULL) — is exactly what made adding a third kind a
-- migration instead of a one-liner, because it silently forbade the new kind
-- from ever carrying a budget. These two do not have that failure mode: a
-- fourth kind added later simply has no errand_kind, which is true.
alter table delivery_requests
  -- Only an errand may carry one, and only these values.
  add constraint delivery_requests_errand_kind_domain
    check (
      errand_kind is null
      or (kind = 'errand'
          and errand_kind in ('pay_bill', 'queue', 'collect', 'gas', 'other'))
    ),
  -- And an errand must. The form always asks, so a row without one came from
  -- somewhere that bypassed it.
  add constraint delivery_requests_errand_kind_required
    check (kind <> 'errand' or errand_kind is not null);

comment on column delivery_requests.errand_kind is
  'What KIND of errand: pay_bill | queue | collect | gas | other. Set only when kind = errand, and required then. Distinct from cargo_kind, which is about what is carried and often nothing here.';
