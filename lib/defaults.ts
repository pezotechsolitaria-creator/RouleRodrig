// Client-safe: types and default content only — no Node.js imports

/** One clip in the hero. Owner-managed from /admin → Hero. */
export interface HeroVideo {
  /** Stable id so reordering and removal do not depend on array position. */
  id: string;
  /** Public URL in the `hero-video` bucket, or any direct video URL. */
  url: string;
  /**
   * Still shown before the video can paint — the FIRST thing a visitor sees on
   * a slow island connection, and what they keep seeing if the clip never
   * loads. Falls back to hero.backgroundImage when empty.
   */
  poster?: string;
  enabled?: boolean;
}

export interface HeroContent {
  eyebrow: string;
  eyebrowFr?: string;
  eyebrowCr?: string;
  headline: [string, string, string];
  headlineFr?: [string, string, string];
  headlineCr?: [string, string, string];
  subheadline: string;
  subheadlineFr?: string;
  subheadlineCr?: string;
  /**
   * Still image behind the hero. NOT replaced by video — it is the poster and
   * the fallback. Video is an enhancement on top of a hero that must still work
   * with no video, a failed decode, or Data Saver on.
   */
  backgroundImage: string;
  /**
   * Owner's own footage, newest first. Empty (or all disabled) means the hero
   * behaves exactly as it did before this feature existed.
   */
  videos?: HeroVideo[];
}

export interface StatItem {
  value: number;
  suffix: string;
  label: string;
}

export interface FleetAsset {
  id: string;       // stable unique id for this physical unit
  label: string;    // what the owner calls it, e.g. "Avenis — Yellow"
  color?: string;   // optional colour for quick visual ID
  plate?: string;   // optional number plate
  active?: boolean;  // false = temporarily out of service (repair etc.)
}

export interface FleetItem {
  id: string;
  badge: string;
  name: string;
  tagline: string;
  taglineFr?: string;     // optional French / Creole translations (admin-filled)
  taglineCr?: string;
  description: string;
  descriptionFr?: string;
  descriptionCr?: string;
  image: string;          // legacy cover image (kept for backward compat)
  images?: string[];      // optional gallery — multiple photos/angles
  price: string;
  unit: string;
  available: boolean;
  units?: number;         // how many of this model you own (for availability)
  assets?: FleetAsset[];  // individual physical units — enables exact asset tracking
  soldOutToday?: boolean; // computed at request time: every unit is out on a trip today
  category?: string; // vehicle category id, e.g. "scooter"
  /**
   * Body style WITHIN the category — "suv", "sedan", "4x4". Optional, and a
   * vehicle without one is never hidden: it simply doesn't answer any type
   * filter. See VehicleType for why this is a second field rather than more
   * categories.
   */
  type?: string;
  specs?: string[];       // spec chips (e.g. "Air conditioning", "5 seats") — category-appropriate
  included?: string[];    // what's included (e.g. "Full tank of fuel") — category-appropriate
}

/**
 * A body style inside a category — SUV, Sedan, 4x4, Van for cars; Automatic or
 * 125cc for scooters.
 *
 * Deliberately NOT more VehicleCategories. A category is a top-level product
 * line: it owns a /browse/… page, a delivery fee, a deposit rule and a slot in
 * the site nav. "SUV" is none of those — it is a way of narrowing the cars you
 * are already looking at. Modelling it as a category would have put SUVs in the
 * sitemap as their own destination and split one delivery fee into four.
 */
export interface VehicleType {
  id: string;
  label: string;    // shown as the filter chip, e.g. "SUV"
  enabled: boolean; // off = keep the tag on the vehicles but stop offering the filter
}

export interface VehicleCategory {
  id: string;
  label: string;    // shown as the filter tab, e.g. "Scooters", "Cars"
  enabled: boolean; // show this category on the website
  /**
   * What delivery + collection costs for this class of vehicle, in whole
   * rupees, for the WHOLE rental (drop-off and pickup together — that is what
   * the customer sees on the summary line).
   *
   * Undefined means "never set in admin", and falls back to the rule that was
   * hardcoded until 2026-08-13: cars free, everything else Rs 400. Zero is a
   * real, owner-chosen answer meaning free — which is exactly why this must
   * stay `?: number` and be read with an undefined check, never `|| DEFAULT`.
   */
  deliveryFee?: number;
  /**
   * How much of the total confirms a booking, as a percentage. The rest is
   * settled at pickup.
   *
   * Hardcoded until 2026-08-13 as cars 50 / everything else 25 — numbers the
   * owner could see the effect of but never change. Undefined keeps exactly
   * that rule, so a category he has not opened behaves as it always did.
   *
   * 100 is a legitimate value and means "pay in full to confirm". 0 is not
   * allowed through the admin field, because a booking that reserves a vehicle
   * while costing nothing is how you lose a scooter to a no-show.
   */
  depositPct?: number;
  /** Body styles offered inside this category. */
  types?: VehicleType[];
}

export interface PricingRow {
  name: string;
  prices: [string, string, string];
}

export interface WhatsAppNumber {
  label: string;   // e.g. "Bookings", "Support", "English line"
  number: string;  // full international format, e.g. +230 5912 3456
}

export interface ContactContent {
  phone: string;
  email: string;
  location: string;
  hours: string;
  whatsappNumbers: WhatsAppNumber[];
}

export interface GalleryImage {
  id: string;
  src: string;
  alt: string;
  uploadedAt: string;
}

export interface TestimonialItem {
  id: string;
  name: string;
  origin: string;
  rating: number;
  text: string;
}

export interface SocialLinks {
  instagram: string;
  facebook: string;
  tiktok: string;
  whatsapp: string;
}

export interface BrandingContent {
  /**
   * ── THE GATEWAY PHOTOGRAPHS ────────────────────────────────────────────────
   *
   * The two images on the first-visit world chooser. These are the most
   * important pictures on the site — they are the entire argument for why the
   * two worlds are different — so they must be changeable from /admin without
   * a deploy.
   *
   * Both optional. An empty value falls back to the OG image, so the gateway
   * can never render a broken panel; it simply shows the two worlds with the
   * same picture until the owner uploads better ones.
   */
  gatewayAuthenticImage?: string;
  gatewayCuratedImage?: string;
  /**
   * The full lockup — the detailed illustrated logo with the tagline.
   *
   * Kept as a brand asset for LARGE placements (print, merch, a future
   * about-page hero). Deliberately NOT what the navbar, footer or email header
   * use any more: every one of those renders at 36–38px tall, where a logo
   * carrying "TOURS · RENTALS · ACTIVITIES · EXPERIENCES" is an unreadable
   * smudge. Measured, not assumed — see logoMark.
   */
  logo: string;
  /**
   * The icon mark — the simple square scooter-and-tortoise badge.
   *
   * Used by every small surface: navbar, footer, email header, favicon and the
   * PWA icons. Falls back to `logo` when unset, so nothing breaks before the
   * mark is uploaded.
   *
   * Should be SQUARE and at least 512×512. It is also the source the PWA icons
   * are generated from, and Android masks those to a circle — so keep the
   * artwork inside the central ~80% or the edges get clipped (which is exactly
   * how the home-screen icon lost the end of its wordmark).
   */
  logoMark?: string;
  mascotImage?: string; // Ti Roulé mascot — a transparent-background character PNG (default pose)
  mascotPoses?: Record<string, string>; // pose key (see lib/mascot.ts) -> image URL
}

export interface AnnouncementItem {
  text: string;
  link: string;
  linkText: string;
}

export interface AnnouncementContent {
  active: boolean;
  text: string;      // legacy single message (kept as fallback)
  link: string;
  linkText: string;
  bgColor: string;   // e.g. "yellow" | "green" | "blue" | "red"
  items?: AnnouncementItem[]; // multiple rotating messages
}

export interface MapLocation {
  id: string;
  name: string;
  nameFr?: string;
  nameCr?: string;
  description: string;
  descriptionFr?: string;
  descriptionCr?: string;
  category: "beach" | "viewpoint" | "restaurant" | "landmark" | "activity" | "gas" | "shop";
  lat: number;
  lng: number;
  image?: string;    // cover photo (kept in sync with images[0])
  images?: string[]; // photo gallery shown in the map popup + location list
  story?: string;    // Ti Roulé's short researched story about the place
  storyFr?: string;
  storyCr?: string;
}

export interface PlannerActivity {
  id: string;
  name: string;
  nameFr?: string;
  nameCr?: string;
  emoji: string;
  type: "beach" | "culture" | "adventure" | "viewpoint" | "food";
  slot: "morning" | "afternoon" | "evening" | "lunch";
  duration: string;
  description: string;
  descriptionFr?: string;
  descriptionCr?: string;
  tip: string;
  tipFr?: string;
  tipCr?: string;
  story?: string;   // Ti Roulé's story (from the linked map location)
  storyFr?: string;
  storyCr?: string;
  image?: string;   // cover photo shown in the itinerary card
  images?: string[]; // the rest of the gallery, opened from the cover
  mapsUrl?: string; // precise Google Maps link (else the planner searches by name)
}

export interface RideRoute {
  id: string;
  name: string;
  nameFr?: string;
  nameCr?: string;
  description: string;
  descriptionFr?: string;
  descriptionCr?: string;
  distance: string;   // e.g. "32 km"
  duration: string;   // e.g. "2–3 hrs"
  difficulty: "Easy" | "Moderate" | "Advanced";
  stops: string;      // newline-separated list of stops
  mapsUrl: string;    // Google Maps link (rides) or Wikiloc GPS track (trails)
  linkLabel?: string; // custom CTA label, e.g. "View trail on Wikiloc"
  image?: string;
  /** Gallery. `image` stays the cover, so every existing route keeps working. */
  images?: string[];
  featured?: boolean; // pinned to top + gold border
  kind?: "ride" | "hike"; // scooter ride (default) vs hiking/adventure trail

  // ── Hiking-only fields (kind === "hike") ──────────────────────────────────
  //
  // A trail and a scooter ride are not the same object wearing two labels. A
  // rider wants a distance and a Maps link; a walker wants to know how much of
  // that distance is UP, whether the path ends where it started, and whether
  // there is any shade or water on an island where the answer is usually "no".
  // /guide/routes even claimed to publish "real distances, elevation and
  // timings" — there was no elevation field, so it never could.
  //
  // All optional and all additive: every route already saved keeps working and
  // renders exactly as before, and a ride simply leaves them blank. They are
  // hidden in the admin editor until TYPE is set to a trail, so the rides form
  // does not grow nine fields it will never use.
  /** Total ascent, e.g. "320 m". Distance alone says nothing about a climb. */
  elevation?: string;
  /** Where the walk actually begins, e.g. "Car park at Grande Montagne". */
  trailhead?: string;
  /** Whether you end up back at the trailhead — decides if a lift is needed. */
  routeShape?: "Loop" | "Out and back" | "One way";
  /** Underfoot, e.g. "Basalt rock and loose gravel". */
  terrain?: string;
  /** Rodrigues ridges are mostly bare; say so rather than let people assume. */
  shade?: "None" | "Some" | "Shaded";
  /** True only if there is drinkable water ON the trail. Default assumption: none. */
  waterOnRoute?: boolean;
  /** e.g. "Start before 8am — the ridge has no cover by midday". */
  bestTime?: string;
  /** Reserves such as Grande Montagne are not walked unaccompanied. */
  guideRequired?: boolean;
  /** Permit/booking detail shown when a guide or fee is involved. */
  permitNote?: string;
}

export interface Sponsor {
  id: string;
  name: string;
  image: string;   // logo
  link: string;    // website
  enabled: boolean;
  description?: string; // short one-liner shown on the card
  category?: string;    // e.g. "Hotel", "Bank", "Restaurant" — shown as a chip
  featured?: boolean;   // → "Official Partner" badge (else "Trusted Partner")
  banner?: string;      // optional wide banner image
}

export interface UsefulContact {
  id: string;
  category: "emergency" | "taxi" | "other";
  label: string;
  number: string;
  note?: string;
}

export interface EventItem {
  id: string;
  title: string;
  titleFr?: string;
  titleCr?: string;
  date: string;        // free text, e.g. "Every Saturday" or "15 Aug 2026"
  description: string;
  descriptionFr?: string;
  descriptionCr?: string;
  location?: string;
  image?: string;
  /** Extra photos. `image` stays the cover so every existing event keeps working. */
  images?: string[];
  featured?: boolean;  // pinned to top + gold border
}

export interface ExperienceContent {
  image1: string;        // top "Ride / explore" photo
  image2: string;        // "Three steps to the open road" photo
  showImage1?: boolean;  // toggle the top photo (default true)
  showImage2?: boolean;  // toggle the process photo (default true)
}

export interface RecommendedPlace {
  id: string;
  category: "hotel" | "restaurant" | "activity";
  name: string;
  description: string;
  descriptionFr?: string;
  descriptionCr?: string;
  image: string;
  link?: string;       // website, booking page or Google Maps link
  linkText?: string;
  whatsapp?: string;   // business WhatsApp — enables the "Book / Enquire" redirect
  featured?: boolean;  // sponsored placement — shown first with a badge
  bookable?: boolean;  // enables the on-site reservation form + live calendar
  capacity?: number;   // hotel = total rooms · restaurant = seats per slot · activity = spots per date (default 1)
  timeSlots?: string[]; // restaurants & activities: bookable times, e.g. ["12:30","19:00","20:30"]
  priceNote?: string;  // optional price hint shown in the booking form, e.g. "from Rs 2500/night"
  /**
   * STAYS ONLY — Rs per room, per night. The number the total is computed from.
   *
   * Accommodation had no rate at all until this: the only money field was
   * `depositAmount` below, flat per reservation, so one night and seven nights
   * cost the same and `priceNote` ("from Rs 2500/night") was decorative text
   * the engine never read. A guest could therefore be shown one number and
   * charged another.
   *
   * Optional on purpose. A listing without it keeps charging its flat
   * depositAmount exactly as before — see lib/stay-pricing.ts, which owns the
   * rule and is the single implementation both the server and the booking form
   * price from.
   */
  nightlyRate?: number;
  /**
   * What the customer pays, in Rs, to confirm this booking — IN FULL.
   *
   * This was a deposit until 2026-08-13, with a balance settled on arrival.
   * The owner's decision: activities are now paid in full at the point of
   * booking, so this number is the whole price and nothing is owed later. The
   * key keeps its old name because it is the same stored value in the same
   * `place_bookings.deposit_amount` column, and renaming it would have meant
   * migrating live reservations to change a word.
   *
   * Flat per reservation, NOT per person — a boat charter is priced by the
   * boat, and there is no per-head field to multiply by. An owner pricing per
   * person should set the amount for the party size he accepts, or say so in
   * the price note.
   *
   * 0 or unset keeps the listing request-only: nothing to charge, so the owner
   * confirms it by hand as before.
   */
  depositAmount?: number;
  highlights?: string[]; // bullet highlights/amenities shown in the detail view
  images?: string[];   // optional extra photos for the detail gallery
  isTour?: boolean;    // an activity that's a guided tour/excursion → shown under "Guided Tours"
  /**
   * Which BOOKABLE SERVICE this is, when it is more specific than "activity".
   *
   * This one field is what turns the existing Stay·Eat·Do engine into a massage
   * / fishing / sea-trip marketplace without a second booking system. That
   * engine already does everything those verticals need and has done for
   * months: per-date capacity, time slots, deposit-to-confirm, a photo gallery,
   * highlights, and the hold/release logic in lib/holds.ts. What it lacked was
   * a way to say WHICH kind of service an "activity" is, so the three could
   * have their own discovery surfaces.
   *
   * Building three bespoke marketplaces instead would have meant three
   * availability engines, three deposit flows and three sets of double-booking
   * bugs, for a catalogue that today contains three items.
   */
  serviceType?: "massage" | "fishing" | "boat" | "hiking" | "chauffeur";
  /** Minutes. A 60-minute massage and a 5-hour charter both need this. */
  durationMinutes?: number;
  /** "Up to 6 people" — shown on the card, distinct from `capacity` (spots/day). */
  maxGuests?: number;
  /** What the price includes. Rendered as ticks on the detail view. */
  included?: string[];
  /** Provider/captain/therapist/guide name, shown as trust rather than as a heading. */
  providerName?: string;
  /**
   * When this experience actually happens: by day, after dark, or either.
   *
   * A content dimension, not a theme. Stargazing and a night fishing trip are
   * not evening-coloured versions of daytime ones — they only exist after dark,
   * and a lagoon snorkel only exists before it. So the Day/Night control on
   * /experiences filters real inventory rather than recolouring one list.
   *
   * Optional, and absent means BOTH: every listing that predates this shows in
   * either mode, so switching the feature on cannot empty the marketplace. The
   * owner opts a listing into being night-only.
   */
  timeOfDay?: "day" | "night" | "both";
  /**
   * ── WHICH RODRIGUES THIS BELONGS TO ───────────────────────────────────────
   *
   * The Dual Experience World system (lib/worlds.ts). Authentic is local life,
   * culture, nature and community; Curated is premium stays, refined dining,
   * private experiences and wellness.
   *
   * Every field here is OPTIONAL and absent means "both", exactly like
   * timeOfDay above and for the same reason: switching the feature on must not
   * empty half the site. Nothing needs re-saving, and an owner narrows a
   * listing deliberately or not at all.
   *
   * World is the PRIMARY lens and timeOfDay the secondary one — the world
   * decides how the island is presented, the time decides what is on offer.
   */
  world?: "authentic" | "curated" | "both";
  /** Order within a world. Lower first. Absent sorts after everything numbered. */
  worldPriority?: number;
  /** Independent rank per world — "both" can lead one and trail the other. */
  priorityAuthentic?: number;
  priorityCurated?: number;
  /** Promote to the front of the Authentic listing. */
  featuredAuthentic?: boolean;
  /** Promote to the front of the Curated listing. */
  featuredCurated?: boolean;
  /** Eligible to carry the Authentic homepage hero. */
  heroAuthentic?: boolean;
  /** Eligible to carry the Curated homepage hero. */
  heroCurated?: boolean;
  /**
   * Which curated categories this listing belongs to — MANY, deliberately.
   *
   * A sunset charter is genuinely Ocean and Romantic and Photography, and the
   * old filtering could not express that: it substring-matched the chip's word
   * against the listing's own prose, so "family" matched a "family-run
   * business" and a listing had to be phrased a certain way to be findable.
   *
   * Shared across every vertical, so "what is romantic on this island" is a
   * question the catalogue can answer across massage, boats and fishing at
   * once. Vocabulary in lib/experience-categories.ts.
   *
   * Absent means untagged, and an untagged listing keeps the old text
   * behaviour — the catalogue converts at the owner's pace instead of
   * disappearing from every filter the day this shipped.
   */
  categories?: string[];
  /**
   * Curated shelf this listing belongs on, if any.
   *
   * Merchandising the owner controls, not a computed "popular" — with a
   * catalogue this size a popularity algorithm would be measuring noise, and
   * "the island's own pick" is a stronger claim than a click count anyway.
   *
   *  · signature — "the experiences that capture the island"
   *  · hidden    — "what most visitors never see"
   *
   * Absent means it simply appears in the main grid, which is where almost
   * everything should be: a shelf that holds half the catalogue is not curation.
   */
  shelf?: "signature" | "hidden";
  /**
   * Languages this person actually works in, e.g. ["English", "French", "Kreol"].
   *
   * Added with hiking guides, where it is not a nice-to-have: you are choosing
   * someone to spend four hours on a ridge with, and whether they can explain
   * the terrain in a language you speak is the first filter a visitor applies.
   * Free text rather than an enum — Rodrigues guides also work in Italian and
   * German, and a fixed list would quietly exclude them.
   */
  languages?: string[];
  /**
   * Where the customer actually meets the boat / therapist.
   *
   * A fishing charter's address is not its meeting point — "Port Sud-Est jetty,
   * next to the fuel pump" is. The map link answers "which village"; this
   * answers "where do I stand".
   */
  meetingPoint?: string;
}

/** The bookable service verticals that ride on the Stay·Eat·Do engine. */
// ── A CHAUFFEUR IS NOT A TAXI ──────────────────────────────────────────────
// The owner's correction, and he is right about the product: /taxi is "I need a
// ride from here to there, now, for a fare". A private chauffeur is a person
// and a car booked for a day or a half-day, priced by the time and not the
// distance, chosen for who they are. Pointing the curated page at /taxi was
// selling the second thing with the first thing's page.
//
// It rides the same engine as massage, fishing, sea trips and hiking guides —
// per-date capacity, a deposit, a gallery, a real booking — because that engine
// already does everything this needs and building a fifth booking flow to
// express "by the day" would have been a fifth set of double-booking bugs.
export const SERVICE_TYPES = ["massage", "fishing", "boat", "hiking", "chauffeur"] as const;
export type ServiceType = (typeof SERVICE_TYPES)[number];

export interface RecommendedContent {
  enabled: boolean;
  title: string;
  subtitle: string;
  items: RecommendedPlace[];
}

// Food Concierge — instead of listing restaurants, the "Food & Dining" hub tile
// opens a premium WhatsApp concierge: the visitor tells us what they fancy and a
// local expert points them to (and books) the right table. The number is
// admin-editable; commission is arranged directly with partner restaurants.
export interface FoodConciergeStep {
  id: string;
  title: string;
  text: string;
}
export interface FoodConciergeContent {
  enabled: boolean;
  coverImage?: string;   // hub-tile cover photo for the "Food & Dining" tile
  whatsapp: string;      // digits or wa.me link — where enquiries land
  title: string;         // hero headline on /food
  subtitle: string;      // hero sub-line
  intro: string;         // short paragraph explaining the free service
  buttonText: string;    // WhatsApp CTA label
  prefill: string;       // pre-filled WhatsApp message
  steps: FoodConciergeStep[]; // "how it works" cards
}

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
}

export interface FaqContent {
  enabled: boolean;
  title: string;
  subtitle: string;
  items: FaqItem[];
}

export interface TransportOption {
  id: string;
  icon: "bus" | "taxi" | "scooter" | "walk" | "bike" | "car";
  title: string;
  titleFr?: string;
  titleCr?: string;
  text: string;
  textFr?: string;
  textCr?: string;
  highlight?: boolean;  // gold-accented "recommended" card
  link?: string;        // optional CTA, e.g. "#booking" or "/taxi"
  linkText?: string;
}

export interface GettingAroundContent {
  enabled: boolean;
  coverImage?: string;   // hub-tile cover photo for the "Getting around" tile
  title: string;
  titleFr?: string;
  titleCr?: string;
  subtitle: string;
  subtitleFr?: string;
  subtitleCr?: string;
  options: TransportOption[];
}

export interface PromoSlide {
  id: string;
  eyebrow?: string;   // small label above the title, e.g. "ISLAND TIP"
  title: string;
  subtitle: string;
  image: string;      // background image (also poster if a video is set)
  video?: string;     // optional mp4 URL (autoplays muted, looped)
  link?: string;      // CTA target, e.g. "/#recommended" or "/taxi"
  linkText?: string;  // CTA label
  enabled: boolean;
}

/**
 * ── THE COMPANY'S OWN IDENTITY, EDITABLE WITHOUT A DEPLOY ──────────────────
 *
 * lib/legal.ts holds these same fields as code, and stays the FALLBACK. This
 * block is what the owner fills in from /admin/legal — a BRN and a registered
 * address are facts about a company registry that arrive on the owner's
 * schedule, not the developer's, and requiring a deploy to publish them is how
 * they end up never being published at all.
 *
 * Every field is optional and an empty string means "still outstanding", which
 * is exactly how lib/legal.ts's OWNER_REQUIRED marker already behaves. So a
 * half-filled block degrades to the same visible "outstanding" state rather
 * than to a confident blank.
 */
export interface LegalContent {
  /** Exact registered name on the certificate of incorporation. */
  legalName?: string;
  /** Business Registration Number from the Registrar of Companies. */
  brn?: string;
  /** Registered office as filed. */
  registeredAddress?: string;
  /** Where customers actually find you, if it differs from the code default. */
  tradingAddress?: string;
  /** Person responsible for what is published. */
  publicationDirector?: string;
  /**
   * Private-bucket object path of the registration certificate photo.
   *
   * A PATH, never a URL: the certificate carries signatures and a company
   * stamp, so it lives in the private bucket and is only ever shown through a
   * short-lived signed URL minted for an authenticated admin. Storing a URL
   * here would mean storing something that either expires or is public.
   */
  certificatePath?: string;
}

/**
 * ── COMMERCIAL RULES ONLY THE OWNER CAN DECIDE ─────────────────────────────
 *
 * The Terms of Service can describe how the platform WORKS from the code — who
 * holds the money, when a reservation lapses, who the seller is. It cannot
 * invent the owner's own commercial policy: how long before a boat trip you may
 * cancel, what happens to a delivery nobody answers the door for, how old you
 * must be to hire a vehicle.
 *
 * Those are business decisions, and a plausible-sounding guess published as a
 * binding term is worse than an honest blank. Each is optional; blank renders
 * publicly as "to be confirmed by the operator", exactly like the legal
 * identity block, and is filled in from /admin/legal.
 */
export interface TermsContent {
  /** Minimum age to HIRE a vehicle, if it differs from the legal riding age. */
  vehicleMinAge?: string;
  /** What happens when a delivery cannot be completed at the address given. */
  deliveryFailedRule?: string;
  /** How long a customer has to raise a problem with an order. */
  complaintWindow?: string;
  /** Rule for alcohol or any other age-restricted goods sold on the platform. */
  ageRestrictedGoods?: string;
}

/** One row of the vehicle cancellation ladder. */
export interface CancellationTier {
  /** When, relative to pickup. "More than 48 hours before pickup". */
  window: string;
  /** What the customer gets. "80% refund...", "Non-refundable". */
  outcome: string;
}

/**
 * ── THE REFUND POLICY'S COMMERCIAL NUMBERS ─────────────────────────────────
 *
 * UNLIKE TermsContent, these are NOT blank by default.
 *
 * The distinction matters. The Terms clauses had no published rule at all, so
 * an empty one is honest and OWNER_REQUIRED is right. The refund tiers have
 * been published and in force for months — they are already the owner's stated
 * policy. Emptying them to "to be confirmed" would DELETE a live consumer
 * policy from a page customers rely on, which is a worse outcome than leaving
 * it uneditable was.
 *
 * So the currently published wording is the default, and admin overrides it.
 * Nothing here is invented: every default below is the text that is on
 * /legal/refunds today.
 *
 * NOTE: no code computes these. The tiers are applied by a human when a refund
 * is agreed, so editing them changes the published promise and nothing else —
 * there is no calculation to keep in step. If a refund calculator is ever
 * built, it must read THESE values rather than hardcode its own.
 */
export interface RefundsContent {
  /**
   * The cancellation ladder for anything BOOKED AHEAD AND PREPAID — vehicle
   * rentals and experiences (boat trips, fishing, massage, on-site bookings).
   *
   * ONE ladder, not one per vertical, because the owner's rule is the same for
   * both and two copies of a policy is two chances for them to drift. Ordered
   * from most to least notice.
   *
   * It deliberately does NOT govern food, shop or ticket orders: those are not
   * booked 48 hours ahead, and the software already opens a FULL refund
   * automatically when a paid order is cancelled (M90). A notice-based ladder
   * there would contradict the mechanism and mean a customer who changed their
   * mind two minutes after ordering dinner got nothing back.
   */
  cancellationTiers?: CancellationTier[];
  /** Security deposit rule for vehicle rentals. */
  securityDeposit?: string;
  /** What a late return costs. */
  lateReturnCharge?: string;
  /** How damage is assessed and charged. */
  damageRule?: string;
}

export interface SiteContent {
  hero: HeroContent;
  stats: StatItem[];
  promoSlides: PromoSlide[];
  fleet: FleetItem[];
  pricing: PricingRow[];
  contact: ContactContent;
  gallery: GalleryImage[];
  galleryEnabled?: boolean;
  testimonials: TestimonialItem[];
  social: SocialLinks;
  branding: BrandingContent;
  legal?: LegalContent;
  terms?: TermsContent;
  refunds?: RefundsContent;
  announcement: AnnouncementContent;
  mapLocations: MapLocation[];
  plannerActivities: PlannerActivity[];
  rideRoutes: RideRoute[];
  vehicleCategories: VehicleCategory[];
  usefulContacts: UsefulContact[];
  events: EventItem[];
  sponsorsEnabled: boolean;
  sponsors: Sponsor[];
  gettingAround: GettingAroundContent;
  faq: FaqContent;
  recommended: RecommendedContent;
  foodConcierge: FoodConciergeContent;
  experience: ExperienceContent;
  quickAccess?: QuickAccessItem[];
  homeCards?: HomeCard[];
}

// The six large photo cards at the top of the homepage — admin-editable.
export interface HomeCard {
  id: string;
  label: string;
  labelFr?: string;
  labelCr?: string;
  icon: string;         // icon key → lucide icon (glass badge)
  imageSource: string;  // "scooter" | "car" | "stays" | "exp" | "stores" | "none"
  action?: "link" | "tiroule"; // link to href, or open the Ti Roulé chat
  href?: string;
  tint?: string;        // "amber" | "teal" | "indigo" | "rose"
  popular?: boolean;
  enabled?: boolean;    // default true
}

// "What are you looking for?" tiles on the homepage — admin-editable.
export interface QuickAccessItem {
  id: string;
  label: string;
  labelFr?: string;
  labelCr?: string;
  href: string;
  icon: string;      // icon key, mapped to a lucide icon on the homepage
  enabled?: boolean; // default true
}

// Default tiles (used until the owner customises them in admin).
export const DEFAULT_QUICK_ACCESS: QuickAccessItem[] = [
  // ── THINGS PEOPLE DO, NOT CONTENT CATEGORIES ──────────────────────────────
  // "Eat Local", "Boutiques" and "Événements" were removed from this grid on
  // the owner's instruction, and he was right: all three already have a much
  // stronger entry point above or below it — two of the six photo cards, and
  // the events carousel. A tiny icon competing with a full-width card for the
  // same destination does not add a route, it dilutes one.
  //
  // What is left is ordered by INTENT rather than by content type: get in the
  // water, get up a hill, get on a boat, get looked after, get a ride.
  // Beaches and Viewpoints were two tiles pointing at two halves of the same
  // errand — "show me somewhere beautiful to go". Fusing them costs nothing:
  // both guides still exist and still own their own search intent, and the
  // beaches page carries a link straight across to the viewpoints one. What it
  // buys is the slot below, which now holds something nobody else on this
  // island offers.
  { id: "qa-beaches",   label: "Beaches & Views", labelFr: "Plages & vues", labelCr: "Laplaz & vi", href: "/guide/beaches",   icon: "beach",     enabled: true },
  // Hiking has its own guide now. It used to land on /guide/routes, a page
  // titled "Scooter routes & hiking trails" whose H1, hero copy and first CTA
  // are all about renting a scooter — so a tile that said "Hiking" opened a
  // scooter page and put the trails below every ride on it.
  { id: "qa-hiking",    label: "Hiking",       labelFr: "Randonnée",    labelCr: "Rando",       href: "/guide/hiking",     icon: "hiking",    enabled: true },
  // The slot the fusion freed. "Deliver anything" is the one thing here that
  // is not a place to go or a thing to rent — it is an errand somebody else
  // runs for you, and it is the only tile in this grid a resident uses as often
  // as a visitor.
  { id: "qa-deliver",   label: "Delivery",     labelFr: "Livraison",    labelCr: "Livrezon",    href: "/deliver",          icon: "delivery",  enabled: true },
  { id: "qa-fishing",   label: "Fishing",      labelFr: "Pêche",        labelCr: "Lapes",       href: "/experiences/fishing", icon: "fishing", enabled: true },
  { id: "qa-boat",      label: "Boat Trips",   labelFr: "Sorties mer",  labelCr: "Sorti lamer", href: "/experiences/boat",    icon: "boat",    enabled: true },
  { id: "qa-massage",   label: "Massage",      labelFr: "Massage",      labelCr: "Masaz",       href: "/experiences/massage", icon: "massage", enabled: true },
  // Taxi and Transfer are DIFFERENT INTENTS and no longer share a page: one is
  // "I need a ride now", the other is "I am planning a journey". They pointed
  // at the same URL, which is why the grid looked like it had a duplicate.
  { id: "qa-taxi",      label: "Taxi",         labelFr: "Taxi",         labelCr: "Taksi",       href: "/taxi",             icon: "taxi",      enabled: true },
  { id: "qa-airport",   label: "Transfers",    labelFr: "Transferts",   labelCr: "Transfer",    href: "/transfers",        icon: "plane",     enabled: true },
];

// Default home cards (used until the owner customises them in admin). Images are
// pulled from each card's imageSource category (the owner's real photos).
export const DEFAULT_HOME_CARDS: HomeCard[] = [
  { id: "hc-scooter", label: "Scooters", labelFr: "Scooters", labelCr: "Skooter", icon: "scooter", imageSource: "scooter", action: "link", href: "/browse/scooter", tint: "amber", popular: true, enabled: true },
  { id: "hc-car", label: "Cars", labelFr: "Voitures", labelCr: "Loto", icon: "car", imageSource: "car", action: "link", href: "/browse/car", tint: "amber", enabled: true },
  { id: "hc-stay", label: "Stays", labelFr: "Séjours", labelCr: "Lozman", icon: "stay", imageSource: "stays", action: "link", href: "/browse/stays", tint: "amber", enabled: true },
  // → /browse/tours, not /explore. Every other card on this grid opens its own
  // category; Experiences was the one that dumped you into the general hub —
  // which is ALSO the second button in the bottom nav, so the card spent a slot
  // above the fold to reach a place already one tap away, and the nav lit up
  // "Explore" as if you had pressed that instead. A category card must land on
  // its category.
  // Was /browse/tours, which is ONE kind of experience — a card labelled
  // "Experiences" that opened the tour list left massages, charters, sea trips
  // and hiking guides with no door of their own. /experiences is that door, and
  // it is where Day and Night live.
  { id: "hc-exp", label: "Experiences", labelFr: "Expériences", labelCr: "Eksperyans", icon: "experience", imageSource: "exp", action: "link", href: "/experiences", tint: "teal", enabled: true },
  // This slot has now been Ti Roulé, then Events, and is now FOOD (owner, Aug
  // 2026). Ordering is the only thing on this grid a visitor does several times
  // per stay, so it earns a card above the fold more than a listing does.
  //
  // Events did NOT lose its entry point — it gained a better one. A single card
  // in a six-card grid could not say "you can buy tickets here", so events moved
  // to its own promotional strip under the quick actions where it can show the
  // real next event, its date and its price. See EventsPromo.
  { id: "hc-food", label: "Restaurant", labelFr: "Restaurant", labelCr: "Restoran", icon: "restaurant", imageSource: "food", action: "link", href: "/food", tint: "indigo", enabled: true },
  { id: "hc-stores", label: "Local Stores", labelFr: "Boutiques", labelCr: "Laboutik", icon: "store", imageSource: "stores", action: "link", href: "/shop", tint: "amber", enabled: true },
];

export const DEFAULT_CONTENT: SiteContent = {
  hero: {
    eyebrow: 'RIDE • EXPLORE • DISCOVER',
    headline: ['RIDE.', 'EXPLORE.', 'RODRIGUES.'],
    subheadline: "Rent a scooter in minutes and unlock the whole island — hidden beaches, scenic routes and the best local spots, all in one place.",
    backgroundImage: '/images/burgman-sunset.jpeg',
  },
  // "500+ Happy Riders" shipped here as a seeded headline number. It was never
  // measured — it was typed — and the business it describes has ten reviews.
  // A number nobody can source is the fastest way to lose the trust the rest of
  // this file is trying to build, and the honest version is stronger anyway:
  // "Rated 5.0 from 10 reviews across five countries" is computable from
  // product_reviews at any moment and gets better on its own.
  //
  // The two survivors are facts. A rider count belongs here only when something
  // counts it.
  stats: [
    { value: 2, suffix: '', label: 'Scooter Models' },
    { value: 24, suffix: '/7', label: 'Support' },
  ],
  promoSlides: [
    { id: 'promo-stay', title: 'Stay · Eat · Do', subtitle: 'Hand-picked hotels, restaurants & activities across Rodrigues — book in a tap.', image: '', link: '/#recommended', linkText: 'Explore', enabled: true },
    { id: 'promo-taxi', title: 'Need a ride?', subtitle: 'Trusted local taxi drivers for airport transfers & island tours.', image: '', link: '/taxi', linkText: 'See drivers', enabled: true },
    { id: 'promo-routes', title: 'Scenic ride routes', subtitle: 'Curated island loops with every stop mapped out for you.', image: '', link: '/#routes', linkText: 'View routes', enabled: true },
  ],
  fleet: [
    {
      id: 'burgman',
      badge: 'PREMIUM',
      name: 'BURGMAN 125',
      tagline: 'The ultimate island cruiser.',
      description:
        'Powerful, comfortable, and built for long coastal rides. The Burgman delivers effortless performance on every stretch of road.',
      image: '/images/burgman-rider.jpeg',
      price: 'From Rs 800',
      unit: '/ day',
      available: true,
      units: 1,
      category: 'scooter',
    },
    {
      id: 'avenis',
      badge: 'POPULAR',
      name: 'AVENIS 125',
      tagline: 'Agile, efficient, unstoppable.',
      description:
        "Perfect for weaving through Rodrigues' scenic backroads and tight coastal paths. Light, fuel-efficient, and a pure joy to ride.",
      image: '/images/avenis-front.jpeg',
      price: 'From Rs 600',
      unit: '/ day',
      available: true,
      units: 1,
      category: 'scooter',
    },
  ],
  pricing: [
    { name: 'Suzuki Burgman 125', prices: ['Rs 800', 'Rs 2,200', 'Rs 4,500'] },
    { name: 'Suzuki Avenis 125', prices: ['Rs 600', 'Rs 1,650', 'Rs 3,200'] },
  ],
  contact: {
    phone: '+230 5XXX XXXX',
    email: 'hello@roulerodigues.mu',
    location: 'Rodrigues Island, Mauritius',
    hours: 'Mon – Sun: 7:00 AM – 8:00 PM',
    whatsappNumbers: [],
  },
  gallery: [],
  // ── EMPTY ON PURPOSE ────────────────────────────────────────────────────
  //
  // This array used to ship three invented five-star testimonials — "Sophie
  // Laurent, Paris", "James Okoye, London", "Anika van der Berg, Cape Town" —
  // written as seed content and never marked as fake anywhere a reader would
  // see. PRODUCT.md's own rule is "no invented ratings, prices, reviews or
  // testimonials", and the admin editor labels this field "testimonials you
  // control and display on the site", so a single wiring commit would have
  // published all three as real customer voices.
  //
  // One of them was a live hazard rather than a hypothetical: the invented
  // "Sophie Laurent, Paris, France" sat one row away from a REAL reviewer,
  // "Sophie.L, Paris, France", in product_reviews. Nobody comparing the two
  // could have told which was the customer.
  //
  // The genuine article is already better than the fake: ten approved 5★
  // reviews from France, Réunion, Germany, England and Mauritius, in
  // product_reviews, served by /api/reviews. Seed nothing here.
  testimonials: [],
  social: {
    instagram: '',
    facebook: '',
    tiktok: '',
    whatsapp: '',
  },
  branding: {
    logo: '',
  },
  // Empty, not invented. Every field here is a statement of legal identity on a
  // site that takes payments, and a plausible-looking placeholder that escaped
  // into production would be a false one. lib/legal.ts renders each blank as
  // visibly outstanding until the owner fills it in from /admin/legal.
  legal: {},
  // Same rule as `legal`: blank, never guessed. See TermsContent.
  terms: {},
  // NOT blank — see RefundsContent. A default here is what /legal/refunds
  // publishes when the owner has not overridden it, so making the page editable
  // can never accidentally unpublish a live consumer policy.
  //
  // The cancellation ladder below is the owner's stated policy (confirmed
  // 2026-08-19): 80% back outside 48 hours, nothing inside it. It replaced a
  // 100/50/0 ladder that the homepage and the booking form had both been
  // contradicting — see lib/i18n.ts and components/BookingSection.tsx, which
  // were corrected in the same change.
  refunds: {
    cancellationTiers: [
      {
        window: 'More than 48 hours before the scheduled service',
        outcome:
          '80% of the deposit paid is refunded. The remaining 20% is retained as an administrative and processing fee',
      },
      {
        window: 'Within 48 hours of the scheduled service, or a no-show',
        outcome: 'non-refundable',
      },
    ],
    securityDeposit:
      'A refundable security deposit may be collected at pickup (cash or card hold). It is returned in full at drop-off, less any agreed charge for damage, missing fuel, or late return.',
    lateReturnCharge:
      'Please return on time so the next rider is not affected. Late returns may be charged a pro-rata hourly rate or a full extra day if significantly late.',
    damageRule:
      'You are responsible for damage caused during your rental. Minor wear is expected; the cost of repairs for new damage may be deducted from the deposit, with photos shared for transparency.',
  },
  announcement: {
    active: false,
    text: 'Book 3+ days and get a FREE helmet & lock upgrade!',
    link: '#booking',
    linkText: 'Book now',
    bgColor: 'yellow',
  },
  mapLocations: [
    {
      id: 'pointe-cotton',
      name: 'Pointe Cotton',
      description: 'Dramatic cliffs with breathtaking views of the Indian Ocean.',
      category: 'viewpoint',
      lat: -19.6728,
      lng: 63.4764,
    },
    {
      id: 'saint-francois',
      name: 'Saint-François Lagoon',
      description: 'Crystal-clear turquoise lagoon — perfect for snorkelling.',
      category: 'beach',
      lat: -19.7201,
      lng: 63.4628,
    },
    {
      id: 'grand-baie',
      name: 'Grand Baie Beach',
      description: 'Wide sandy beach, ideal for swimming and relaxing.',
      category: 'beach',
      lat: -19.6911,
      lng: 63.3589,
    },
    {
      id: 'caverne-patate',
      name: 'Caverne Patate',
      description: 'Stunning limestone cave system — guided tours available.',
      category: 'landmark',
      lat: -19.7253,
      lng: 63.3614,
    },
    {
      id: 'port-mathurin',
      name: 'Port Mathurin Market',
      description: 'The island\'s main town — visit the Saturday market for local produce.',
      category: 'landmark',
      lat: -19.6811,
      lng: 63.4147,
    },

    // ── More beaches ──
    {
      id: 'trou-dargent',
      name: "Trou d'Argent",
      description: "Rodrigues' most famous secluded beach — reached on foot via the cliff path from Graviers/Pointe Cotton. Stunning.",
      category: 'beach',
      lat: -19.7385,
      lng: 63.4790,
    },
    {
      id: 'anse-mourouk',
      name: 'Anse Mourouk (Mourouk)',
      description: 'Long wild beach on the south coast near Mourouk Ebony — great for kitesurfing and big skies.',
      category: 'beach',
      lat: -19.7560,
      lng: 63.4240,
    },
    {
      id: 'graviers',
      name: 'Graviers Beach',
      description: 'Quiet east-coast beach and the starting point of the coastal walk to Trou d\'Argent.',
      category: 'beach',
      lat: -19.7330,
      lng: 63.4720,
    },
    {
      id: 'anse-ally',
      name: 'Anse Ally',
      description: 'Calm, shallow lagoon beach on the north-west coast — family-friendly and easy to reach.',
      category: 'beach',
      lat: -19.6740,
      lng: 63.3870,
    },

    // ── Petrol stations ──
    // NOTE for the owner: coordinates are best-estimates placed in the right
    // town. Open admin → Island Map to fine-tune the exact lat/lng of each pump.
    {
      id: 'gas-port-mathurin',
      name: 'Petrol Station — Port Mathurin',
      description: 'Main filling station in the capital. Fill up here before heading out to remote beaches and the south.',
      category: 'gas',
      lat: -19.6829,
      lng: 63.4185,
    },
    {
      id: 'gas-mont-lubin',
      name: 'Petrol Station — Mont Lubin',
      description: 'Central station near the Mont Lubin junction — handy when crossing the island.',
      category: 'gas',
      lat: -19.7170,
      lng: 63.4090,
    },
    {
      id: 'gas-la-ferme',
      name: 'Petrol Station — La Ferme',
      description: 'Western fuel stop near La Ferme — useful for the south-west coast and Port Sud-Est road.',
      category: 'gas',
      lat: -19.7250,
      lng: 63.3880,
    },
  ],
  plannerActivities: [
    // Beaches
    { id: 'grand-baie', name: 'Grand Baie Beach', emoji: '🏖️', type: 'beach', slot: 'morning', duration: '2–3 hrs', description: 'Wide sandy beach with crystal-clear water, perfect for swimming and snorkelling. A Rodrigues classic.', tip: 'Arrive before 9am for the calmest water. Bring snorkel gear — the reef is stunning.', image: '' },
    { id: 'saint-francois', name: 'Saint-François Lagoon', emoji: '🌊', type: 'beach', slot: 'morning', duration: '2–3 hrs', description: "One of the Indian Ocean's most beautiful lagoons. Turquoise water, white sand, and untouched reef.", tip: 'Best before noon — the light on the water is magical. Combine with a ride along the eastern road.', image: '' },
    { id: 'trou-argent', name: "Trou d'Argent Beach", emoji: '🏝️', type: 'beach', slot: 'morning', duration: '2 hrs', description: "Rodrigues' most secluded beach — accessible only on foot via a cliffside path. Absolutely breathtaking.", tip: 'Park near Pointe Cotton and walk down (10 min). Go early.', image: '' },
    { id: 'anse-mourouk', name: 'Anse Mourouk', emoji: '🌴', type: 'beach', slot: 'afternoon', duration: '2 hrs', description: 'A southern beach surrounded by dramatic coastal scenery. Quiet, wild, and very Rodriguan.', tip: 'Combine with a coastal ride through the south — the cliffs and views are unforgettable.', image: '' },
    { id: 'riviere-banane', name: 'Rivière Banane Beach', emoji: '🌿', type: 'beach', slot: 'morning', duration: '1.5 hrs', description: 'A quiet, local beach near a river mouth. Great for a relaxed swim away from the tourist trail.', tip: 'Very peaceful on weekday mornings.', image: '' },
    { id: 'anse-quitor', name: 'Anse Quitor', emoji: '🐚', type: 'beach', slot: 'afternoon', duration: '1.5 hrs', description: 'A small, sheltered cove popular with local families. Great for snorkelling along the rocky edges.', tip: 'Bring your own supplies — no facilities here.', image: '' },
    // Culture & Landmarks
    { id: 'caverne-patate', name: 'Caverne Patate', emoji: '🪨', type: 'culture', slot: 'morning', duration: '2 hrs', description: "Rodrigues' most impressive limestone cave system with guided tours through underground chambers.", tip: 'Book in advance — tours fill up. Wear closed shoes.', image: '' },
    { id: 'market', name: 'Port Mathurin Saturday Market', emoji: '🛒', type: 'culture', slot: 'morning', duration: '2 hrs', description: 'The heart of Rodrigues life. Fresh produce, handmade crafts, street food, and the genuine soul of the island.', tip: 'Only on Saturdays, from 6am. Go early for the best pickled salads.', image: '' },
    { id: 'francois-leguat', name: 'François Leguat Giant Tortoise Reserve', emoji: '🐢', type: 'culture', slot: 'afternoon', duration: '2 hrs', description: "Walk among thousands of giant tortoises and explore the reserve's unique caves.", tip: 'Allow extra time — the caves inside are also fascinating.', image: '' },
    { id: 'port-mathurin', name: 'Port Mathurin Town Walk', emoji: '🏛️', type: 'culture', slot: 'morning', duration: '1.5 hrs', description: "Stroll the colourful capital, visit St Gabriel Church, the market hall, and waterfront.", tip: 'The waterfront at sunrise is serene. Stop at a local bakery for a pain beurre.', image: '' },
    // Adventure
    { id: 'coastal-ride', name: 'East Coast Scenic Scooter Ride', emoji: '🛵', type: 'adventure', slot: 'afternoon', duration: '2–3 hrs', description: 'The most spectacular road on the island — ride from Pointe Cotton south to Saint-François along dramatic cliffs.', tip: 'This is why you rented the scooter. Stop wherever looks good.', image: '' },
    { id: 'grand-montagne', name: 'Grand Montagne Nature Reserve', emoji: '🦜', type: 'adventure', slot: 'morning', duration: '2–3 hrs', description: 'Hike through endemic forest with incredible birdlife. Home to the rare Rodrigues warbler and fody.', tip: 'Start at 7am before the heat builds.', image: '' },
    { id: 'gombrani', name: 'Île Gombrani Snorkel Trip', emoji: '🤿', type: 'adventure', slot: 'morning', duration: '3–4 hrs', description: 'Boat trip to a small uninhabited islet surrounded by pristine coral reef. Some of the best snorkelling in Rodrigues.', tip: 'Book from Port Mathurin waterfront. Bring your own mask.', image: '' },
    { id: 'southern-ride', name: 'Southern Coastal Ride', emoji: '🏍️', type: 'adventure', slot: 'afternoon', duration: '2 hrs', description: 'Explore the wild southern coast by scooter — dramatic cliffs, isolated bays, and barely any other tourists.', tip: 'The road through Baie Malgache is particularly beautiful.', image: '' },
    // Viewpoints
    { id: 'pointe-cotton', name: 'Pointe Cotton Cliffs', emoji: '🌅', type: 'viewpoint', slot: 'afternoon', duration: '1 hr', description: 'The most dramatic cliffs on the island. Sheer drops into the Indian Ocean with 180-degree views.', tip: 'Go in the afternoon for golden light on the cliffs.', image: '' },
    { id: 'roche-bon-dieu', name: 'Roche Bon Dieu at Sunset', emoji: '🌇', type: 'viewpoint', slot: 'evening', duration: '1 hr', description: 'The best sunset viewpoint on the island. Panoramic views over Port Mathurin and the lagoon turning gold.', tip: 'Arrive 30 minutes before sunset and bring a picnic.', image: '' },
    { id: 'mont-lubin', name: 'Mont Lubin Summit', emoji: '⛰️', type: 'viewpoint', slot: 'morning', duration: '1–2 hrs', description: 'The highest point of Rodrigues at 393m. On clear days you can see Mauritius on the horizon.', tip: 'Start early before clouds gather at the peak.', image: '' },
    { id: 'plaine-corail', name: 'Plaine Corail Viewpoint', emoji: '✈️', type: 'viewpoint', slot: 'afternoon', duration: '45 min', description: 'The airstrip viewpoint where you can watch small planes arrive. Unique views across the southern plateau.', tip: 'A quick stop on the way south — a great photography spot.', image: '' },
    // Food & Evenings
    { id: 'lunch-local', name: 'Local Rodriguan Lunch', emoji: '🍛', type: 'food', slot: 'lunch', duration: '1 hr', description: 'Try octopus curry, smoked marlin, heart of palm salad and fresh tropical fruit juice.', tip: 'Ask your guesthouse host where to eat — the best local places are word-of-mouth.', image: '' },
    { id: 'lunch-port', name: 'Lunch at Port Mathurin', emoji: '🥘', type: 'food', slot: 'lunch', duration: '1 hr', description: 'Grab lunch at one of the small restaurants around the market. Fresh fish, Creole stews, and local pickles.', tip: 'The fish is caught the same morning.', image: '' },
    { id: 'seafood-dinner', name: 'Fresh Seafood Dinner', emoji: '🦞', type: 'food', slot: 'evening', duration: '1.5 hrs', description: 'End your day with grilled lobster, calamari or reef fish caught that morning.', tip: 'Many guesthouses serve dinner on request — ask for the catch of the day.', image: '' },
    { id: 'rum-tasting', name: 'Local Rhum Arrangé Tasting', emoji: '🍹', type: 'food', slot: 'evening', duration: '1 hr', description: "Sample Rodrigues' famous fruit-infused rums — passion fruit, vanilla, ginger, and seasonal fruits.", tip: 'Look for small home-producers who blend their own.', image: '' },
    { id: 'sunset-drink', name: 'Sunset Drinks by the Lagoon', emoji: '🌅', type: 'food', slot: 'evening', duration: '1 hr', description: 'Find a quiet spot by the lagoon with a cold drink as the sun sets over the Indian Ocean.', tip: 'The lagoon at Saint-François changes colour spectacularly at dusk.', image: '' },
    // More places (with precise Google Maps references)
    { id: 'ile-aux-cocos', name: 'Île aux Cocos Bird Reserve', emoji: '🐦', type: 'adventure', slot: 'morning', duration: '4 hrs', description: 'A protected sand islet in the western lagoon, home to thousands of seabirds — terns, noddies and more. Reached by guided boat across turquoise water.', tip: 'Book a permitted guide/boat from the west coast in advance — access is limited to protect the colony.', image: '', mapsUrl: 'https://www.google.com/maps/dir/?api=1&destination=Ile%20aux%20Cocos%20Rodrigues' },
    { id: 'saint-gabriel', name: 'Église Saint-Gabriel', emoji: '⛪', type: 'culture', slot: 'morning', duration: '45 min', description: "One of the largest churches in the Indian Ocean, built by hand by the islanders. A striking landmark high in the centre of Rodrigues.", tip: 'Combine with the Mont Lubin viewpoint nearby — they are minutes apart.', image: '', mapsUrl: 'https://www.google.com/maps/dir/?api=1&destination=Saint%20Gabriel%20Church%20Rodrigues' },
    { id: 'baie-aux-huitres', name: 'Baie aux Huîtres Mangroves', emoji: '🛶', type: 'adventure', slot: 'morning', duration: '2 hrs', description: 'Glide by kayak through the calm mangrove channels of Oyster Bay — peaceful, scenic and great for spotting crabs and herons.', tip: 'Morning is calmest. Local operators rent kayaks and run guided mangrove tours.', image: '', mapsUrl: 'https://www.google.com/maps/dir/?api=1&destination=Baie%20aux%20Huitres%20Rodrigues' },
    { id: 'anse-bouteille', name: 'Anse Bouteille', emoji: '🏝️', type: 'beach', slot: 'afternoon', duration: '2 hrs', description: 'A quiet cove on the wild east coast, passed on the cliff walk between Graviers and Trou d\'Argent. Pristine and rarely crowded.', tip: 'Wear shoes for the coastal path and bring water — there are no facilities.', image: '', mapsUrl: 'https://www.google.com/maps/dir/?api=1&destination=Anse%20Bouteille%20Rodrigues' },
    { id: 'mont-limon', name: 'Mont Limon (Highest Point)', emoji: '⛰️', type: 'viewpoint', slot: 'morning', duration: '1 hr', description: 'The true rooftop of Rodrigues (398 m). A short climb rewards you with a full 360° panorama of the island and its surrounding lagoon.', tip: 'Go on a clear morning for the best visibility before clouds gather.', image: '', mapsUrl: 'https://www.google.com/maps/dir/?api=1&destination=Mont%20Limon%20Rodrigues' },
    { id: 'la-belle-rodriguaise', name: "Table d'Hôte Creole Feast", emoji: '🍽️', type: 'food', slot: 'evening', duration: '2 hrs', description: 'Book a traditional Rodriguan table d\'hôte — a generous home-cooked Creole feast of octopus, sausages, local vegetables and rougaille.', tip: 'Reserve a day ahead; many of the best tables are at guesthouses up in the hills.', image: '', mapsUrl: 'https://www.google.com/maps/dir/?api=1&destination=table%20d%27hote%20Rodrigues' },
  ],
  rideRoutes: [
    {
      id: 'sunset-coastal-loop',
      name: 'Sunset Coastal Loop',
      description: "The east coast at its most dramatic — clifftop roads, the Saint-François lagoon, and a sunset finish. The ride every visitor remembers.",
      distance: '34 km',
      duration: '2–3 hrs',
      difficulty: 'Moderate',
      stops: "Pointe Cotton Cliffs\nTrou d'Argent Beach\nSaint-François Lagoon\nRoche Bon Dieu (sunset)",
      mapsUrl: 'https://www.google.com/maps/dir/?api=1&destination=Pointe+Cotton+Rodrigues',
      image: '',
    },
    {
      id: 'hidden-beaches-trail',
      name: 'Hidden Beaches Trail',
      description: 'A relaxed southern run to the quiet coves most tourists never find. Pack a towel and take your time.',
      distance: '26 km',
      duration: '2 hrs',
      difficulty: 'Easy',
      stops: "Anse Mourouk\nAnse Quitor\nGravier Beach\nLunch in the south",
      mapsUrl: 'https://www.google.com/maps/dir/?api=1&destination=Anse+Mourouk+Rodrigues',
      image: '',
    },
    {
      id: 'island-summit-ride',
      name: 'Island Summit Ride',
      description: 'Climb to the rooftop of Rodrigues through endemic forest, with panoramic views across the whole island on a clear day.',
      distance: '22 km',
      duration: '2–3 hrs',
      difficulty: 'Advanced',
      stops: "Mont Lubin Summit\nGrande Montagne Nature Reserve\nPort Mathurin",
      mapsUrl: 'https://www.google.com/maps/dir/?api=1&destination=Mont+Lubin+Rodrigues',
      image: '',
    },

    // ── Hiking & adventure trails (on foot) ──
    {
      id: 'trou-dargent-coastal-walk',
      name: "Trou d'Argent Coastal Walk",
      description: "The island's signature hike — a cliff-top coastal path from Graviers past wild coves to the legendary Trou d'Argent beach. Bring water and swim shoes.",
      distance: '6 km return',
      duration: '2–3 hrs',
      difficulty: 'Moderate',
      stops: "Graviers car park\nSt François beach\nAnse Bouteille\nTrou d'Argent (swim stop)",
      mapsUrl: 'https://www.google.com/maps/dir/?api=1&destination=Trou+d%27Argent+Rodrigues',
      image: '',
      kind: 'hike',
    },
    {
      id: 'grande-montagne-forest-trail',
      name: 'Grande Montagne Nature Trail',
      description: 'A guided walk through restored endemic forest in the island\'s highest reserve — rare birds (Rodrigues warbler & fody), giant ebony, and big views.',
      distance: '3–4 km',
      duration: '1.5–2 hrs',
      difficulty: 'Easy',
      stops: "Grande Montagne visitor centre\nEndemic forest loop\nLookout point",
      mapsUrl: 'https://www.google.com/maps/dir/?api=1&destination=Grande+Montagne+Nature+Reserve+Rodrigues',
      image: '',
      kind: 'hike',
    },
    {
      id: 'mont-limon-summit-hike',
      name: 'Mont Limon Summit Hike',
      description: 'Short but steep climb to the highest point of Rodrigues (398 m). Clear mornings give a full 360° panorama of the island and its lagoon.',
      distance: '2 km return',
      duration: '1–1.5 hrs',
      difficulty: 'Moderate',
      stops: "Mont Limon trailhead\nSummit viewpoint (398 m)",
      mapsUrl: 'https://www.google.com/maps/dir/?api=1&destination=Mont+Limon+Rodrigues',
      image: '',
      kind: 'hike',
    },
    {
      id: 'francois-leguat-cave-adventure',
      name: 'Caverne Patate & Tortoise Reserve',
      description: 'A half-day adventure combining the François Leguat giant-tortoise reserve with a guided descent into the dramatic Caverne Patate limestone caves.',
      distance: 'Guided',
      duration: '2–3 hrs',
      difficulty: 'Easy',
      stops: "François Leguat Reserve\nGuided cave descent\nMuseum & café",
      mapsUrl: 'https://www.google.com/maps/dir/?api=1&destination=Caverne+Patate+Rodrigues',
      image: '',
      kind: 'hike',
    },
  ],
  // deliveryFee is stated on every seeded category rather than left undefined,
  // so a fresh install (and the DEFAULT_CONTENT fallback used when Supabase is
  // unreachable) charges exactly what the hardcoded rule charged before it was
  // owner-editable: cars delivered free, everything else Rs 400 round trip.
  vehicleCategories: [
    { id: 'scooter',   label: 'Scooters',    enabled: true,  deliveryFee: 400, depositPct: 25 },
    { id: 'motorbike', label: 'Motorbikes',  enabled: false, deliveryFee: 400, depositPct: 25 },
    {
      id: 'car', label: 'Cars', enabled: false, deliveryFee: 0, depositPct: 50,
      // Seeded disabled: an empty filter row is worse than none, and the owner
      // turns on the body styles they actually rent. /admin also offers these
      // as one-tap suggestions, because the live site reads its categories from
      // Supabase and never sees this array.
      types: [
        { id: 'suv',       label: 'SUV',       enabled: false },
        { id: 'sedan',     label: 'Sedan',     enabled: false },
        { id: 'hatchback', label: 'Hatchback', enabled: false },
        { id: '4x4',       label: '4x4',       enabled: false },
        { id: 'pick-up',   label: 'Pick-up',   enabled: false },
        { id: 'van',       label: 'Van',       enabled: false },
      ],
    },
    { id: 'ebike',     label: 'E-Bikes',     enabled: false, deliveryFee: 400, depositPct: 25 },
    { id: 'bicycle',   label: 'Bicycles',    enabled: false, deliveryFee: 400, depositPct: 25 },
    { id: 'kayak',     label: 'Kayaks',      enabled: false, deliveryFee: 400, depositPct: 25 },
  ],
  usefulContacts: [
    { id: 'police',    category: 'emergency', label: 'Police',                number: '999',  note: 'Or 112' },
    { id: 'ambulance', category: 'emergency', label: 'Ambulance (SAMU)',      number: '114',  note: '' },
    { id: 'fire',      category: 'emergency', label: 'Fire & Rescue',         number: '995',  note: 'Or 115' },
    { id: 'hospital',  category: 'emergency', label: 'Queen Elizabeth Hospital', number: '+230 832 3661', note: 'Crève Cœur, Rodrigues' },
    { id: 'taxi1',     category: 'taxi',      label: 'Add your taxi partner', number: '+230 5XXX XXXX', note: 'Edit in admin' },
  ],
  events: [],
  sponsorsEnabled: false,
  sponsors: [],
  gettingAround: {
    enabled: true,
    title: 'Getting Around Rodrigues',
    subtitle: 'Three ways to explore the island — here\'s the honest rundown.',
    options: [
      {
        id: 'bus',
        icon: 'bus',
        title: 'Public Bus',
        text: 'Buses run from Port Mathurin to the main villages, but they\'re slow and infrequent — the last buses leave in the early evening, and they don\'t reach the hidden beaches.',
      },
      {
        id: 'taxi',
        icon: 'taxi',
        title: 'Taxi',
        text: 'Perfect for airport transfers and one-off trips. Browse trusted local drivers, agree your fare directly, and read traveller reviews.',
        link: '/taxi',
        linkText: 'See drivers',
      },
      {
        id: 'scooter',
        icon: 'scooter',
        title: 'Rent a Scooter',
        text: 'The only way to reach the secret coves, clifftop viewpoints and back roads — on your own schedule, at your own pace. Helmet included.',
        highlight: true,
        link: '#booking',
        linkText: 'Rent a scooter',
      },
    ],
  },
  faq: {
    enabled: true,
    title: 'Frequently Asked Questions',
    subtitle: 'Everything you need to know before you ride.',
    items: [
      {
        id: 'license',
        question: 'Do I need a driving licence?',
        answer: 'Yes — a valid driving licence (car or motorcycle) is required, and you must bring it with you at pickup. An international permit is recommended if your licence is not in the Latin alphabet.',
      },
      {
        id: 'age',
        question: 'What is the minimum age to rent?',
        answer: 'You must be at least 18 years old and hold a valid licence to rent and ride.',
      },
      {
        id: 'helmet',
        question: 'Is a helmet included?',
        answer: 'Always. A helmet is included free for every rider, and a second helmet is provided for a passenger. Wearing a helmet is mandatory by law on Rodrigues.',
      },
      {
        id: 'insurance',
        question: 'Is insurance included?',
        answer: 'Basic third-party insurance is included with every rental. Please ride responsibly and follow local road rules — full terms are shared at pickup.',
      },
      {
        id: 'delivery',
        question: 'Can you deliver the scooter to my hotel?',
        answer: 'Yes — we can deliver to and collect from your hotel or guesthouse anywhere on the island. Just let us know your location when you book.',
      },
      {
        id: 'fuel',
        question: 'What about fuel?',
        answer: 'Your scooter is delivered ready to ride. We simply ask that you return it with a similar fuel level, or we settle the small difference.',
      },
      {
        id: 'breakdown',
        question: 'What happens if the scooter breaks down?',
        answer: 'Call or WhatsApp us any time — we offer support and, if needed, a replacement scooter so your trip is never interrupted.',
      },
      {
        id: 'passengers',
        question: 'Can two people ride together?',
        answer: 'Yes, our scooters comfortably seat two riders, and we provide a second helmet at no extra cost.',
      },
    ],
  },
  recommended: {
    enabled: true,
    title: 'Where to Stay, Eat & Do',
    subtitle: 'Our hand-picked places to make the most of your Rodrigues trip.',
    items: [],
  },
  foodConcierge: {
    enabled: true,
    whatsapp: '',
    title: 'Your food concierge',
    subtitle: 'Tell us what you fancy — we find and book the table.',
    intro: 'Skip the endless searching. Message our local team on WhatsApp, tell us your craving and budget, and we\'ll recommend — and reserve — the perfect table. Free for you to use.',
    buttonText: 'Chat on WhatsApp',
    prefill: 'Hello Roule Rodrigues 👋 I\'d love your help finding a great place to eat on Rodrigues.',
    steps: [
      { id: 'tell', title: 'Tell us your craving', text: 'Message us on WhatsApp with what you fancy, your budget and your area.' },
      { id: 'match', title: 'We match you', text: 'A local expert replies with the perfect spot for today.' },
      { id: 'book', title: 'We book your table', text: 'Say the word and we reserve it — no app, no fee.' },
    ],
  },
  experience: {
    image1: '/images/burgman-sunset.jpeg',
    image2: '/images/avenis-rear.jpeg',
    showImage1: true,
    showImage2: true,
  },
  galleryEnabled: true,
};
