// Client-safe: types and default content only — no Node.js imports

export interface HeroContent {
  eyebrow: string;
  headline: [string, string, string];
  subheadline: string;
  backgroundImage: string;
}

export interface StatItem {
  value: number;
  suffix: string;
  label: string;
}

export interface FleetItem {
  id: string;
  badge: string;
  name: string;
  tagline: string;
  description: string;
  image: string;          // legacy cover image (kept for backward compat)
  images?: string[];      // optional gallery — multiple photos/angles
  price: string;
  unit: string;
  available: boolean;
  category?: string; // vehicle category id, e.g. "scooter"
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
  description: string;
  category: "beach" | "viewpoint" | "restaurant" | "landmark" | "activity";
  lat: number;
  lng: number;
  image?: string; // optional photo shown in the map popup
}

export interface PlannerActivity {
  id: string;
  name: string;
  emoji: string;
  type: "beach" | "culture" | "adventure" | "viewpoint" | "food";
  slot: "morning" | "afternoon" | "evening" | "lunch";
  duration: string;
  description: string;
  tip: string;
  image?: string; // optional photo shown in the itinerary card
}

export interface RideRoute {
  id: string;
  name: string;
  description: string;
  distance: string;   // e.g. "32 km"
  duration: string;   // e.g. "2–3 hrs"
  difficulty: "Easy" | "Moderate" | "Advanced";
  stops: string;      // newline-separated list of stops
  mapsUrl: string;    // Google Maps link
  image?: string;
}

export interface Sponsor {
  id: string;
  name: string;
  image: string;   // logo / banner
  link: string;    // where it links to
  enabled: boolean;
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
  date: string;        // free text, e.g. "Every Saturday" or "15 Aug 2026"
  description: string;
  location?: string;
  image?: string;
}

export interface SiteContent {
  hero: HeroContent;
  stats: StatItem[];
  fleet: FleetItem[];
  pricing: PricingRow[];
  contact: ContactContent;
  gallery: GalleryImage[];
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
}

export const DEFAULT_CONTENT: SiteContent = {
  hero: {
    eyebrow: 'RODRIGUES ISLAND • EST. 2024',
    headline: ['RIDE', 'RODRIGUES', 'YOUR WAY.'],
    subheadline: "Premium scooter rentals on the island's most stunning roads.",
    backgroundImage: '/images/burgman-sunset.jpeg',
  },
  stats: [
    { value: 500, suffix: '+', label: 'Happy Riders' },
    { value: 2, suffix: '', label: 'Scooter Models' },
    { value: 24, suffix: '/7', label: 'Support' },
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
      mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Pointe+Cotton+Rodrigues',
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
      mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Anse+Mourouk+Rodrigues',
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
      mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Mont+Lubin+Rodrigues',
      image: '',
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
};
