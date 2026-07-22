// Client-safe: types and default content only — no Node.js imports

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
  backgroundImage: string;
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
  specs?: string[];       // spec chips (e.g. "Air conditioning", "5 seats") — category-appropriate
  included?: string[];    // what's included (e.g. "Full tank of fuel") — category-appropriate
}

export interface VehicleCategory {
  id: string;
  label: string;    // shown as the filter tab, e.g. "Scooters", "Cars"
  enabled: boolean; // show this category on the website
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
  logo: string;
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
  image?: string;   // optional photo shown in the itinerary card
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
  featured?: boolean; // pinned to top + gold border
  kind?: "ride" | "hike"; // scooter ride (default) vs hiking/adventure trail
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
  depositAmount?: number; // deposit in Rs to reserve. >0 → deposit-to-confirm (PayPal + bank), like vehicles; 0/unset → request-only
  highlights?: string[]; // bullet highlights/amenities shown in the detail view
  images?: string[];   // optional extra photos for the detail gallery
  isTour?: boolean;    // an activity that's a guided tour/excursion → shown under "Guided Tours"
}

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
}

export const DEFAULT_CONTENT: SiteContent = {
  hero: {
    eyebrow: 'RIDE • EXPLORE • DISCOVER',
    headline: ['RIDE.', 'EXPLORE.', 'RODRIGUES.'],
    subheadline: "Rent a scooter in minutes and unlock the whole island — hidden beaches, scenic routes and the best local spots, all in one place.",
    backgroundImage: '/images/burgman-sunset.jpeg',
  },
  stats: [
    { value: 500, suffix: '+', label: 'Happy Riders' },
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
  testimonials: [
    {
      id: 'testimonial-1',
      name: 'Sophie Laurent',
      origin: 'Paris, France',
      rating: 5,
      text: 'Renting from Roule Rodrigues was the best decision of our trip. The Burgman was spotless, powerful, and the whole island opened up to us. We found hidden beaches we would never have reached otherwise.',
    },
    {
      id: 'testimonial-2',
      name: 'James Okoye',
      origin: 'London, UK',
      rating: 5,
      text: "Incredible service from start to finish. The scooter was delivered to our guesthouse, fully fuelled and helmets included. The team was available on WhatsApp whenever we needed anything — I cannot recommend them enough.",
    },
    {
      id: 'testimonial-3',
      name: 'Anika van der Berg',
      origin: 'Cape Town, South Africa',
      rating: 5,
      text: 'We spent a week on the Avenis and covered every corner of Rodrigues. The cliffs at Pointe Cotton, the lagoon at Saint-François — all unforgettable. And the price is absolutely unbeatable for this level of service.',
    },
  ],
  social: {
    instagram: '',
    facebook: '',
    tiktok: '',
    whatsapp: '',
  },
  branding: {
    logo: '',
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
  vehicleCategories: [
    { id: 'scooter',   label: 'Scooters',    enabled: true },
    { id: 'motorbike', label: 'Motorbikes',  enabled: false },
    { id: 'car',       label: 'Cars',        enabled: false },
    { id: 'ebike',     label: 'E-Bikes',     enabled: false },
    { id: 'bicycle',   label: 'Bicycles',    enabled: false },
    { id: 'kayak',     label: 'Kayaks',      enabled: false },
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
