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
story.append(Paragraph("Premium scooter &amp; vehicle rentals · Rodrigues Island", TAGLINE))
story.append(Paragraph("Website &amp; system by Pezotech LTD", SMALL))
story.append(PageBreak())

# ── 1. Getting started ──
h1("1. Getting Started")
h2("Logging in")
bullets([
    "Open <b>roule-rodrig.vercel.app/admin</b> in any browser.",
    "Enter your admin password. (Stored securely in Vercel — never shared in the code.)",
    "On a phone, tap the <b>☰ menu</b> (top-left) to move between sections; it closes automatically when you pick one.",
])
h2("The Golden Rule — two kinds of sections")
p("This is the most important thing to understand:")
bullets([
    "<b>“Save Changes” sections (Content group):</b> you edit, then you MUST click the yellow <b>Save Changes</b> button (top-right) or your edits are lost. These are: Announcement, Hero, Fleet, Pricing, Contact Info, Featured Reviews, Island Map, Trip Planner, Ride Routes, Events, Useful Numbers, Sponsors, Branding.",
    "<b>Live sections (save instantly):</b> every action saves immediately, no button needed. These are: Dashboard, Bookings, Enquiries, Customer Reviews, Waitlist, Partners, Marketplace, Gallery.",
])
h2("Uploading photos")
p("Anywhere you see <b>Change Image / Upload</b>, choose a file from your phone or computer — it uploads automatically and the photo appears instantly. Use clear, bright, landscape photos for the best look.")

# ── 2. Overview ──
h1("2. Overview — Daily Running")
h2("Dashboard")
bullets([
    "Four stat cards: Total Bookings, Pending, Confirmed, Enquiries (tap one to jump there).",
    "<b>Today's Reminders</b>: tomorrow's pickups and today's returns, each with a green <b>WhatsApp</b> button to message that customer in one tap.",
    "Quick Actions: shortcuts to the most-used sections.",
])
h2("Bookings")
bullets([
    "Every booking request from the website, newest first.",
    "Change status: <b>Pending → Confirmed → Completed / Cancelled</b>.",
    "<b>Confirming a booking is the key action</b> — it blocks those dates on the public calendar and triggers the customer's reminder emails.",
    "Tap the email or phone to contact the customer directly.",
])
h2("Enquiries")
bullets([
    "Messages sent through the Contact form.",
    "Each has a 🗑️ delete button to clear out old/spam messages.",
])
h2("Customer Reviews")
bullets([
    "Reviews customers submit on the website wait here for your approval.",
    "Tabs: Pending / Approved / Rejected.",
    "<b>Approve</b> → it appears publicly in “Share Your Ride”. <b>Reject</b> → stays hidden. Nothing shows publicly until you approve it.",
])
h2("Waitlist")
bullets([
    "Emails captured from the “Stay in the loop” section.",
    "<b>Copy emails</b> (paste into a newsletter), <b>Export CSV</b>, or delete entries.",
])

# ── 3. Business ──
h1("3. Business — Make Money")
h2("Partners")
bullets([
    "Hotels / guesthouses / agencies that refer customers to you.",
    "Each gets a referral code and a commission %. When a booking uses their code you can track what you owe them.",
    "Toggle a partner active/inactive.",
])
h2("Marketplace")
bullets([
    "Local businesses (restaurants, tours, hotels, activities, shopping) shown in the “Local Deals” section.",
    "Per listing: name, category, description, special offer, photo, opening hours, contact, <b>WhatsApp number</b> and a <b>Google Maps link</b>.",
    "<b>WhatsApp / Directions buttons</b> appear on the card so tourists reach the business in one tap.",
    "<b>Service options:</b> Delivery / Pickup / Dine-in badges.",
    "<b>★ Featured</b> = appears first — this is your <b>paid placement</b> slot (charge businesses to be featured).",
    "<b>Active</b> toggle shows/hides a listing.",
])

# ── 4. Content ──
h1("4. Content — The Website Itself")
p("<i>Remember: these all need the <b>Save Changes</b> button.</i>")
h2("Announcement")
bullets([
    "The bold band at the very top of the site (with a megaphone + moving shine — hard to miss).",
    "Add <b>multiple messages</b> — they rotate automatically with dot indicators.",
    "Set the colour and toggle the whole bar on/off.",
])
h2("Hero")
p("The big opening screen: eyebrow text, the 3-line headline, the subheadline, and the background image.")
h2("Fleet (+ Vehicle Categories)")
bullets([
    "<b>Vehicle Categories panel</b> (top): turn Scooters / Cars / E-Bikes / Motorbikes / Bicycles / Kayaks ON or OFF. ON = shown on the site. Filter tabs appear automatically when 2+ categories have vehicles.",
    "Per vehicle: photo, name, badge, tagline, price, <b>category</b>, description, and an <b>Available / Unavailable</b> toggle.",
])
h2("Pricing")
p("The tariff table: daily / 3-day / weekly price per vehicle. Adding a vehicle in Fleet adds its row here.")
h2("Contact Info")
p("Phone, <b>WhatsApp number(s)</b> (you can add several), email, location and opening hours. This is where you set the real WhatsApp number that powers the green floating button.")
h2("Gallery")
p("Upload photos → they appear automatically in the website gallery. (Saves instantly.)")
h2("Featured Reviews")
p("Hand-picked testimonials you write yourself (separate from customer-submitted reviews). Name, origin, star rating, text.")
h2("Island Map")
bullets([
    "The map dots: name, category (the dot colour), coordinates, description, and a <b>photo</b>.",
    "On the site, tapping a place opens Google Maps directions (distance + the visitor's live location) and shows your photo.",
])
h2("Trip Planner")
bullets([
    "The real Rodrigues places the AI arranges into day-by-day itineraries.",
    "Per place: name, emoji, category, time of day, duration, description, insider tip, and a <b>photo</b> (opens full-screen when tapped).",
    "You control the content; the planner still builds the schedule automatically.",
])
h2("Ride Routes")
p("Curated scenic scooter routes: name, difficulty, distance, duration, description, stops (one per line), a <b>Google Maps link</b>, and a photo.")
h2("Events")
p("Festivals / markets: title, date (free text like “Every Saturday”), description, location, photo. The section stays hidden until you add at least one.")
h2("Useful Numbers")
p("A tap-to-call directory grouped Emergency / Taxi / Other. Add your taxi partners here. Entries with a placeholder number (XXXX) stay hidden until you set a real one.")
h2("Sponsors / Ads")
bullets([
    "A strip of sponsor logos near the footer — sell these slots to local businesses.",
    "Master ON/OFF toggle for the whole strip, plus show/hide each sponsor.",
    "Per sponsor: logo, optional link.",
])
h2("Branding & Social")
p("Upload your logo (replaces the text wordmark) and add Instagram / Facebook / TikTok / WhatsApp links for the footer.")

# ── 5. Step-by-step ──
h1("5. Common Tasks — Step by Step")
h2("Add a car (or any new vehicle type)")
bullets([
    "Fleet → Vehicle Categories → turn ON “Cars”.",
    "Add a vehicle, set its category to Cars, give it a price and photo.",
    "Pricing → set its daily / 3-day / weekly rate. <b>Save Changes.</b>",
    "A “Cars” filter tab now appears on the site, and it shows in the booking calendar.",
])
h2("Confirm a booking")
bullets([
    "Bookings → find the request → click <b>Confirmed</b>.",
    "Those dates are now blocked on the public calendar; the customer gets a reminder before pickup (if email is set up).",
])
h2("Approve a customer review")
bullets([
    "Customer Reviews → Pending tab → <b>Approve</b>. It appears publicly straight away.",
])
h2("Add a restaurant with WhatsApp + directions")
bullets([
    "Marketplace → New Listing → fill name, offer, photo.",
    "Add the WhatsApp number, opening hours and a Google Maps link.",
    "(Optional) tick Delivery / Pickup / Dine-in and ★ Featured. Save.",
])
h2("Set the real WhatsApp number (floating button)")
bullets([
    "Contact Info → WHATSAPP / PHONE → enter your number with the country code, e.g. <b>+230 5912 3456</b>.",
    "<b>Save Changes.</b> The green button appears immediately. (It stays hidden while the number is a placeholder.)",
])

# ── 6. Behind the scenes ──
h1("6. Behind the Scenes (one-time setup)")
h2("Publishing changes")
p("Content you edit in the admin saves to the database and appears on the live site immediately. Code/design changes are deployed automatically by Vercel when updated.")
h2("Turn on Analytics (free)")
p("Vercel dashboard → your project → <b>Analytics</b> tab → Enable. Then the <b>Speed Insights</b> tab → Enable. You'll see visitor numbers and load speed.")
h2("Google visibility")
bullets([
    "<b>Search Console</b>: verified via a meta tag. Submit the sitemap (sitemap.xml). “Couldn't fetch” right after submitting is normal — it fixes itself in 1–2 days.",
    "<b>Google Business Profile</b>: create one at business.google.com — this is what puts you on Google Maps for tourists.",
])
h2("Turn on automatic emails (optional)")
bullets([
    "In Vercel → Settings → Environment Variables, add <b>RESEND_API_KEY</b> (free key from resend.com) and <b>OWNER_EMAIL</b>.",
    "Then booking confirmations + “pickup tomorrow / return today” reminder emails send automatically. Without the key, bookings still work — only the auto-emails wait.",
])
h2("Custom domain")
p("When you connect a domain like roulerodrigues.mu, add the env var <b>NEXT_PUBLIC_SITE_URL=https://roulerodrigues.mu</b> in Vercel — sitemap, share links and SEO update automatically.")

# ── 7. Troubleshooting ──
h1("7. Troubleshooting")
tbl_data = [
    ["Problem", "Fix"],
    ["WhatsApp button doesn't show", "Set a real number (no XXXX) in Contact Info and Save."],
    ["A photo shows as a broken icon", "The image file is missing — re-upload it in the relevant admin section."],
    ["Booking emails not sending", "Add RESEND_API_KEY + OWNER_EMAIL in Vercel (see section 6)."],
    ["Sitemap “couldn't fetch” in Google", "Normal right after submitting — wait 1–2 days, it flips to Success."],
    ["A new section isn't on the site", "Empty sections (Events, Sponsors, etc.) stay hidden until you add content / toggle on."],
    ["Edits disappeared", "You were in a Content section and didn't click Save Changes."],
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

# ── 8. Roadmap ──
h1("8. What's Next (roadmap ideas)")
p("Bigger features that can be built when you're ready — each is its own project:")
bullets([
    "<b>Multi-photo galleries</b> everywhere (several photos per vehicle / place, with delete).",
    "<b>Online deposit / payment</b> (MCB Juice, MIPS or Stripe) to take real reservations.",
    "<b>P2P Taxi / Tourism Mobility marketplace</b> — drivers register, tourists book, you take a commission.",
    "<b>Hotel Partner Network</b> — referral links + QR posters, hotel dashboards, leaderboard and automatic payouts.",
])

story.append(Spacer(1, 20))
story.append(HRFlowable(width="100%", thickness=1, color=HexColor(0xDDDDDD)))
story.append(Spacer(1, 6))
story.append(Paragraph("Roule Rodrigues Owner's Manual · Keep this handy. Questions? Your developer can extend any section.", SMALL))

doc = SimpleDocTemplate(
    r"C:\Users\ninja\OneDrive\Bureau\Roule Rodrigues\roule-rodrigues\public\owners-manual.pdf",
    pagesize=A4, topMargin=20*mm, bottomMargin=18*mm, leftMargin=20*mm, rightMargin=20*mm,
    title="Roule Rodrigues — Owner's Manual", author="Pezotech LTD",
)
doc.build(story)
print("PDF written")
