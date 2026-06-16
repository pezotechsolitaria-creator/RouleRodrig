# Generates the Roule Rodrigues Owner's Manual PDF.
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor, white
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle,
    HRFlowable, ListFlowable, ListItem,
)

GOLD = HexColor(0xF5C842)
DARK = HexColor(0x111111)
GREY = HexColor(0x555555)
LIGHT = HexColor(0xF3F1EA)

styles = getSampleStyleSheet()
H1 = ParagraphStyle("H1", parent=styles["Heading1"], fontName="Helvetica-Bold",
                    fontSize=17, textColor=DARK, spaceBefore=18, spaceAfter=4, leading=20)
H2 = ParagraphStyle("H2", parent=styles["Heading2"], fontName="Helvetica-Bold",
                    fontSize=12.5, textColor=HexColor(0x1a1a1a), spaceBefore=12, spaceAfter=3, leading=15)
BODY = ParagraphStyle("Body", parent=styles["Normal"], fontName="Helvetica",
                      fontSize=10, textColor=HexColor(0x222222), leading=15, spaceAfter=6)
BUL = ParagraphStyle("Bul", parent=BODY, leftIndent=4, spaceAfter=2)
SMALL = ParagraphStyle("Small", parent=BODY, fontSize=8.5, textColor=GREY)
TAGLINE = ParagraphStyle("Tag", parent=BODY, fontSize=11, textColor=GREY, alignment=TA_CENTER, leading=16)

story = []

def h1(t):
    story.append(Paragraph(t, H1))
    story.append(HRFlowable(width="100%", thickness=2, color=GOLD, spaceBefore=2, spaceAfter=8))

def h2(t):
    story.append(Paragraph(t, H2))

def p(t):
    story.append(Paragraph(t, BODY))

def bullets(items):
    story.append(ListFlowable(
        [ListItem(Paragraph(i, BUL), leftIndent=10, value="•") for i in items],
        bulletType="bullet", start="•", leftIndent=14, bulletColor=GOLD, spaceAfter=6,
    ))

def spacer(h=6):
    story.append(Spacer(1, h))

# ── Cover ──
story.append(Spacer(1, 120))
story.append(Paragraph("ROULE RODRIGUES", ParagraphStyle("c", parent=styles["Title"], fontSize=34, textColor=DARK, alignment=TA_CENTER, leading=38)))
story.append(Paragraph("OWNER'S MANUAL", ParagraphStyle("c2", parent=styles["Title"], fontSize=20, textColor=GOLD, alignment=TA_CENTER, spaceBefore=6)))
story.append(Spacer(1, 16))
story.append(Paragraph("Your complete guide to running the website &amp; admin dashboard", TAGLINE))
story.append(Spacer(1, 40))
story.append(HRFlowable(width="40%", thickness=2, color=GOLD, hAlign="CENTER"))
story.append(Spacer(1, 16))
story.append(Paragraph("Premium scooter &amp; vehicle rental marketplace · Rodrigues Island", TAGLINE))
story.append(Paragraph("Edition 2 · June 2026", SMALL))
story.append(PageBreak())

# ── 1. Getting started ──
h1("1. Getting Started")
h2("Logging in")
bullets([
    "Open <b>roule-rodrig.vercel.app/admin</b> in any browser.",
    "Enter your admin password. It is set by the <b>ADMIN_PASSWORD</b> env var in Vercel — never written in the code.",
    "Sessions now expire after 30 days and log out automatically if you change the password.",
    "On a phone, tap the <b>☰ menu</b> (top-left) to move between sections; it closes when you pick one.",
])
h2("The Golden Rule — two kinds of sections")
p("This is the most important thing to understand:")
bullets([
    "<b>“Save Changes” sections (Content group):</b> edit, then click the yellow <b>Save Changes</b> button (top-right) or edits are lost. These are: Announcement, Hero, Fleet, Pricing, Contact Info, Featured Reviews, Island Map, Trip Planner, Ride Routes, <b>Getting Around</b>, <b>Stay·Eat·Do</b>, <b>FAQ</b>, Events, Useful Numbers, Sponsors, Branding.",
    "<b>Live sections (save instantly):</b> every action saves immediately. These are: Dashboard, Bookings, Enquiries, Customer Reviews, Waitlist, <b>Listing Leads</b>, <b>Owner Applications</b>, Partners, Marketplace, <b>Taxi &amp; Transport</b>, Gallery.",
])
h2("Uploading photos")
p("Anywhere you see <b>Upload / Add photos</b>, choose files from your phone or computer — they upload automatically. Many sections now accept <b>several photos</b>: the first is the cover, you can reorder or ★-set the cover, and remove any photo with the × button.")

# ── 2. Overview ──
h1("2. Overview — Daily Running")
h2("Dashboard")
bullets([
    "Stat cards: Total Bookings, Pending, Confirmed, Enquiries (tap one to jump there).",
    "<b>Today's Reminders</b>: tomorrow's pickups and today's returns, each with a green <b>WhatsApp</b> button.",
    "Quick Actions: shortcuts to the most-used sections.",
])
h2("Bookings")
bullets([
    "Every booking request from the website, newest first.",
    "Change status: <b>Pending → Confirmed → Completed / Cancelled</b>.",
    "<b>Confirming a booking is the key action</b> — it blocks those dates on the public calendar and triggers reminder emails.",
    "Per-vehicle <b>Units</b> are respected: a date only shows ‘full’ once every unit of that model is booked.",
])
h2("Enquiries & Customer Reviews")
bullets([
    "<b>Enquiries</b>: messages from the Contact form, each with a 🗑️ delete button.",
    "<b>Customer Reviews</b>: customer-submitted scooter reviews wait here. Approve → shows publicly; Reject → hidden.",
])
h2("Waitlist")
bullets([
    "Emails captured from the “Stay in the loop” section.",
    "<b>Copy emails</b>, <b>Export CSV</b>, or delete entries.",
])
h2("Listing Leads (NEW)")
bullets([
    "Counts every <b>Book / Enquire</b> tap on a Stay·Eat·Do listing and every <b>WhatsApp / Call</b> tap on a taxi driver.",
    "Shows totals, a per-listing breakdown (last 30 days + all-time) and recent activity.",
    "Use these numbers to <b>invoice businesses</b> for featured placement or pay-per-lead.",
])
h2("Owner Applications (NEW)")
bullets([
    "Scooter owners who applied through <b>/list-your-scooter</b> land here.",
    "See their contact, area and scooters; tap WhatsApp/email to reach them; <b>Approve / Reject</b> or delete.",
])

# ── 3. Business ──
h1("3. Business — Make Money")
h2("Partners + referral toolkit")
bullets([
    "Hotels / guesthouses / agencies that refer customers. Each gets a referral code and a commission %.",
    "Open a partner to see their <b>Referral Toolkit</b>: a trackable link (<b>?ref=CODE</b>), an auto-generated <b>QR poster</b>, copy-link and WhatsApp-share buttons.",
    "Anyone who scans/clicks is attributed automatically — the booking form fills their code in for them (no typing).",
    "Send the hotel their <b>Partner Dashboard</b> link (<b>/partner?code=CODE</b>) so they track their own bookings &amp; earnings — no login.",
])
h2("Marketplace (Local Deals)")
bullets([
    "Local businesses shown in “Local Deals”: name, category, description, offer, photo, hours, contact, WhatsApp, Google Maps link.",
    "Service options (Delivery / Pickup / Dine-in) and a <b>★ Featured</b> paid-placement slot.",
])
h2("Stay · Eat · Do (NEW)")
bullets([
    "A curated hotels / restaurants / activities section, separate from Local Deals — with a <b>master ON/OFF toggle</b>.",
    "Per place: photo, category, description, optional website/Maps link and a <b>WhatsApp number</b> (adds a “Book / Enquire” button).",
    "Mark any place <b>Sponsored</b> → it sorts first with a gold badge (your paid-placement slot).",
    "Every Book/Enquire click is recorded in <b>Listing Leads</b>.",
])
h2("Taxi & Transport (NEW)")
bullets([
    "A directory of independent local drivers shown at <b>/taxi</b> (linked in the top nav).",
    "Per driver: photo, vehicle, areas, languages, starting rate, WhatsApp/phone, and a <b>★ Featured</b> top slot.",
    "<b>Driver reviews</b>: tourists rate drivers 1–5★; reviews wait for your approval in the same section.",
    "Every WhatsApp/Call tap is recorded in Listing Leads. <b>Note:</b> you are a scooter-rental platform — taxis are listed for convenience only (the page carries a disclaimer).",
])

# ── 4. Content ──
h1("4. Content — The Website Itself")
p("<i>Remember: everything in this group needs the <b>Save Changes</b> button.</i>")
h2("Announcement")
bullets([
    "The bold band at the very top (megaphone + moving shine).",
    "Add <b>multiple messages</b> that rotate; set the colour; toggle on/off.",
])
h2("Hero")
p("The big opening screen: eyebrow, the 3-line headline, subheadline, background image.")
h2("Fleet (+ Categories + Units)")
bullets([
    "<b>Vehicle Categories panel</b>: turn Scooters / Cars / E-Bikes / Motorbikes / Bicycles / Kayaks ON or OFF. Filter tabs appear when 2+ categories have vehicles.",
    "Per vehicle: <b>several photos</b>, name, badge, tagline, price, category, <b>Units (how many you own)</b>, description, and an Available/Unavailable toggle.",
])
h2("Pricing · Contact · Gallery · Featured Reviews")
bullets([
    "<b>Pricing</b>: daily / 3-day / weekly tariff per vehicle.",
    "<b>Contact Info</b>: phone, one or more WhatsApp numbers, email, location, hours — powers the green floating button + booking confirmation.",
    "<b>Gallery</b>: upload photos for the site gallery (saves instantly).",
    "<b>Featured Reviews</b>: testimonials you write yourself (separate from customer reviews).",
])
h2("Island Map · Getting Around")
bullets([
    "<b>Island Map</b>: points of interest (name, category, coordinates, description, photo). Tapping a place on the site opens Google Maps directions.",
    "<b>Getting Around (NEW)</b>: the bus / taxi / scooter comparison card. Toggle on/off; edit each option's icon, text and button; mark one as the highlighted “Best way”.",
])
h2("Stay·Eat·Do · FAQ")
bullets([
    "<b>Stay·Eat·Do</b>: see Business above — edited here too (toggle, title, places, Sponsored, WhatsApp).",
    "<b>FAQ (NEW)</b>: questions &amp; answers shown on the site (also boosts Google with rich results). Toggle, reorder, add/remove. Ships with sensible scooter-rental defaults — edit the insurance/fuel/deposit wording to match your real policy.",
])
h2("Trip Planner · Ride Routes · Events · Useful Numbers")
bullets([
    "<b>Trip Planner</b>: the real places the AI arranges into itineraries (name, emoji, slot, duration, tip, photo).",
    "<b>Ride Routes</b>: scenic routes with stops + a Google Maps link + photo.",
    "<b>Events</b>: festivals/markets (hidden until you add one).",
    "<b>Useful Numbers</b>: tap-to-call Emergency / Taxi / Other directory.",
])
h2("Sponsors / Ads · Branding & Social")
bullets([
    "<b>Sponsors</b>: a logo strip near the footer with a master toggle — sell these slots.",
    "<b>Branding</b>: upload your logo and add Instagram / Facebook / TikTok / WhatsApp links.",
])

# ── 5. Legal & Trust ──
h1("5. Legal & Trust")
h2("Your legal pages")
bullets([
    "Four public pages, linked in the footer: <b>Terms &amp; Conditions</b>, <b>Privacy Policy</b>, <b>Refund &amp; Cancellation</b>, <b>Disclaimer</b>.",
    "Plus a <b>Scooter Owner Agreement</b> (linked from the partner onboarding page).",
    "They establish the key point: you only facilitate <b>scooter rentals</b> — you are <b>not</b> a taxi/transport/travel operator, and taxi + Stay·Eat·Do listings are informational only.",
])
p("<b>Important:</b> these are clear, ready-to-use templates — have them reviewed by a professional familiar with Mauritius/Rodrigues law before you take real payments.")
h2("Booking acceptance")
p("The booking form has a required <b>“I agree to the Terms &amp; Rental Policy”</b> checkbox — a guest cannot submit until they tick it, which protects you on every booking.")
h2("Recruiting scooter owners")
bullets([
    "Share <b>/list-your-scooter</b> — owners read the benefits, accept the Owner Agreement and apply.",
    "Applications appear in <b>Owner Applications</b> for you to approve and onboard.",
])

# ── 6. Step-by-step ──
h1("6. Common Tasks — Step by Step")
h2("Confirm a booking")
bullets([
    "Bookings → find the request → click <b>Confirmed</b>. Dates are blocked; the customer gets a reminder before pickup.",
])
h2("Give a hotel its referral kit")
bullets([
    "Partners → add the hotel → open it → Referral Toolkit.",
    "Print the QR for their reception and send them the link + their <b>/partner</b> dashboard link.",
])
h2("Add a place to Stay·Eat·Do and make it sponsored")
bullets([
    "Stay·Eat·Do → Add Place → category, photo, description, WhatsApp.",
    "Tap <b>Make sponsored</b> → it jumps to the top with a badge. <b>Save Changes.</b>",
])
h2("See how many taxi/Stay·Eat·Do leads you got")
bullets([
    "Listing Leads → read the per-listing 30-day and all-time counts → invoice accordingly.",
])
h2("Set the real WhatsApp number (floating button)")
bullets([
    "Contact Info → enter your number with country code, e.g. <b>+230 5912 3456</b>. <b>Save Changes.</b>",
])

# ── 7. Behind the scenes ──
h1("7. Behind the Scenes (one-time setup)")
h2("Environment variables in Vercel")
bullets([
    "<b>ADMIN_PASSWORD</b> — your admin login (required; no default in production).",
    "<b>SUPABASE_SERVICE_ROLE_KEY</b> — secret key that lets the admin read/write data securely. <b>Required</b> now that the database is locked down.",
    "<b>SESSION_SECRET</b> (optional) — rotate it to instantly log out all admin sessions.",
    "<b>RESEND_API_KEY</b> + <b>OWNER_EMAIL</b> (optional) — turns on booking confirmation + reminder emails.",
    "<b>NEXT_PUBLIC_SITE_URL</b> — set this when you connect a custom domain (updates sitemap, share links, SEO).",
])
h2("Security (already done for you)")
bullets([
    "The database is protected so the public can only do what's intended (submit a booking/review/enquiry, read public content) — no one can read your customer data or change the site.",
    "Security headers, rate limiting (anti-brute-force/spam) and a constant-time login are all in place.",
    "Health check: <b>/api/health</b> — point an uptime monitor at it to be alerted if the site or database goes down.",
])
h2("Analytics & Google")
bullets([
    "Vercel → your project → <b>Analytics</b> + <b>Speed Insights</b> tabs → Enable. The Analytics → <b>Events</b> tab shows lead/contact clicks.",
    "<b>Search Console</b>: verified; submit sitemap.xml (a “couldn't fetch” right after is normal). Create a <b>Google Business Profile</b> to appear on Maps.",
])

# ── 8. Troubleshooting ──
h1("8. Troubleshooting")
tbl_data = [
    ["Problem", "Fix"],
    ["Admin won't save / login fails", "Make sure ADMIN_PASSWORD and SUPABASE_SERVICE_ROLE_KEY are set in Vercel, then redeploy."],
    ["WhatsApp button doesn't show", "Set a real number (no XXXX) in Contact Info and Save."],
    ["A photo shows as a broken icon", "The image file is missing — re-upload it in the relevant section."],
    ["Booking emails not sending", "Add RESEND_API_KEY + OWNER_EMAIL in Vercel (section 7)."],
    ["A new section isn't on the site", "Empty/!toggled sections (Stay·Eat·Do, Events, FAQ…) stay hidden until you add content / toggle on."],
    ["Edits disappeared", "You were in a Content section and didn't click Save Changes."],
    ["Leads show 0", "They only count once visitors tap Book/Enquire or contact a driver."],
]
t = Table(tbl_data, colWidths=[60*mm, 105*mm])
t.setStyle(TableStyle([
    ("BACKGROUND", (0,0), (-1,0), DARK),
    ("TEXTCOLOR", (0,0), (-1,0), GOLD),
    ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"),
    ("FONTNAME", (0,1), (-1,-1), "Helvetica"),
    ("FONTSIZE", (0,0), (-1,-1), 9),
    ("TEXTCOLOR", (0,1), (-1,-1), HexColor(0x222222)),
    ("ROWBACKGROUNDS", (0,1), (-1,-1), [white, LIGHT]),
    ("GRID", (0,0), (-1,-1), 0.5, HexColor(0xDDDDDD)),
    ("VALIGN", (0,0), (-1,-1), "TOP"),
    ("LEFTPADDING", (0,0), (-1,-1), 8),
    ("RIGHTPADDING", (0,0), (-1,-1), 8),
    ("TOPPADDING", (0,0), (-1,-1), 7),
    ("BOTTOMPADDING", (0,0), (-1,-1), 7),
]))
story.append(t)

# ── 9. Roadmap ──
h1("9. What's Next (roadmap ideas)")
p("Bigger features for when you're ready — each is its own project:")
bullets([
    "<b>Online deposit / payment</b> (MCB Juice, MIPS or Stripe) — take real reservations + automate commission and refunds. The biggest next step.",
    "<b>Booking add-ons / upsells</b> — extra helmet, hotel delivery, GoPro, raising the average order value.",
    "<b>Blog / island guides</b> for SEO — pull free Google traffic using your planner content.",
    "<b>Lead dashboard → invoicing</b> — turn the Listing Leads counts into automatic monthly invoices for businesses.",
])

story.append(Spacer(1, 20))
story.append(HRFlowable(width="100%", thickness=1, color=HexColor(0xDDDDDD)))
story.append(Spacer(1, 6))
story.append(Paragraph("Roule Rodrigues Owner's Manual · Edition 2 · Keep this handy. Your developer can extend any section.", SMALL))

doc = SimpleDocTemplate(
    r"C:\Users\ninja\OneDrive\Bureau\Roule Rodrigues\roule-rodrigues\public\owners-manual.pdf",
    pagesize=A4, topMargin=20*mm, bottomMargin=18*mm, leftMargin=20*mm, rightMargin=20*mm,
    title="Roule Rodrigues - Owner's Manual", author="Roule Rodrigues",
)
doc.build(story)
print("PDF written")
