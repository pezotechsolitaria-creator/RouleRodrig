-- ═══════════════════════════════════════════════════════════════════════════
-- M223c · THE LAUNCH CATALOGUE (applied as data via the MCP, 30 Sep 2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Four fixed plans, every figure taken from eSIM Access's official API
-- examples (docs.esimaccess.com, the GL-120 package family):
--
--   GL-120_1_7    1 GB / 7 d    $4.60   → €6.90   short trip
--   GL-120_3_30   3 GB / 30 d   $11.40  → €15.90  popular
--   GL-120_5_30   5 GB / 30 d   $18.00  → €23.90  best value
--   GL-120_10_30  10 GB / 30 d  $34.00  → €42.90  long stay
--
-- WHY GLOBAL PLANS FOR A MAURITIUS STORE: in Mauritius every one of them
-- roams onto my.t 4G ("operatorName":"my.t" in the docs), the network with
-- the widest footprint on Rodrigues; and the same eSIM keeps working at a
-- Dubai, Paris or Johannesburg layover and back home in France, the UK,
-- South Africa, Madagascar or the Seychelles (119 countries). They are the
-- fixed-data options the wholesaler offers for MU; its single-country
-- Mauritius plans are day passes (seeded below, INACTIVE: at ~€6/day they
-- are poor value against a €23.90 month, and the owner can switch them on).
--
-- Retail is all-in (PayPal's fee is absorbed, never added at checkout) and
-- retail_locked = true so a catalogue sync cannot reprice what was chosen by
-- hand. The first sync from /admin/esim refreshes the wholesale costs and
-- adds every other package covering MU, inactive.

with cc as (select string_to_array('AL,AR,AM,AU,AT,AZ,BE,BO,BA,BW,BR,BG,CM,CA,CF,TD,CL,CN,CO,CR,CI,HR,CY,CZ,CD,DK,EC,EG,SV,EE,SZ,FI,FR,GA,DE,GH,GI,GR,GU,GT,GW,HN,HK,HU,IS,IN,ID,IE,IL,IT,JP,JO,KZ,KE,XK,KW,KG,LV,LR,LI,LT,LU,MO,MG,MW,MY,ML,MT,MU,MX,MD,ME,MA,NL,NZ,NI,NE,NG,MK,NO,OM,PK,PA,PY,PE,PH,PL,PT,PR,QA,CG,RO,RU,SA,SN,RS,SC,SG,SK,SI,ZA,KR,ES,LK,SE,CH,TW,TZ,TH,TN,TR,UG,UA,AE,GB,US,UY,UZ,ZM', ',') as codes)
insert into public.esim_plans
  (provider, provider_code, provider_slug, region, country_codes, name, data_mb, per_day, period_num, validity_days,
   fup_policy, ip_export, networks, covers_rodrigues, hotspot, topup_supported, wholesale_usd_micros, retail_eur_cents,
   retail_locked, active, badge, sort_order, available, synced_at)
select 'esimaccess', v.code, v.code, 'mauritius',
       case when v.global then (select codes from cc) else array['MU'] end,
       v.name, v.mb, v.per_day, v.period, v.days, v.fup, 'UK/NO',
       '[{"name":"my.t","type":"4G"}]'::jsonb, true, true, v.topup, v.micros, v.retail,
       true, v.active, v.badge, v.sort, true, null
from (values
  ('GL-120_1_7',  'Global (120+ areas) 1GB 7Days',  1024,  false, null::int, 7,  null::text, true,  true,  4600000::bigint,  690, true,  'short_trip', 10),
  ('GL-120_3_30', 'Global (120+ areas) 3GB 30Days', 3072,  false, null,      30, null,       true,  true,  11400000,        1590, true, 'popular',    20),
  ('GL-120_5_30', 'Global (120+ areas) 5GB 30Days', 5120,  false, null,      30, null,       true,  true,  18000000,        2390, true, 'best_value', 30),
  ('GL-120_10_30','Global (120+ areas) 10GB 30Days',10240, false, null,      30, null,       true,  true,  34000000,        4290, true, 'long_stay',  40),
  ('MU_1_Daily',  'Mauritius 1GB/Day × 7 days',     1024,  true,  7,         7,  '384 Kbps', false, false, 34300000,        4490, false, null,        60),
  ('MU_2_Daily',  'Mauritius 2GB/Day × 7 days',     2048,  true,  7,         7,  '128 Kbps', false, false, 37800000,        4990, false, null,        70)
) as v(code, name, mb, per_day, period, days, fup, global, topup, micros, retail, active, badge, sort)
on conflict do nothing;
