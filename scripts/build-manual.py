#!/usr/bin/env python3
"""
Builds "Roule Rodrigues — Complete Platform & Operations Manual" as a PDF.

WHY THIS IS A SCRIPT AND NOT A HAND-WRITTEN DOCUMENT
The manual has to be regenerated when the platform changes, and a PDF that is
edited by hand drifts from reality within a fortnight — which is exactly the
problem it exists to solve. Keeping it as code means the next person runs one
command instead of trusting a file whose age they cannot see.

    python scripts/build-manual.py

STATUS DISCIPLINE
Every feature carries one of five statuses, and they are load-bearing. The
owner's own words: old ideas linger and get mistaken for the current product.
So nothing in here is described as working unless it was verified against the
live site or the live database.

    IMPLEMENTED   — verified working
    PARTIAL       — some of it works; the gap is named
    CONFIG        — the code is done; production configuration is missing
    PLANNED       — not built. Never described as if it were.
    DEPRECATED    — still present, should not be relied on
"""

from datetime import date
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    BaseDocTemplate, Frame, PageTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, KeepTogether,
)

OUT = "Roule Rodrigues - Complete Platform & Operations Manual.pdf"
VERSION = "1.0"
TODAY = date.today().strftime("%d %B %Y")

# Brand: the dark/gold identity, but printed on white — a manual is read on
# paper and in a PDF viewer, not on the site.
GOLD = colors.HexColor("#B8860B")
INK = colors.HexColor("#1A1A1A")
MUTED = colors.HexColor("#5A5A5A")
RULE = colors.HexColor("#DDDDDD")
BG_SOFT = colors.HexColor("#FAF8F2")

STATUS_COLOR = {
    "IMPLEMENTED": colors.HexColor("#1B7F3B"),
    "PARTIAL": colors.HexColor("#B8860B"),
    "CONFIG": colors.HexColor("#0B6FA4"),
    "PLANNED": colors.HexColor("#777777"),
    "DEPRECATED": colors.HexColor("#A32020"),
}

styles = getSampleStyleSheet()


def S(name, **kw):
    base = kw.pop("parent", styles["Normal"])
    return ParagraphStyle(name, parent=base, **kw)


H1 = S("H1", fontName="Helvetica-Bold", fontSize=19, leading=23, textColor=INK,
       spaceBefore=2, spaceAfter=9)
H2 = S("H2", fontName="Helvetica-Bold", fontSize=13, leading=16, textColor=INK,
       spaceBefore=13, spaceAfter=5)
H3 = S("H3", fontName="Helvetica-Bold", fontSize=10.5, leading=13, textColor=GOLD,
       spaceBefore=9, spaceAfter=3)
BODY = S("Body", fontName="Helvetica", fontSize=9.3, leading=13.4, textColor=INK,
         spaceAfter=5, alignment=TA_LEFT)
SMALL = S("Small", fontName="Helvetica", fontSize=8.2, leading=11.5, textColor=MUTED,
          spaceAfter=4)
MONO = S("Mono", fontName="Courier", fontSize=8, leading=11, textColor=INK, spaceAfter=4)
BULLET = S("Bullet", parent=BODY, leftIndent=11, bulletIndent=2, spaceAfter=2.5)
EYEBROW = S("Eyebrow", fontName="Helvetica-Bold", fontSize=7.6, leading=10,
            textColor=GOLD, spaceAfter=2)
COVER_TITLE = S("CoverTitle", fontName="Helvetica-Bold", fontSize=31, leading=35,
                textColor=INK, alignment=TA_CENTER, spaceAfter=6)
COVER_SUB = S("CoverSub", fontName="Helvetica", fontSize=13, leading=18,
              textColor=MUTED, alignment=TA_CENTER, spaceAfter=4)

story = []


def h1(t): story.append(Paragraph(t, H1))
def h2(t): story.append(Paragraph(t, H2))
def h3(t): story.append(Paragraph(t, H3))
def p(t): story.append(Paragraph(t, BODY))
def small(t): story.append(Paragraph(t, SMALL))
def mono(t): story.append(Paragraph(t, MONO))
def gap(h=5): story.append(Spacer(1, h))
def page(): story.append(PageBreak())


def bullets(items):
    for i in items:
        story.append(Paragraph(i, BULLET, bulletText="•"))
    story.append(Spacer(1, 4))


def table(rows, widths, header=True, small_text=True, zebra=True):
    fs = 7.9 if small_text else 8.6
    cell = S("Cell", fontName="Helvetica", fontSize=fs, leading=fs + 3.2, textColor=INK)
    cellh = S("CellH", fontName="Helvetica-Bold", fontSize=fs, leading=fs + 3.2,
              textColor=colors.white)
    data = []
    for r_i, row in enumerate(rows):
        st = cellh if (header and r_i == 0) else cell
        data.append([Paragraph(str(c), st) for c in row])

    t = Table(data, colWidths=widths, repeatRows=1 if header else 0)
    cmds = [
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.4, RULE),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 3.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5),
    ]
    if header:
        cmds.append(("BACKGROUND", (0, 0), (-1, 0), INK))
    if zebra:
        start = 1 if header else 0
        for i in range(start, len(rows)):
            if (i - start) % 2 == 1:
                cmds.append(("BACKGROUND", (0, i), (-1, i), BG_SOFT))
    t.setStyle(TableStyle(cmds))
    story.append(t)
    story.append(Spacer(1, 7))


def status_table(rows):
    """Feature / status / note, with the status colour-coded."""
    cell = S("C", fontName="Helvetica", fontSize=7.9, leading=11, textColor=INK)
    cellh = S("CH", fontName="Helvetica-Bold", fontSize=7.9, leading=11, textColor=colors.white)
    data = [[Paragraph(x, cellh) for x in ("Feature", "Status", "What that means here")]]
    cmds = [
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.4, RULE),
        ("BACKGROUND", (0, 0), (-1, 0), INK),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 3.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5),
    ]
    for i, (feat, st, note) in enumerate(rows, start=1):
        sty = S(f"S{i}", fontName="Helvetica-Bold", fontSize=7.9, leading=11,
                textColor=STATUS_COLOR[st])
        data.append([Paragraph(feat, cell), Paragraph(st, sty), Paragraph(note, cell)])
        if i % 2 == 1:
            cmds.append(("BACKGROUND", (0, i), (-1, i), BG_SOFT))
    t = Table(data, colWidths=[46 * mm, 25 * mm, 92 * mm], repeatRows=1)
    t.setStyle(TableStyle(cmds))
    story.append(t)
    story.append(Spacer(1, 7))


def callout(title, text, tone="note"):
    accent = {"note": GOLD, "warn": colors.HexColor("#A32020"),
              "ok": colors.HexColor("#1B7F3B")}[tone]
    ts = S("CoT", fontName="Helvetica-Bold", fontSize=8.6, leading=11.5, textColor=accent)
    bs = S("CoB", fontName="Helvetica", fontSize=8.6, leading=12, textColor=INK)
    inner = Table([[Paragraph(title, ts)], [Paragraph(text, bs)]], colWidths=[157 * mm])
    inner.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), BG_SOFT),
        ("LINEBEFORE", (0, 0), (0, -1), 2.4, accent),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (0, 0), 6),
        ("BOTTOMPADDING", (0, -1), (-1, -1), 6),
        ("TOPPADDING", (0, 1), (-1, 1), 1),
    ]))
    story.append(KeepTogether(inner))
    story.append(Spacer(1, 7))


def flow(steps):
    """A left-to-right process line, wrapped as a table so it never overflows."""
    cell = S("F", fontName="Helvetica-Bold", fontSize=7.4, leading=9.6,
             textColor=INK, alignment=TA_CENTER)
    cells, cmds = [], [
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]
    for i, s in enumerate(steps):
        if i:
            cells.append(Paragraph("&rarr;", S("A", fontName="Helvetica-Bold", fontSize=9,
                                               textColor=GOLD, alignment=TA_CENTER)))
        cells.append(Paragraph(s, cell))
    widths = []
    for i in range(len(cells)):
        widths.append(5 * mm if i % 2 == 1 else (157 * mm - 5 * mm * (len(steps) - 1)) / len(steps))
    t = Table([cells], colWidths=widths)
    for i in range(0, len(cells), 2):
        cmds += [("BACKGROUND", (i, 0), (i, 0), BG_SOFT),
                 ("BOX", (i, 0), (i, 0), 0.4, RULE)]
    t.setStyle(TableStyle(cmds))
    story.append(t)
    story.append(Spacer(1, 8))


# ═══════════════════════════════════════════════════════════════════════════
# COVER
# ═══════════════════════════════════════════════════════════════════════════
story.append(Spacer(1, 52 * mm))
story.append(Paragraph("ROULÉ RODRIGUES", COVER_TITLE))
story.append(Paragraph("Complete Platform &amp; Operations Manual", COVER_SUB))
gap(10)
line = Table([[""]], colWidths=[52 * mm], rowHeights=[2])
line.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), GOLD)]))
story.append(line)
gap(14)
story.append(Paragraph(
    f"Version {VERSION} &nbsp;·&nbsp; {TODAY}", COVER_SUB))
gap(8)
story.append(Paragraph(
    "A handover document. It describes how the business runs through the "
    "software — not merely which files and tables exist.", SMALL))
gap(30)
story.append(Paragraph(
    "<b>Read section 2 first.</b> It states, feature by feature, what is "
    "actually working today and what is not. Nothing elsewhere in this manual "
    "describes a feature as complete unless section 2 agrees.", SMALL))
page()

# ═══════════════════════════════════════════════════════════════════════════
# 1. EXECUTIVE OVERVIEW
# ═══════════════════════════════════════════════════════════════════════════
h1("1. Executive overview")

p("Roulé Rodrigues is a local digital platform for Rodrigues Island (Republic "
  "of Mauritius). It began as a scooter-rental and tourism site and has become "
  "a multi-sided platform: it sells rentals, marketplace goods, prepared food, "
  "event tickets and bookable experiences, and it coordinates the delivery and "
  "collection of those things across the island.")

p("It is a <b>production system</b>. The live site is roulerodrig.com; the "
  "<b>main</b> git branch deploys automatically. There is no staging "
  "environment — a merge to main is a release.")

h2("What the business actually sells")
table([
    ["Line of business", "Revenue model", "Payment rails"],
    ["Scooter &amp; car rental", "Rental income; deposit taken online to hold the vehicle",
     "PayPal (EUR) or bank transfer"],
    ["Marketplace (local shops)", "<b>Monthly merchant subscription</b> — not commission",
     "Cash or direct bank transfer only"],
    ["Food ordering", "Platform-operated; margin arranged with each cook",
     "Cash or direct bank transfer"],
    ["Event ticketing", "Ticket sales, platform-run", "Cash or bank transfer"],
    ["Experiences (fishing, boats, massage)", "Deposit to reserve; balance on the day",
     "PayPal or bank transfer"],
    ["Transfers, taxi, food concierge", "Introduction / arrangement, handled by a person",
     "Off-platform"],
], [40 * mm, 66 * mm, 51 * mm])

callout("The single most important business rule",
        "Card payments (PayPal) are reserved for <b>vehicle rentals and place "
        "bookings only</b>. The marketplace, food and ticketing take <b>cash or "
        "direct bank transfer</b>. This is enforced in three independent places "
        "— a Zod schema, a whitelist inside the create_order() database "
        "function, and a CHECK constraint on the payments table — so it holds "
        "even if application code is bypassed. Do not \"simplify\" this.")

h2("Scale, honestly stated")
p("The platform's <b>capability</b> substantially exceeds its current "
  "<b>inventory</b>. This is the most important thing a new owner should "
  "understand, and it is a commercial fact rather than a technical fault.")
table([
    ["Measure", "Today"],
    ["Database tables / functions / RLS policies", "65 / 165 / 105"],
    ["Registered users", "10"],
    ["Merchants", "6 (incl. platform-owned system merchants)"],
    ["Marketplace orders placed, all time", "5"],
    ["Vehicle bookings, all time", "1"],
    ["Place bookings (experiences), all time", "0"],
    ["Delivery drivers registered", "0"],
    ["Published events", "0 (one draft)"],
    ["Food kitchens", "1 (a clearly-labelled demo)"],
    ["Island locations with photography", "32 with multiple photos"],
], [95 * mm, 62 * mm])
p("The build quality is high and the surfaces are tested; what the business "
  "needs next is supply and traffic, not more software.")
page()

# ═══════════════════════════════════════════════════════════════════════════
# 2. CURRENT SYSTEM STATUS
# ═══════════════════════════════════════════════════════════════════════════
h1("2. Current system status")
p("This is the authoritative list. Everything was checked against the live "
  "site or the live database on the date on the cover. Where a feature is "
  "incomplete, the specific gap is named rather than softened.")

h3("How to read the statuses")
table([
    ["Status", "Meaning"],
    ["IMPLEMENTED", "Built, deployed and verified working."],
    ["PARTIAL", "Works, but a named part is missing or manual."],
    ["CONFIG", "The code is complete. Production configuration or data is missing."],
    ["PLANNED", "Not built. Do not rely on it."],
    ["DEPRECATED", "Still present. Do not build on it."],
], [30 * mm, 127 * mm])

h2("Commerce")
status_table([
    ("Marketplace storefront", "IMPLEMENTED", "Browse shops and products, cart, checkout."),
    ("Marketplace checkout", "IMPLEMENTED",
     "Server-derived pricing, row-locked stock, idempotency, guest checkout."),
    ("Food ordering (/food)", "IMPLEMENTED",
     "Dish-first catalog, search, quick add, dish pages, availability windows."),
    ("Food operations admin", "IMPLEMENTED",
     "Order queue, catalog, kitchens, categories, scan-to-hand-over counter."),
    ("Pickup handover (QR + code)", "IMPLEMENTED",
     "Single-use, hash-stored, ten-attempt burn. Verified end to end."),
    ("Pickup location shown to customer", "IMPLEMENTED",
     "At checkout, while preparing, beside the code, and in the ready email."),
    ("Three separate carts", "IMPLEMENTED", "Food, shop and tickets never collide."),
    ("Delivery network", "PARTIAL",
     "Driver, offer and PIN-verified completion logic exists. <b>Zero drivers "
     "registered</b>, so it has never run with a real driver."),
    ("Coupons / discounts", "PARTIAL", "Table and columns exist; no admin screen."),
    ("Refunds", "PLANNED",
     "`refunded` is a valid order status but nothing transitions into it."),
])

h2("Bookings and experiences")
status_table([
    ("Vehicle rental booking", "IMPLEMENTED",
     "Availability, holds, deposit, reminders, guest lookup."),
    ("Place bookings (Stay·Eat·Do)", "IMPLEMENTED",
     "Capacity, time slots, deposit-to-confirm. <b>Never used in production.</b>"),
    ("Fishing / sea trips / massage", "CONFIG",
     "Discovery and booking surfaces live at /experiences/[type]; they run on "
     "the place-booking engine. <b>No providers have been added</b>, so all "
     "three pages show their empty state."),
    ("Transfers (/transfers)", "IMPLEMENTED",
     "Structured request → lead record → WhatsApp handoff. Deliberately has no "
     "automated dispatch or 'confirmed' state."),
    ("Taxi directory", "IMPLEMENTED", "Driver list with reviews. One driver listed."),
    ("Live taxi dispatch / driver GPS", "PLANNED",
     "No such infrastructure exists. Do not promise live tracking."),
])

h2("Events and ticketing")
status_table([
    ("Event creation and publishing", "IMPLEMENTED", "An event is modelled as a store."),
    ("Ticket types and inventory", "IMPLEMENTED",
     "A ticket type is a product variant, so capacity is stock and overselling "
     "is prevented by the same row lock as the marketplace."),
    ("QR tickets and gate check-in", "IMPLEMENTED", "Scanner exists for door staff."),
    ("Organiser accounts", "IMPLEMENTED",
     "Scoped identities; organisers never become merchants."),
    ("Live event sales dashboard", "PARTIAL", "Counts exist; no charting."),
])

h2("Discovery and content")
status_table([
    ("Homepage (cards, quick actions, rails)", "IMPLEMENTED", "Admin-editable."),
    ("Beach / viewpoint card discovery", "IMPLEMENTED",
     "Cards, search and filters on top of the long-form guides; badges derived "
     "from existing text. SEO prose preserved beneath."),
    ("Events promo carousel", "IMPLEMENTED",
     "Renders nothing while no event is published — by design."),
    ("Hero video", "IMPLEMENTED",
     "Accepts YouTube, Vimeo or a direct file. Admin states what a link will do."),
    ("Trilingual content (EN/FR/CR)", "IMPLEMENTED", "Throughout."),
    ("Blog and island guides", "IMPLEMENTED", "The main SEO surface."),
    ("Ti Roulé assistant", "IMPLEMENTED", "Island knowledge assistant."),
])

h2("Platform services")
status_table([
    ("Unified tracking (/track)", "IMPLEMENTED",
     "One reference + email finds a rental, a place booking or an order. "
     "Two-factor by design."),
    ("Signed-in activity list", "IMPLEMENTED", "Rentals, bookings and orders together."),
    ("Transactional email", "IMPLEMENTED",
     "One router, two providers, quota-aware. See section 9."),
    ("Web push", "PARTIAL", "Subscription plumbing exists; limited send coverage."),
    ("WhatsApp owner alerts", "IMPLEMENTED", "Owner-only, via CallMeBot."),
    ("Audit log", "PARTIAL",
     "Table exists and receives some admin writes; coverage is not complete."),
    ("Role-based admin permissions", "PLANNED",
     "<b>See the warning in section 11.</b> There is one admin password and no roles."),
    ("Analytics", "IMPLEMENTED", "PostHog (product) and Sentry (errors), separated."),
])
page()

# ═══════════════════════════════════════════════════════════════════════════
# 3. ARCHITECTURE
# ═══════════════════════════════════════════════════════════════════════════
h1("3. System architecture")

h2("Technology")
table([
    ["Layer", "Choice", "Notes"],
    ["Framework", "Next.js 16 (App Router) + React 19",
     "Server components by default; server actions and route handlers for writes."],
    ["Language", "TypeScript", "Strict."],
    ["Styling", "Tailwind CSS v4", "Dark UI, gold accent."],
    ["Database", "Supabase (PostgreSQL)", "Row-Level Security on every table."],
    ["Auth", "Supabase Auth", "Customers, merchants, organisers, drivers."],
    ["Storage", "Supabase Storage", "Uploads, product media, hero video."],
    ["Hosting", "Vercel", "Auto-deploy from main; region fra1."],
    ["Email", "Resend + Brevo", "Routed by type; see section 9."],
    ["Errors", "Sentry", "Scrubbed."],
    ["Product analytics", "PostHog", "No PII; replay off."],
    ["Push", "web-push (VAPID)", "Browser push."],
], [26 * mm, 46 * mm, 85 * mm])

h2("The one architectural idea that explains most of the codebase")
p("Several products that look different to a customer are the <b>same thing</b> "
  "underneath. This was a deliberate, repeated decision and it is why the "
  "system is far smaller than its feature list suggests.")
table([
    ["Customer sees", "Internally it is", "So it inherits"],
    ["A shop", "A <b>store</b> with products", "The original model"],
    ["An event", "A <b>store</b>; a ticket type is a product variant",
     "Zero overselling, checkout, payment handshake"],
    ["A kitchen", "A <b>store</b>; a dish is a product",
     "Server pricing, stock locking, pickup codes, delivery"],
    ["A fishing trip, boat trip or massage",
     "A bookable <b>place</b> (Stay·Eat·Do model)",
     "Capacity, time slots, deposits, holds"],
], [36 * mm, 62 * mm, 59 * mm])
callout("Why this matters to a new owner",
        "Adding a fourth kind of seller is mostly configuration, not a new "
        "codebase. It also means a change to checkout, stock or payments "
        "affects <b>all</b> of them — which is a strength for correctness and a "
        "risk for careless edits. Test across products, not just the one you "
        "are working on.")

h2("Request flow")
flow(["Browser", "Vercel edge", "Next.js server", "Supabase RPC", "PostgreSQL + RLS"])
p("Money-touching operations never run in the browser. Prices, stock and "
  "status transitions are all decided inside PostgreSQL functions, so a "
  "modified client cannot change what it is charged.")
page()

# ═══════════════════════════════════════════════════════════════════════════
# 4. THE PEOPLE
# ═══════════════════════════════════════════════════════════════════════════
h1("4. Who uses the platform")

h2("Customer")
p("No account is required to buy. Guest checkout is the default and the "
  "majority path; an account simply keeps a history.")
flow(["Discover", "Add / book", "Checkout", "Pay", "Track", "Collect"])
bullets([
    "<b>Ordering:</b> browse /food or /shop, add to the relevant cart, check "
    "out as a guest with an email, pay cash or by bank transfer.",
    "<b>Booking:</b> choose dates or a slot, pay a deposit to hold it.",
    "<b>Tracking:</b> /track takes the reference and the email from the "
    "confirmation and finds the item, whatever kind it is.",
    "<b>Collection:</b> an eight-character code plus QR, shown at the counter.",
])

h2("Merchant (shop owner)")
p("Applies, is approved by the platform, then runs their own shop at "
  "/merchant — products, stock, opening hours, orders, and the pickup handover. "
  "Revenue model is a <b>monthly subscription</b>; an expired subscription "
  "blocks editing and publishing but never hides existing orders.")

h2("Cook (food)")
callout("Cooks deliberately have NO login",
        "The platform operator owns the food catalog and the order queue, and "
        "rings the cook. This is a product decision, not an omission: it "
        "removes onboarding, training and support from the hardest supply side "
        "to recruit. Every kitchen therefore belongs to one platform-owned "
        "merchant so that creating a kitchen cannot accidentally mint a login.")

h2("Service provider (fishing, boats, massage)")
p("Currently managed <b>by the platform operator</b> through the admin "
  "content editor. Providers have no dashboard. This is appropriate while the "
  "count is small and should be revisited when there are enough providers that "
  "the operator becomes the bottleneck.")

h2("Event organiser")
p("Receives a scoped account limited to their own event. Organisers are never "
  "merchants and never gain marketplace access.")

h2("Driver")
p("Applies, is approved, then receives delivery offers. A driver never sees "
  "the customer's PIN — the customer supplies it on the doorstep and the "
  "server verifies it. <b>No drivers are registered yet</b>, so this flow has "
  "not been exercised in production.")

h2("Administrator")
p("One password-protected account today with complete access. See section 11.")
page()

# ═══════════════════════════════════════════════════════════════════════════
# 5. STATE MACHINES
# ═══════════════════════════════════════════════════════════════════════════
h1("5. State machines")
p("These are the rules that keep money and inventory correct. They are "
  "enforced inside the database, not in the interface.")

h2("Order (marketplace, food and tickets)")
flow(["pending_payment", "paid", "preparing", "ready_for_pickup", "collected"])
table([
    ["From", "May become", "Who triggers it"],
    ["pending_payment", "paid, cancelled", "Merchant or platform admin"],
    ["awaiting_payment_confirmation", "paid, cancelled", "Merchant confirms money arrived"],
    ["paid", "preparing, cancelled", "Merchant / operator"],
    ["preparing", "ready_for_pickup, cancelled", "Merchant / operator"],
    ["ready_for_pickup", "collected, cancelled", "Scanning the pickup code, or manual"],
    ["collected", "— (final)", ""],
    ["cancelled", "— (final)", "Releases reserved stock automatically"],
], [50 * mm, 52 * mm, 55 * mm])
callout("Two doors, one set of rules",
        "There are two functions that move an order: update_order_status() for "
        "merchants and admin_update_order_status() for the platform operator. "
        "They exist separately because /admin authenticates with a password "
        "cookie and has no Supabase user, so the merchant function's "
        "`auth.uid()` check can never pass for it. <b>Both enforce the same "
        "transitions and the same side effects.</b> Never relax the merchant "
        "function to make an admin screen work.")

h2("Pickup code")
flow(["issued", "previewed (read-only)", "redeemed once", "burned"])
bullets([
    "Only the SHA-256 <b>hash</b> is stored, never the code itself.",
    "Redemption is a conditional update, so two simultaneous scans produce "
    "exactly one collection.",
    "Ten failed attempts burn the token permanently.",
    "A shared screenshot is useless after the first redemption.",
])

h2("Vehicle booking")
flow(["pending", "deposit paid", "confirmed", "out", "returned"])
p("A booking only holds a vehicle once the deposit is paid; unpaid requests do "
  "not block availability. Whoever pays first secures it.")

h2("Delivery")
flow(["created", "offered", "accepted", "picked up", "delivered"])
p("Two guarantees are enforced in the database: <b>no double assignment</b> "
  "(two drivers accepting at the same instant produce one winner, via a "
  "conditional update), and <b>no faked completion</b> (the customer's PIN is "
  "verified server-side inside the same transaction that marks delivery). "
  "Failure states are explicit — driver unavailable, unresponsive, failed "
  "delivery, returned to merchant — because each needs a different response.")
page()

# ═══════════════════════════════════════════════════════════════════════════
# 6. DATABASE
# ═══════════════════════════════════════════════════════════════════════════
h1("6. Database")
p("PostgreSQL via Supabase. 65 tables, 165 functions, 105 RLS policies. "
  "Schema changes are tracked migrations in <font face='Courier'>supabase/migrations/</font>.")

h2("The tables that matter most")
table([
    ["Table", "Holds", "Notes"],
    ["stores", "Shops, events and kitchens", "The central identity for any seller"],
    ["products / product_variants", "Sellable items and their SKUs",
     "A variant carries the price and the stock"],
    ["orders / order_items", "Every purchase", "Money in integer minor units"],
    ["payments", "Money records", "A CHECK constraint bars card providers"],
    ["inventory_movements", "Stock ledger",
     "Stock is a ledger; the variant's count is a cached total kept by trigger"],
    ["bookings", "Vehicle rentals", "Keyed by email, predates Supabase Auth"],
    ["place_bookings", "Experiences", "Same; the fishing/boat/massage engine"],
    ["events / ticket_types / tickets", "Ticketing", "An event extends a store"],
    ["food_items / food_kitchens", "The food catalog", "Extend products and stores"],
    ["food_kitchen_ops", "Cook name and phone",
     "<b>RLS on, no policy — service role only.</b> Never add a policy"],
    ["deliveries / delivery_drivers", "The delivery network", "Offers, PINs, milestones"],
    ["site_content", "All editable website content", "A single JSONB row"],
    ["audit_logs", "Administrative actions", "Append-only"],
    ["app_secrets", "Server-side secrets",
     "<b>RLS on, no policy — service role only.</b> Never expose"],
], [40 * mm, 47 * mm, 70 * mm])

h2("Three rules that are easy to break")
bullets([
    "<b>Money is stored in integer minor units.</b> Rs 250.00 is 25000. "
    "Never introduce floats.",
    "<b>Row-Level Security filters rows, never columns.</b> Sensitive fields "
    "must live in their own table — this is why cook contact details are "
    "separated from the public kitchen record.",
    "<b>Writes go through database functions, not table DML.</b> Order status, "
    "stock and payments all have a single sanctioned path. Direct grants were "
    "deliberately revoked; preserve that.",
])

callout("Content lives in the database, not in the code",
        "Editing <font face='Courier'>lib/defaults.ts</font> does <b>not</b> "
        "change the live site. The site_content row overrides it, and defaults "
        "are only a first-run seed. Equally, patching that row with raw SQL "
        "will be overwritten the next time the owner presses Save in admin, "
        "because the admin writes the whole blob. Change content in admin.")
page()

# ═══════════════════════════════════════════════════════════════════════════
# 7. SECURITY
# ═══════════════════════════════════════════════════════════════════════════
h1("7. Security architecture")

h2("What protects the money")
table([
    ["Risk", "Control"],
    ["Customer edits the price", "Every price is re-derived server-side inside "
     "create_order(); the client's figure is only used to <i>refuse</i> a charge "
     "that differs from what was displayed."],
    ["Overselling the last item", "Stock is checked under a row lock inside the "
     "same transaction that creates the order. Proven under 8-way concurrency."],
    ["Double-charging on a retry", "Every checkout carries an idempotency key; a "
     "repeated submit returns the existing order rather than creating a twin."],
    ["Reusing a pickup code", "Single-use conditional update; only the hash is stored."],
    ["Reading someone else's order", "Guest lookup requires reference <b>and</b> "
     "email, and returns only the matching item. Identical error messages for "
     "'wrong reference' and 'wrong email', so it cannot confirm what exists."],
    ["Paying with a card where cash is required", "Blocked in three independent places."],
], [42 * mm, 115 * mm])

h2("Two admin identities — important")
callout("A trap that has caused real bugs",
        "The /admin dashboard authenticates with a signed <b>password cookie</b> "
        "and has no Supabase user, so <font face='Courier'>auth.uid()</font> is "
        "null and <font face='Courier'>is_platform_admin()</font> can never be "
        "true for it. Any function gated on those will silently refuse the admin. "
        "The pattern used throughout is a separate admin-scoped function gated on "
        "<i>auth.uid() is null OR is_platform_admin()</i>, reached with the "
        "service-role key. The cookie check in the route is the real security "
        "boundary. This has already caused two production defects; expect it.",
        tone="warn")

h2("Known weaknesses a new owner should address")
table([
    ["Weakness", "Risk", "Suggested action"],
    ["<b>One shared admin password</b>; no roles, no per-user accounts",
     "Any admin can do anything, and actions cannot be attributed to a person",
     "Introduce real admin accounts before hiring staff"],
    ["<font face='Courier'>platform_admins</font> table is <b>empty</b>",
     "is_platform_admin() is false for everyone; several policies are therefore "
     "unreachable and admin work depends entirely on the service role",
     "Decide deliberately: either provision admins or remove the dead policies"],
    ["Audit log coverage is partial",
     "Not every sensitive action is attributable",
     "Extend to all admin writes"],
    ["Leaked-password protection disabled in Supabase Auth",
     "Users may choose known-breached passwords",
     "Enable in the Supabase dashboard — one switch"],
    ["Service-role key is broadly used in admin routes",
     "It bypasses RLS entirely; a bug in one route is unbounded",
     "Keep it server-only; never import into a client component"],
], [46 * mm, 56 * mm, 55 * mm])
page()

# ═══════════════════════════════════════════════════════════════════════════
# 8. ADMIN
# ═══════════════════════════════════════════════════════════════════════════
h1("8. Administration")
p("The administrator signs in at <font face='Courier'>/admin/login</font> with "
  "a single password. The dashboard is one large page of editable sections, "
  "plus dedicated screens for the heavier operational areas.")

h2("Where each job is done")
table([
    ["Task", "Where"],
    ["Website content, homepage, tiles, branding, FAQ, contacts", "/admin (sections)"],
    ["Food: order queue, dishes, kitchens, categories, handover", "/admin/food"],
    ["Shops and opening hours", "/admin/stores"],
    ["Merchant subscriptions", "/admin/subscriptions"],
    ["Delivery areas and fees", "/admin/delivery-zones"],
    ["Deliveries and drivers", "/admin/deliveries"],
    ["Event organisers", "/admin/organizers"],
    ["Managed ticketing", "/admin/managed-ticketing"],
    ["Monetization and revenue model", "/admin/monetization"],
    ["WhatsApp alert recipients", "/admin/notifications"],
    ["Experiences (fishing, boats, massage)",
     "/admin &rarr; Stay·Eat·Do &rarr; set <b>Service type</b>"],
], [86 * mm, 71 * mm])

h2("What an administrator can do without a developer")
bullets([
    "Publish, edit and price every dish, product, event and experience.",
    "Approve, suspend and configure merchants; set subscriptions.",
    "Run the food service: confirm, prepare, mark ready, hand over by scan.",
    "Change homepage cards, quick actions, imagery, hero video and copy.",
    "Set delivery areas and fees, and opening hours for any shop.",
    "Answer bookings, leads and contact submissions.",
])

h2("What still requires a developer")
table([
    ["Gap", "Why it matters"],
    ["Creating a merchant <b>account</b> from scratch",
     "Merchants self-register and are then approved; there is no 'create merchant "
     "with login' button"],
    ["Refunds", "No refund flow exists in software; refunds are handled outside it"],
    ["Coupons", "Data model exists, no admin screen"],
    ["Admin roles and staff accounts", "One shared password"],
    ["Feature flags per service", "Services are switched off by unpublishing content"],
], [52 * mm, 105 * mm])
page()

# ═══════════════════════════════════════════════════════════════════════════
# 9. COMMUNICATIONS
# ═══════════════════════════════════════════════════════════════════════════
h1("9. Communications")

h2("Email")
p("All transactional email goes through one router. A caller names the "
  "<b>type</b> of message; routing, provider choice and quota are data, not "
  "code. Two providers are configured because each free tier is small.")
callout("Quota is a real operational constraint",
        "Both providers allow roughly 100 messages per <b>day</b> on their free "
        "tiers, giving a combined ceiling near 400/day when both are "
        "configured. Supabase Auth email (sign-up, password reset) also spends "
        "one provider's allowance invisibly. A busy day can exhaust this. The "
        "router keeps a reserve for ticketing so a customer who paid always "
        "receives their ticket.")

h2("Channels")
table([
    ["Channel", "Used for", "Status"],
    ["Email", "Confirmations, receipts, tickets, order status, pickup codes", "IMPLEMENTED"],
    ["WhatsApp", "<b>Owner alerts only</b> — never customers", "IMPLEMENTED"],
    ["Web push", "Driver offers and some order updates", "PARTIAL"],
    ["In-app notifications", "Customer-visible order events", "IMPLEMENTED"],
], [28 * mm, 92 * mm, 37 * mm])

h2("Scheduled work")
p("One daily job runs at 06:00 UTC (10:00 Rodrigues) at "
  "<font face='Courier'>/api/cron/reminders</font>. It sends pickup, return and "
  "feedback reminders, expires stale orders and holds, checks email quota, "
  "backs up website content, and resets the daily food stock.")
callout("The food reset is a safety net, not the primary path",
        "06:00 UTC is 10:00 in Rodrigues — too late to open the day. The "
        "<b>primary</b> reset is the operator pressing \"Start the day\" in "
        "/admin/food when kitchens actually open, which is also the more "
        "truthful model. Do not add a second cron entry: the hosting plan's "
        "cron limit has already broken a deploy once.")
page()

# ═══════════════════════════════════════════════════════════════════════════
# 10. OPERATIONS
# ═══════════════════════════════════════════════════════════════════════════
h1("10. Running the business")

h2("Onboarding a merchant")
flow(["Merchant applies", "Admin reviews", "Approve", "Subscription", "Shop live"])

h2("Onboarding a cook")
flow(["Agree terms", "Create kitchen", "Add dishes + photos", "Publish"])
p("The cook needs no account and installs nothing. The operator publishes "
  "their dishes and telephones them when an order arrives.")

h2("Onboarding an experience provider")
flow(["Create place", "Set Service type", "Prices + slots", "Publish"])

h2("A day of food service")
flow(["Start the day", "Watch the queue", "Confirm + cook", "Mark ready", "Scan code"])

h2("Troubleshooting")
table([
    ["Symptom", "Likely cause", "What to do"],
    ["Customer did not receive an email",
     "Daily provider quota exhausted, or the address was mistyped",
     "Check the email log in admin; resend; verify the address"],
    ["Website shows an old version",
     "The visitor's installed app is running a cached build",
     "It self-updates on reopen. Ask them to close and reopen the app"],
    ["Order paid but customer says no confirmation",
     "Email failed; the order itself is fine",
     "Find the order in admin and read the status; resend"],
    ["Pickup code will not scan",
     "Already collected, expired, or the order is not marked ready",
     "The counter screen states which. Mark collected manually if needed"],
    ["A dish cannot be ordered",
     "Outside its serving hours, sold out, or the kitchen is closed",
     "The customer's screen states the reason; check the dish in /admin/food"],
    ["Stock looks wrong",
     "Stock is a ledger; the count is a cached total",
     "Inspect inventory_movements rather than editing the count"],
    ["Nothing appears on /food",
     "No dish is published; the page falls back to the concierge",
     "Publish a dish, or add <font face='Courier'>?preview=1</font>"],
], [37 * mm, 55 * mm, 65 * mm])
page()

# ═══════════════════════════════════════════════════════════════════════════
# 11. HANDOVER
# ═══════════════════════════════════════════════════════════════════════════
h1("11. New owner handover")

h2("Accounts to transfer")
table([
    ["Service", "Holds", "Priority"],
    ["Vercel", "Hosting, deployments, environment variables, cron", "Critical"],
    ["Supabase", "Database, auth, storage, all business data", "Critical"],
    ["GitHub", "Source code and history", "Critical"],
    ["Domain registrar", "roulerodrig.com", "Critical"],
    ["PayPal", "Rental and booking deposits", "Critical"],
    ["Resend / Brevo", "Transactional email", "High"],
    ["Sentry / PostHog", "Errors and product analytics", "Medium"],
    ["CallMeBot", "WhatsApp owner alerts", "Low"],
], [34 * mm, 90 * mm, 33 * mm])

h2("Environment variables")
p("Configured in Vercel. Values are secrets and are <b>not</b> reproduced here.")
table([
    ["Variable", "Purpose", "Required"],
    ["NEXT_PUBLIC_SUPABASE_URL", "Database endpoint", "Yes"],
    ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "Public client key", "Yes"],
    ["SUPABASE_SERVICE_ROLE_KEY", "Server-only; bypasses RLS", "Yes"],
    ["ADMIN_PASSWORD", "Admin dashboard sign-in", "Yes"],
    ["SESSION_SECRET", "Signs the admin cookie; rotating it logs everyone out", "Yes"],
    ["CRON_SECRET", "Authenticates the daily job", "Yes"],
    ["NEXT_PUBLIC_PAYPAL_CLIENT_ID / PAYPAL_SECRET / PAYPAL_ENV", "Deposits", "For deposits"],
    ["RESEND_API_KEY / RESEND_FROM", "Email provider A", "For email"],
    ["BREVO_API_KEY / BREVO_FROM / BREVO_LIST_ID", "Email provider B", "For email"],
    ["VAPID_PRIVATE_KEY / NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_SUBJECT", "Web push", "For push"],
    ["CALLMEBOT_APIKEY / CALLMEBOT_PHONE", "Owner WhatsApp alerts", "Optional"],
    ["NEXT_PUBLIC_SENTRY_DSN", "Error monitoring", "Recommended"],
    ["NEXT_PUBLIC_POSTHOG_KEY / _HOST", "Product analytics", "Optional"],
    ["NEXT_PUBLIC_SITE_URL", "Absolute links in email and SEO", "Yes"],
    ["OWNER_EMAIL / OWNER_PHONE / OWNER_WHATSAPP", "Where alerts go", "Recommended"],
], [56 * mm, 76 * mm, 25 * mm])

h2("Day-one security checklist")
bullets([
    "Rotate <b>ADMIN_PASSWORD</b> and <b>SESSION_SECRET</b>.",
    "Rotate the Supabase service-role key and all provider API keys.",
    "Review every user in Supabase Auth and remove any that are unknown.",
    "Enable leaked-password protection in Supabase Auth.",
    "Confirm database backups are enabled and test a restore.",
    "Confirm the daily cron is running and returning success.",
    "Transfer domain and DNS control.",
])

h2("Deployment")
p("Push to <b>main</b> and Vercel deploys automatically. There is no staging "
  "environment. Before pushing: run the test suite and a production build. "
  "Database changes are applied as tracked migrations. Roll back by reverting "
  "the commit — but note that a <b>database</b> migration does not roll back "
  "with the code, so schema changes must be written to be backwards-compatible.")

h2("Technical debt worth knowing about")
table([
    ["Item", "Impact"],
    ["The main admin file is ~7,200 lines",
     "Hard to navigate; risky to edit. Newer areas are already split into their "
     "own routes and that pattern should continue"],
    ["Service-worker cache version is incremented by hand",
     "It has collided between parallel work ten times. Deriving it from the "
     "commit hash at build time would end the problem"],
    ["Two content sources (defaults file and database row)",
     "A recurring source of confusion; the database always wins"],
    ["Some legacy tables are keyed by email rather than user id",
     "Reads for a signed-in customer need the service role"],
    ["A property-based pricing test is timing-sensitive",
     "Can fail under CPU load; not a product defect"],
], [62 * mm, 95 * mm])

h2("If you build one thing next")
p("<b>Add supply, not software.</b> The platform can already sell far more "
  "than it currently lists: three experience marketplaces have no providers, "
  "the delivery network has no drivers, and the food catalog holds a demo "
  "kitchen. The highest-return work is commercial — recruiting cooks, "
  "charters, therapists and drivers — followed by real admin accounts with "
  "roles once more than one person operates the platform.")

gap(10)
small(f"Roulé Rodrigues — Complete Platform &amp; Operations Manual · "
      f"Version {VERSION} · {TODAY}. Generated from the live system by "
      f"scripts/build-manual.py. Regenerate it after significant changes.")


# ═══════════════════════════════════════════════════════════════════════════
def decorate(canvas, doc):
    canvas.saveState()
    w, h = A4
    if doc.page == 1:
        canvas.setFillColor(INK)
        canvas.rect(0, h - 12 * mm, w, 12 * mm, stroke=0, fill=1)
        canvas.setFillColor(GOLD)
        canvas.rect(0, h - 13.6 * mm, w, 1.6 * mm, stroke=0, fill=1)
    else:
        canvas.setStrokeColor(RULE)
        canvas.setLineWidth(0.4)
        canvas.line(20 * mm, h - 14 * mm, w - 20 * mm, h - 14 * mm)
        canvas.setFont("Helvetica", 7.4)
        canvas.setFillColor(MUTED)
        canvas.drawString(20 * mm, h - 12 * mm, "ROULÉ RODRIGUES — PLATFORM & OPERATIONS MANUAL")
        canvas.drawRightString(w - 20 * mm, h - 12 * mm, f"v{VERSION}")
        canvas.line(20 * mm, 14 * mm, w - 20 * mm, 14 * mm)
        canvas.drawString(20 * mm, 10 * mm, TODAY)
        canvas.drawRightString(w - 20 * mm, 10 * mm, f"Page {doc.page}")
    canvas.restoreState()


doc = BaseDocTemplate(
    OUT, pagesize=A4,
    leftMargin=20 * mm, rightMargin=20 * mm,
    topMargin=20 * mm, bottomMargin=20 * mm,
    title="Roulé Rodrigues — Complete Platform & Operations Manual",
    author="Roulé Rodrigues",
    subject="Platform, operations and handover documentation",
)
frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="body")
doc.addPageTemplates([PageTemplate(id="all", frames=[frame], onPage=decorate)])
doc.build(story)
print(f"Wrote {OUT}")
