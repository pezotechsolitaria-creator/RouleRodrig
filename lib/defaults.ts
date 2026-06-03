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
  image: string;
  price: string;
  unit: string;
}

export interface PricingRow {
  name: string;
  prices: [string, string, string];
}

export interface ContactContent {
  phone: string;
  email: string;
  location: string;
  hours: string;
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
      name: 'BURGMAN 200',
      tagline: 'The ultimate island cruiser.',
      description:
        'Powerful, comfortable, and built for long coastal rides. The Burgman delivers effortless performance on every stretch of road.',
      image: '/images/burgman-rider.jpeg',
      price: 'From Rs 800',
      unit: '/ day',
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
    },
  ],
  pricing: [
    { name: 'Suzuki Burgman 200', prices: ['Rs 800', 'Rs 2,200', 'Rs 4,500'] },
    { name: 'Suzuki Avenis 125', prices: ['Rs 600', 'Rs 1,650', 'Rs 3,200'] },
  ],
  contact: {
    phone: '+230 5XXX XXXX',
    email: 'hello@roulerodigues.mu',
    location: 'Rodrigues Island, Mauritius',
    hours: 'Mon – Sun: 7:00 AM – 8:00 PM',
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
};
