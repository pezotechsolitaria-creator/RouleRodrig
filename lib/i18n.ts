// Client-safe translation dictionary
// Languages: en (English), fr (Français), cr (Kreol Rodrig)

export type Language = "en" | "fr" | "cr";

export const LANGUAGE_NAMES: Record<Language, string> = {
  en: "English",
  fr: "Français",
  cr: "Kreol",
};

export const LANGUAGE_FLAGS: Record<Language, string> = {
  en: "🇬🇧",
  fr: "🇫🇷",
  cr: "🏝️",
};

export const LANGUAGE_NATIVE: Record<Language, string> = {
  en: "English",
  fr: "Français",
  cr: "Kreol Rodrig",
};

// Sample phrase shown on each card in the picker
export const LANGUAGE_SAMPLE: Record<Language, string> = {
  en: "Explore the island on two wheels",
  fr: "Explorez l'île à deux roues",
  cr: "Explor zil la lor de rou",
};

// ── The internal code is not the language tag ─────────────────────────
//
// "cr" is this codebase's shorthand for Kreol. As a REAL language tag, `cr` is
// ISO 639-1 for Cree — an Algonquian language of Canada. Writing lang="cr" onto
// a page of Kreol therefore does not fix anything; it tells every screen reader
// and crawler a different untruth, and a worse one, because "cr" is perfectly
// well-formed BCP-47 and so nothing anywhere will ever flag it.
//
// Kreol Morisien is `mfe` (ISO 639-3, Morisyen). Kreol Rodrig has no code of its
// own and mfe is its nearest real tag — the same call components/HikingGuide.tsx
// and components/PlaceGuide.tsx already made inline, and the same three tags
// app/page.tsx already publishes as knowsLanguage. This is where that decision
// lives now, so those three cannot drift apart.
//
// Honest about what it buys: no synthesiser ships a Morisyen voice, so a reader
// meeting `mfe` falls back to its default. The gain is that it stops ASSERTING
// English — which is what makes a reader confidently pronounce Kreol wrongly
// rather than admit it does not know the language.

export const LANGUAGE_TAGS: Record<Language, string> = {
  en: "en",
  fr: "fr",
  cr: "mfe",
};

/** The BCP-47 tag for an internal language code. Safe for unknown input. */
/**
 * Locales to hand Intl, most specific first.
 *
 * NOT the same thing as languageTag(). That returns `mfe` for Kreol, which is
 * correct for an html lang attribute and unreliable for formatting: whether
 * Intl has `mfe` data depends on the engine's ICU build, and a tag it cannot
 * resolve falls back to the ENGINE default — which is the visitor's OS locale,
 * so a customer in Berlin could read a Rodrigues deadline in German.
 *
 * Intl takes a LIST and uses the first locale it actually supports, so the
 * fallback is stated here rather than left to the runtime. Kreol falls back to
 * French, not English: Mauritius writes dates the French way, and where `mfe`
 * IS present it already renders "sam 12 sep" from the same tradition.
 */
export function dateLocales(lang: Language | string | null | undefined): string[] {
  if (lang === "fr") return ["fr-FR"];
  if (lang === "cr") return ["mfe", "fr-FR"];
  return ["en-GB"];
}

export function languageTag(
  lang: Language | string | null | undefined,
): string {
  return LANGUAGE_TAGS[lang as Language] ?? LANGUAGE_TAGS.en;
}

// ── Translation keys ──────────────────────────────────────────────────────────

export type T = typeof translations.en;

const translations = {
  en: {
    // Language picker
    picker: {
      heading: "Choose your language",
      subheading: "Select your preferred language to continue",
    },

    // Navbar
    nav: {
      scooters: "Scooters",
      booking: "Booking",
      pricing: "Pricing",
      map: "Island Map",
      taxi: "Taxi",
      stayEatDo: "Stay · Eat · Do",
      routes: "Routes",
      events: "Events",
      contact: "Contact",
      account: "My account",
      bookNow: "Book Now",
    },

    // Fleet
    fleet: {
      sectionEyebrow: "OUR FLEET",
      sectionTitle: "CHOOSE YOUR RIDE",
      sectionSub:
        "Two icons of Rodrigues riding. Both immaculate. Both ready for you.",
      available: "AVAILABLE",
      unavailable: "UNAVAILABLE",
      // Every unit is on a trip TODAY. Not the same as withdrawn, and the
      // vehicle can still be booked for any other date.
      bookedToday: "BOOKED TODAY",
      bookNow: "Book Now",
      unavailableBtn: "Unavailable",
      allTypes: "All",
      bookedThisWeek: (n: number) => `Booked ${n}× this week`,
    },

    // Booking section
    booking: {
      eyebrow: "RESERVE ONLINE",
      title: "BOOK ONLINE",
      subtitle:
        "Pick your vehicle, choose your dates, and we'll confirm your booking within a few hours.",
      scooterLabel: "VEHICLE",
      scooterPlaceholder: "Choose a vehicle…",
      pickupLabel: "PICKUP DATE",
      returnLabel: "RETURN DATE",
      nameLabel: "YOUR NAME",
      namePlaceholder: "Full name",
      emailLabel: "EMAIL",
      phoneLabel: "PHONE / WHATSAPP",
      phonePlaceholder: "+230 XXXX XXXX",
      messageLabel: "SPECIAL REQUESTS",
      messagePlaceholder: "Hotel name, delivery address, extra helmet…",
      partnerPrompt: "Do you have a partner or hotel referral code?",
      partnerLabel: "PARTNER CODE",
      partnerPlaceholder: "e.g. CHEZ-FRANCINE",
      partnerHint: "Ask your hotel or guesthouse for their code.",
      submit: "Request Booking",
      sending: "Sending…",
      sent: "Request Sent!",
      successTitle: "Request received — checking availability",
      successDesc:
        "We're confirming this vehicle with its owner right now. As soon as it's confirmed we'll email you a link to pay and secure it. Nothing is charged until then.",
      checkingTitle: "What happens next",
      checkingStep1: "We check the vehicle is free for your dates.",
      checkingStep2: "We email you to confirm — usually within a few hours.",
      checkingStep3: "You pay, and the vehicle is yours for those dates.",
      checkingNote:
        "If it isn't free we'll say so straight away and suggest something similar — you will never be charged for a vehicle we cannot provide.",
      errorTitle: "Something went wrong",
      errorDesc: "Please try again or reach us on WhatsApp.",
      summaryTitle: "BOOKING SUMMARY",
      summaryScooter: "Vehicle",
      summaryPickup: "Pickup",
      summaryReturn: "Return",
      summaryDuration: "Duration",
      summaryRental: "Rental",
      summaryDelivery: "Delivery",
      deliveryNote: "Drop-off + pickup",
      deliveryFree: "Free",
      summaryTotal: "Estimated Total",
      depositToConfirm: (pct: number) => `Deposit to confirm (${pct}%)`,
      balanceAtPickup: "Balance at pickup",
      discountNote: "Multi-day discount applied!",
      availabilityTitle: "FLEET AVAILABILITY",
      includedTitle: "INCLUDED",
      included: [
        "Helmet & lock",
        "Full tank of fuel",
        "24/7 WhatsApp support",
        "Free delivery to hotel",
        "Third-party insurance",
      ],
      requestNote:
        // Rewritten for M91. It read "Sending this does not hold the vehicle —
        // the deposit does", which is now wrong in both halves: an APPROVED
        // booking holds the vehicle until payment_due_by (lib/holds.ts), and no
        // deposit can be paid until the owner has approved it.
        "Sending this asks us to hold the vehicle. We check it is free for your dates and reply, usually within a few hours — and once we confirm, it is yours while you pay.",
      bookedDatesLabel: "ALREADY BOOKED",
      overlapWarning:
        "These dates overlap an existing booking. Please choose different dates.",
      datesLabel: "SELECT YOUR DATES",
      calBooked: "Booked",
      calAvailable: "Available",
      calSelected: "Your dates",
      calHint: "Tap pickup, then return",
      tripPrefill: (n: number) =>
        `Booking for your ${n}-day trip ✨ Dates are pre-filled — just pick your pickup date and scooter.`,
      referredBy: (code: string) =>
        `Referred by ${code} — your booking is linked to them automatically.`,
      confirmWhatsApp: "Confirm on WhatsApp",
      agreeBefore: "I agree to the",
      agreeLink: "Terms & Rental Policy",
      agreeError: "Please accept the Terms & Rental Policy to continue.",
      days: (n: number) => `${n} day${n !== 1 ? "s" : ""}`,
    },

    // Track / manage a booking (/manage-booking). The shell around the three
    // payment components, which carry their own three languages.
    manageBooking: {
      title: "Track your order",
      subtitleVehicle:
        "No account needed — enter your reference and the email you booked with.",
      subtitleShop: "Shop orders are tied to the account you ordered with.",
      tabsLabel: "What are you tracking?",
      tabVehicle: "Vehicle rental",
      tabShop: "Shop order",
      shopTitle: "Your shop orders",
      shopBody:
        "Sign in with the email you used at checkout to see every order, its status, and the shop's payment details.",
      shopCta: "View my orders",
      shopSwitchBefore: "Bought a scooter or car rental instead? Switch to",
      shopSwitchAfter: "above — those need no account.",
      refLabel: "Booking reference",
      emailLabel: "Email",
      find: "Find my booking",
      refHint:
        "Your reference is in your confirmation email & receipt (it looks like RR-XXXXXX).",
      errMissing: "Enter your booking reference and email.",
      errNotFound: "No booking found.",
      statusCancelled: "Cancelled",
      statusCompleted: "Completed",
      statusConfirmed: "Confirmed",
      statusAwaiting: "Awaiting deposit",
      cancelledBody:
        "This booking was cancelled — either the reservation window passed before it was confirmed, or the vehicle was secured by someone else first.",
      cancelledNoCharge: "You have not been charged.",
      bookAgain: "Book again",
      rowVehicle: "Vehicle",
      rowReservation: "Reservation",
      rowWhen: "When",
      rowTotal: "Estimated total",
      rowPaidInFull: "Paid in full",
      rowDepositPaid: "Deposit paid",
      rowDepositToConfirm: "Deposit to confirm",
      rowBalanceAtPickup: "Balance at pickup",
      rowBalance: "Balance",
      rowNothingToPay: "Nothing further to pay",
      checkingTitle: "We're checking availability",
      checkingBody:
        "We're confirming this vehicle with its owner. As soon as it's confirmed we'll email you and you can pay here. Nothing is charged until then — and if it isn't free, we'll suggest something similar.",
      noteTitle: "About your request",
      approvedTitle: "It's available — it's yours to confirm",
      holdingUntil: (when: string) =>
        `We're holding it for you until ${when}. After that it goes back to other customers.`,
      payBelow: "Pay below to confirm it.",
      lookUpAnother: "Look up another",
    },

    // Contact
    contact: {
      eyebrow: "GET IN TOUCH",
      title: "CONTACT US",
      subtitle:
        "Ready to explore Rodrigues on two wheels? Reach out via WhatsApp for the fastest response, or fill out the form and we'll get back to you within a few hours.",
      nameLabel: "NAME",
      emailLabel: "EMAIL",
      phoneLabel: "PHONE",
      scooterLabel: "SCOOTER",
      datesLabel: "RENTAL DATES",
      datesPlaceholder: "e.g. 15 Jan – 22 Jan",
      messageLabel: "MESSAGE",
      messagePlaceholder: "Any questions or special requests?",
      submit: "Send Message",
      sending: "Sending…",
      sent: "Sent!",
      successTitle: "Message sent!",
      successDesc:
        "We'll get back to you within a few hours. Check your WhatsApp too!",
      errorTitle: "Something went wrong",
      errorDesc: "Please try again or reach us directly on WhatsApp.",
    },

    // Footer
    footer: {
      navigate: "NAVIGATE",
      follow: "FOLLOW US",
      tagline:
        "Explore Rodrigues. Ride free. Premium scooter rentals on the most beautiful island in the Indian Ocean.",
      tag: "Tag us in your Rodrigues adventures.",
      rights: (year: number) =>
        `© ${year} Roule Rodrigues. All rights reserved.`,
      location: "Rodrigues Island, Republic of Mauritius",
      legal: "LEGAL",
      terms: "Terms",
      privacy: "Privacy",
      refunds: "Refunds",
      disclaimer: "Disclaimer",
      notice: "Legal notice",
      listScooter: "List your business",
    },

    // Trip planner
    planner: {
      eyebrow: "PERSONALISED FOR YOU",
      title: "TRIP PLANNER",
      subtitle:
        "Tell us how long you have and what you love — we'll build your perfect Rodrigues itinerary, day by day.",
      daysLabel: "DAYS IN RODRIGUES",
      interestsLabel: "WHAT YOU LOVE",
      plan: "Plan My Trip",
      planning: "Crafting your trip…",
      emptyTitle: "Your itinerary will appear here",
      emptyDesc: "Choose your days, pick your interests, and hit Plan My Trip.",
      loadingDesc: (n: number) =>
        `Mapping the best spots across Rodrigues for ${n} day${n !== 1 ? "s" : ""}`,
      dayOf: (d: number, t: number) => `DAY ${d} OF ${t}`,
      prevDay: "Previous day",
      nextDay: "Next day",
      readyTitle: "Ready to ride?",
      readyDesc: (n: number) =>
        `Book your scooter now and start your ${n}-day Rodrigues adventure.`,
      bookNow: "Book Now",
      paceLabel: "TRIP PACE",
      directions: "Directions",
      dayRoute: "Open day route in Maps",
      copyPlan: "Copy plan",
      copied: "Copied!",
      sharePlan: "Share on WhatsApp",
      stopsCount: (n: number) => `${n} stop${n !== 1 ? "s" : ""}`,
      pace: {
        relaxed: "Relaxed",
        balanced: "Balanced",
        packed: "Packed",
      },
      interests: {
        beach: "Beach & Lagoon",
        culture: "Culture & History",
        adventure: "Adventure & Hiking",
        food: "Food & Markets",
      },
    },

    // Map
    map: {
      eyebrow: "EXPLORE THE ISLAND",
      title: "ISLAND GUIDE",
      subtitle:
        "Discover Rodrigues' hidden gems. Tap any photo to zoom, or tap directions for live distance from where you are.",
      directions: "Directions & distance",
      scrollMore: "Scroll for more",
    },
    explore: {
      nav: "Explore",
      eyebrow: "START HERE",
      title: "What are you looking for?",
      subtitle:
        "Vehicles, places to eat, things to do — pick a category to explore.",
      cta: "Explore",
      option: "option",
      options: "options",
      back: "What are you looking for?",
      popular: "Popular",
    },

    // Ride Routes
    routes: {
      eyebrow: "SCENIC RIDES",
      title: "RIDE ROUTES",
      subtitle:
        "Hand-picked scooter routes across Rodrigues — open any one in Google Maps and just ride.",
      offline: "Works offline — load once, ride anywhere",
      openMaps: "Open in Google Maps",
      difficulty: { Easy: "Easy", Moderate: "Moderate", Advanced: "Advanced" },
    },

    // Waitlist
    waitlist: {
      eyebrow: "STAY IN THE LOOP",
      title: "ISLAND TIPS & DEALS",
      subtitle:
        "Join the list for exclusive offers, new routes, and the best of Rodrigues — straight to your inbox.",
      placeholder: "your@email.com",
      button: "Join",
      successTitle: "You're on the list!",
      successDesc: "We'll be in touch with the good stuff.",
      privacy: "No spam. Unsubscribe anytime.",
      invalid: "Please enter a valid email.",
      error: "Something went wrong. Please try again.",
    },

    // Useful numbers
    useful: {
      eyebrow: "GOOD TO KNOW",
      title: "USEFUL NUMBERS",
      subtitle:
        "Save these before you ride — emergencies, taxis and key local contacts. Tap any number to call.",
      groups: { emergency: "EMERGENCY", taxi: "TAXIS", other: "OTHER" },
    },

    // Events
    events: {
      eyebrow: "WHAT'S ON",
      title: "ISLAND EVENTS",
      subtitle:
        "Festivals, markets and happenings around Rodrigues during your stay.",
    },

    // Sponsors
    sponsors: {
      title: "PROUDLY SUPPORTED BY",
      heading: "Our Partners",
      subtitle:
        "The local businesses and friends who help us keep Rodrigues moving.",
    },

    // Experience / About
    experience: {
      eyebrow1: "THE ISLAND AWAITS",
      title1: "RODRIGUES LIKE YOU'VE NEVER SEEN IT",
      para1:
        "Wind along coastal cliffs where the turquoise lagoon stretches endlessly to the horizon. Discover hidden beaches only reachable by scooter, and weave through charming villages where locals greet you with a genuine smile.",
      para2:
        "Rodrigues is a world apart — unspoiled, unhurried, and utterly extraordinary. The best way to experience it all? On two wheels, at your own pace, with the wind as your only guide.",
      statLabel: "km of stunning coastal roads to discover at your own pace",
      eyebrow2: "EASY RENTAL PROCESS",
      title2: "THREE STEPS TO THE OPEN ROAD",
      stepLabel: "STEP",
      steps: [
        {
          title: "Choose Your Scooter",
          description:
            "Pick the Burgman 125 or the Avenis 125 — both are immaculate and ready to explore.",
        },
        {
          title: "Pay Securely",
          description:
            "Simple, transparent pricing. Book online or pay on arrival. No hidden fees, no surprises.",
        },
        {
          title: "Pick Up & Ride",
          description:
            "Collect your scooter at our location or opt for free island delivery on weekly rentals. The road is yours.",
        },
      ],
    },

    // Why us
    whyUs: {
      eyebrow: "WHY CHOOSE US",
      title: "RIDE WITH CONFIDENCE",
      features: [
        {
          title: "Fully Insured",
          description:
            "Ride with complete peace of mind. Every rental includes comprehensive third-party insurance coverage at no extra cost.",
        },
        {
          title: "Flexible Hours",
          description:
            "Pick up and drop off on your schedule. We work around your itinerary — early mornings and late evenings are no problem.",
        },
        {
          title: "Island Delivery",
          description:
            "We deliver your scooter directly to your hotel, guesthouse, or airport. Weekly rentals include free delivery island-wide.",
        },
        {
          title: "24/7 Support",
          description:
            "Got a flat tyre? Need directions? We're always one WhatsApp message away, day or night, wherever you are on the island.",
        },
      ],
    },

    // Pricing
    pricing: {
      eyebrow: "PRICING",
      title: "TRANSPARENT PRICING",
      model: "MODEL",
      daily: "Daily",
      threeDays: "3 Days",
      weekly: "Weekly",
      bestValue: "BEST VALUE",
      includedTitle: "ALWAYS INCLUDED",
      included: [
        "Helmet",
        "Third-party insurance",
        "24/7 WhatsApp support",
        "Free delivery on weekly rentals",
      ],
      quote: "Get a Quote",
    },

    // Gallery
    gallery: { eyebrow: "PHOTOS", title: "OUR SCOOTERS" },

    // Featured testimonials
    testimonials: { eyebrow: "REVIEWS", title: "WHAT RIDERS SAY" },

    // Marketplace
    marketplace: {
      eyebrow: "EXCLUSIVE OFFERS",
      title: "LOCAL DEALS",
      subtitle:
        "Special offers from our island partners — restaurants, tours, and activities exclusively for Roule Rodrigues riders.",
    },

    // Final CTA
    cta: {
      eyebrow: "GET STARTED",
      title: "READY TO RIDE?",
      subtitle:
        "Book your scooter online in 60 seconds. Cancel more than 48h before and 80% of your deposit is refunded.",
      bookNow: "Book Now",
    },

    // Customer reviews (Share Your Ride)
    reviews: {
      eyebrow: "RIDER REVIEWS",
      title: "SHARE YOUR RIDE",
      write: "Write a Review",
      beFirst: "Be the first to review",
      beFirstDesc:
        "Rented with us? Share your experience and help other travellers.",
      loading: "Loading reviews…",
      modalEyebrow: "YOUR EXPERIENCE",
      modalTitle: "Write a Review",
      ratingLabel: "YOUR RATING",
      nameLabel: "YOUR NAME",
      namePh: "e.g. Sophie L.",
      originLabel: "WHERE FROM (optional)",
      originPh: "e.g. Paris, France",
      scooterLabel: "WHICH SCOOTER? (optional)",
      selectPh: "— Select —",
      reviewLabel: "YOUR REVIEW",
      reviewPh: "Tell other travellers about your experience…",
      submit: "Submit Review",
      submitting: "Submitting…",
      thankTitle: "Thank you!",
      thankDesc:
        "Your review has been submitted and will appear on the site once our team approves it.",
      done: "Done",
      note: "Reviews are checked before appearing publicly.",
      errRating: "Please choose a star rating.",
      errName: "Please enter your name.",
      errText: "Please write a short review.",
    },

    // Taxi & Transport page
    taxi: {
      eyebrow: "RODRIGUES ISLAND · TRANSPORT",
      title1: "Taxi &",
      title2: "Transport",
      subtitle:
        "Trusted local drivers for airport transfers, island tours and point-to-point rides. Tap WhatsApp or call directly to agree your fare — and leave a review to help other travellers.",
      loading: "Loading drivers…",
      empty: "No drivers listed yet — check back soon.",
      topDriver: "TOP DRIVER",
      // M72 — the driver card shows a cover photo and says how many more there
      // are. That count was a literal "photos" in the JSX, so it stayed English
      // on a French or Kreol card. Vocabulary from components/IslandMap.tsx.
      photosCount: (n: number) => `${n} photo${n !== 1 ? "s" : ""}`,
      // The booking entry, in the page's own language. These three were
      // hardcoded English in a page otherwise fully translated, so a Kreol
      // reader met "FASTEST WAY / Tell us where you're going" mid-sentence.
      bookRide: "Book a ride",
      airportTransfer: "Airport transfer",
      followRide: "Already booked? Follow your ride",
      // M96: Roulé Rodrigues does not set taxi fares. Every driver charges
      // differently, so a number here would be a quote the platform cannot
      // honour — priceNote replaces it on every taxi surface.
      from: "From",
      priceNote:
        "We will confirm the price with you — no charge until you agree.",
      whatsapp: "WhatsApp",
      call: "Call",
      reviewsRate: "Reviews & rate",
      rate: "Rate this driver",
      fareNote:
        "We will confirm the price with you — no charge until you agree. Every driver sets their own fare; Roulé Rodrigues never takes payment for a ride.",
      disclaimer:
        "Taxi drivers are independent third parties listed for your convenience — Roule Rodrigues is not a transport operator and is not responsible for their service.",
      feedback: "DRIVER FEEDBACK",
      review: "review",
      reviews: "reviews",
      loadingReviews: "Loading reviews…",
      noReviews: (name: string) =>
        `No reviews yet — be the first to rate ${name}.`,
      rateThis: "RATE THIS DRIVER",
      yourName: "Your name",
      fromPh: "Where you're from (optional)",
      reviewPh: "How was your ride? Punctual, friendly, safe driving…",
      submit: "Submit review",
      submitting: "Submitting…",
      thankTitle: "Thank you!",
      thankDesc: "Your review is awaiting approval and will appear shortly.",
      done: "Done",
      moderationNote:
        "Reviews are checked before publishing to keep feedback fair.",
      errRating: "Please choose a star rating.",
      errName: "Please enter your name.",
      errText: "Please write a short review.",
      // /api/taxi/reviews used to answer with finished English prose — down to
      // the raw Postgres message on a failed insert — and the review modal
      // rendered whatever arrived. The route sends a code now and these are the
      // words that go with it. See reviewErrorMessage in app/taxi/page.tsx.
      errDriver: "Please choose a driver.",
      errBusy: "Too many attempts. Please wait a moment and try again.",
      errServer: "Something went wrong. Please try again.",
      errOffline: "No connection. Please try again.",
    },

    // Stay · Eat · Do (recommended places)
    stayEatDo: {
      eyebrow: "RECOMMENDED",
      all: "All",
      stay: "Stay",
      eat: "Eat",
      do: "Do",
      catHotel: "HOTEL",
      catRestaurant: "RESTAURANT",
      catActivity: "ACTIVITY",
      bookEnquire: "Book / Enquire",
      visit: "Visit",
      viewMap: "View on map",
      sponsored: "SPONSORED",
      disclaimer:
        "These are independent businesses listed for your convenience. Roule Rodrigues lists them so you can find them and is not responsible for their services or bookings.",
    },

    // Getting Around card
    gettingAround: {
      eyebrow: "GETTING AROUND",
      bestWay: "BEST WAY",
    },

    // Food Concierge (/food)
    food: {
      eyebrow: "FOOD CONCIERGE",
      title: "Your food concierge",
      subtitle: "Tell us what you fancy — we find and book the table.",
      free: "Free for you",
      local: "Local experts",
      fast: "Fast reply",
      cravingHeading: "What are you craving?",
      cravingHint: "Tap all that apply",
      budgetHeading: "Budget",
      budgetHint: "Optional",
      partyHeading: "How many?",
      partyHint: "Optional",
      cta: "Chat on WhatsApp",
      tip: "Not on the list? Just message us — we'll match you to what's cooking today.",
      previewTitle: "Your request",
      previewEmpty:
        "Pick a craving to start — or just tap the button and tell us in your own words.",
      clear: "Clear",
      areaHeading: "Where are you?",
      whenHeading: "When?",
      labelCraving: "Cravings",
      labelBudget: "Budget",
      labelParty: "Guests",
      labelArea: "Area",
      labelWhen: "When",
      cravings: {
        ourite: "Ourite (octopus)",
        fish: "Fresh fish of the day",
        seafood: "Seafood platter",
        creole: "Creole home cooking",
        snacks: "Local snacks & street food",
        desserts: "Rodriguan desserts",
        seaview: "Table by the sea",
        occasion: "Special occasion",
      },
      budgets: { budget: "Budget-friendly", moderate: "Moderate" },
      party: { two: "For 2", small: "3–4", group: "5+" },
      areas: {
        north: "North / Port Mathurin",
        east: "East coast",
        south: "South",
        west: "West / La Ferme",
        anywhere: "Anywhere",
      },
      when: {
        tonight: "Tonight",
        tomorrow: "Tomorrow",
        thisweek: "This week",
        lunch: "For lunch",
        flexible: "Flexible",
      },
      steps: {
        tell: "Tell us your craving",
        match: "We match you",
        book: "We book your table",
      },
      prefill:
        "Hello Roule Rodrigues 👋 I'd love your help finding a great place to eat on Rodrigues.",
    },
      placeBooking: {
      yourName: "Your name",
      validEmail: "Please enter a valid email address.",
      notes: "Anything we should know? (optional)",
      arrivalTitle: "ARRIVAL DETAILS",
      arrivalHint: "Arrival time, flight or ferry — so we know when you land",
      cancelTitle: "IF YOU NEED TO CANCEL",
      fullPolicy: "Full policy",
      priceForBooking: "Price for this booking",
      totalToPay: "Total to pay now",
      paidInFull: "Paid in full to confirm. Nothing further to settle on arrival.",
      requestReservation: "Request reservation",
      requestSent: "Request sent!",
      requestReceived: "Booking request received!",
      confirmed: "Reservation confirmed!",
      error: "Something went wrong. Please try again.",
      whatsappChat: "Prefer to chat? Message us on WhatsApp",
      whatsappCta: "Message us on WhatsApp",
      eitherWay: "We message you on WhatsApp either way — free or not.",
      eitherWayEmailPrefix: "We email",
      eitherWaySuffix: "either way — free or not.",
    },
    orderTrack: {
      title: "Track your order",
      noAccount: "No account needed — enter your order number and the email you ordered with.",
      orderNumber: "Order number",
      find: "Find my order",
      another: "Look up another order",
      hint: "Your order number is in your confirmation email.",
      confirmed: "Order confirmed",
      emailed: "We have emailed your confirmation to",
      timeRemaining: "Time remaining:",
      attachReceipt: "Attach the receipt to continue.",
      createAccount: "Create account or sign in",
      createWithEmail: "Create an account with this email to track future orders",
    },
    install: {
      install: "Install app",
      installNow: "Install now",
      installApp: "Install the app",
      installTitle: "Install Roule Rodrigues",
      subtitle: "Add it to your home screen — opens like an app.",
      tapThe: "Tap the",
      clickThe: "Click the",
      scrollDown: "Scroll down and tap",
      browserMenu: "Or open the browser menu",
    },
    auth: {
      myAccount: "MY ACCOUNT",
      password: "Password",
      forgot: "Forgot password?",
      resetTitle: "Reset your password",
      resetHint: "We will email you a link to choose a new one.",
      sendReset: "Send reset link",
      backToSignIn: "Back to sign in",
      checkInbox: "Check your inbox",
      ifAccountExists: "If an account exists for",
      confirmEmail: "Confirm your email",
      sentConfirmation: "We sent a confirmation link to",
      linkExpired: "That sign-in link has expired or was already used. Please sign in again.",
    },
},

  // ── FRENCH ──────────────────────────────────────────────────────────────────
  fr: {
    picker: {
      heading: "Choisissez votre langue",
      subheading: "Sélectionnez votre langue préférée pour continuer",
    },
    nav: {
      scooters: "Scooters",
      booking: "Réservation",
      pricing: "Tarifs",
      map: "Carte de l'Île",
      taxi: "Taxi",
      stayEatDo: "Loger · Manger · Faire",
      routes: "Itinéraires",
      events: "Événements",
      contact: "Contact",
      account: "Mon compte",
      bookNow: "Réserver",
    },
    fleet: {
      sectionEyebrow: "NOTRE FLOTTE",
      sectionTitle: "CHOISISSEZ VOTRE SCOOTER",
      sectionSub: "Deux icônes de Rodrigues. Impeccables. Prêts pour vous.",
      available: "DISPONIBLE",
      unavailable: "INDISPONIBLE",
      bookedToday: "RÉSERVÉ AUJOURD'HUI",
      bookNow: "Réserver",
      unavailableBtn: "Indisponible",
      allTypes: "Tous",
      bookedThisWeek: (n: number) => `Réservé ${n}× cette semaine`,
    },
    booking: {
      eyebrow: "RÉSERVEZ EN LIGNE",
      title: "RÉSERVER EN LIGNE",
      subtitle:
        "Choisissez votre véhicule, sélectionnez vos dates, et nous confirmerons votre réservation dans les heures qui suivent.",
      scooterLabel: "VÉHICULE",
      scooterPlaceholder: "Choisir un véhicule…",
      pickupLabel: "DATE DE PRISE EN CHARGE",
      returnLabel: "DATE DE RETOUR",
      nameLabel: "VOTRE NOM",
      namePlaceholder: "Nom complet",
      emailLabel: "EMAIL",
      phoneLabel: "TÉLÉPHONE / WHATSAPP",
      phonePlaceholder: "+230 XXXX XXXX",
      messageLabel: "DEMANDES SPÉCIALES",
      messagePlaceholder:
        "Nom de l'hôtel, adresse de livraison, casque supplémentaire…",
      partnerPrompt:
        "Avez-vous un code partenaire ou de recommandation hôtel ?",
      partnerLabel: "CODE PARTENAIRE",
      partnerPlaceholder: "ex. CHEZ-FRANCINE",
      partnerHint: "Demandez le code à votre hôtel ou pension de famille.",
      submit: "Demander une réservation",
      sending: "Envoi en cours…",
      sent: "Demande envoyée !",
      successTitle: "Demande reçue — vérification en cours",
      successDesc:
        "Nous confirmons ce véhicule auprès de son propriétaire. Dès que c'est confirmé, nous vous enverrons un lien pour payer et le réserver. Rien n'est débité avant.",
      checkingTitle: "La suite",
      checkingStep1: "Nous vérifions que le véhicule est libre à vos dates.",
      checkingStep2:
        "Nous vous écrivons pour confirmer — en général sous quelques heures.",
      checkingStep3: "Vous payez, et le véhicule est à vous pour ces dates.",
      checkingNote:
        "S'il n'est pas libre, nous vous le dirons tout de suite et vous proposerons un équivalent — vous ne serez jamais débité pour un véhicule que nous ne pouvons pas fournir.",
      errorTitle: "Une erreur s'est produite",
      errorDesc:
        "Veuillez réessayer ou nous contacter directement sur WhatsApp.",
      summaryTitle: "RÉCAPITULATIF",
      summaryScooter: "Véhicule",
      summaryPickup: "Prise en charge",
      summaryReturn: "Retour",
      summaryDuration: "Durée",
      summaryRental: "Location",
      summaryDelivery: "Livraison",
      deliveryNote: "Livraison + récupération",
      deliveryFree: "Gratuite",
      summaryTotal: "Total estimé",
      depositToConfirm: (pct: number) => `Acompte pour confirmer (${pct}%)`,
      balanceAtPickup: "Solde au retrait",
      discountNote: "Réduction multi-jours appliquée !",
      availabilityTitle: "DISPONIBILITÉ",
      includedTitle: "INCLUS",
      included: [
        "Casque & antivol",
        "Plein d'essence",
        "Support WhatsApp 24h/24",
        "Livraison gratuite à l'hôtel",
        "Assurance responsabilité civile",
      ],
      requestNote:
        "Envoyer ce formulaire nous demande de réserver le véhicule. Nous vérifions qu'il est libre à ces dates et vous répondons, généralement sous quelques heures — une fois confirmé, il est à vous le temps du paiement.",
      bookedDatesLabel: "DÉJÀ RÉSERVÉ",
      overlapWarning:
        "Ces dates chevauchent une réservation existante. Veuillez choisir d'autres dates.",
      datesLabel: "CHOISISSEZ VOS DATES",
      calBooked: "Réservé",
      calAvailable: "Disponible",
      calSelected: "Vos dates",
      calHint: "Touchez la prise puis le retour",
      tripPrefill: (n: number) =>
        `Réservation pour votre voyage de ${n} jour${n > 1 ? "s" : ""} ✨ Les dates sont pré-remplies — choisissez votre date de prise en charge et votre scooter.`,
      referredBy: (code: string) =>
        `Recommandé par ${code} — votre réservation leur est automatiquement liée.`,
      confirmWhatsApp: "Confirmer sur WhatsApp",
      agreeBefore: "J'accepte les",
      agreeLink: "Conditions & Règles de location",
      agreeError:
        "Veuillez accepter les Conditions & Règles de location pour continuer.",
      days: (n: number) => `${n} jour${n > 1 ? "s" : ""}`,
    },
    manageBooking: {
      title: "Suivre votre commande",
      subtitleVehicle:
        "Aucun compte nécessaire — entrez votre référence et l'e-mail utilisé pour réserver.",
      subtitleShop:
        "Les commandes boutique sont liées au compte avec lequel vous avez commandé.",
      tabsLabel: "Que suivez-vous ?",
      tabVehicle: "Location de véhicule",
      tabShop: "Commande boutique",
      shopTitle: "Vos commandes boutique",
      shopBody:
        "Connectez-vous avec l'e-mail utilisé au paiement pour voir toutes vos commandes, leur statut et les coordonnées bancaires de la boutique.",
      shopCta: "Voir mes commandes",
      shopSwitchBefore:
        "Vous avez plutôt loué un scooter ou une voiture ? Passez à",
      shopSwitchAfter: "ci-dessus — aucun compte n'est nécessaire.",
      refLabel: "Référence de réservation",
      emailLabel: "Email",
      find: "Trouver ma réservation",
      refHint:
        "Votre référence se trouve dans votre e-mail de confirmation et votre reçu (elle ressemble à RR-XXXXXX).",
      errMissing: "Entrez votre référence de réservation et votre e-mail.",
      errNotFound: "Nous n'avons pas trouvé cette réservation.",
      statusCancelled: "Annulée",
      statusCompleted: "Terminée",
      statusConfirmed: "Confirmé",
      statusAwaiting: "En attente de l'acompte",
      cancelledBody:
        "Cette réservation a été annulée — soit le délai est passé avant qu'elle ne soit confirmée, soit le véhicule a été réservé par quelqu'un d'autre avant vous.",
      cancelledNoCharge: "Vous n'avez pas été débité.",
      bookAgain: "Réserver à nouveau",
      rowVehicle: "Véhicule",
      rowReservation: "Réservation",
      rowWhen: "Quand",
      rowTotal: "Total estimé",
      rowPaidInFull: "Payé en totalité",
      rowDepositPaid: "Acompte payé",
      rowDepositToConfirm: "Acompte pour confirmer",
      rowBalanceAtPickup: "Solde au retrait",
      rowBalance: "Solde",
      rowNothingToPay: "Plus rien à payer",
      checkingTitle: "Nous vérifions la disponibilité",
      checkingBody:
        "Nous confirmons ce véhicule auprès de son propriétaire. Dès que c'est confirmé, nous vous écrirons et vous pourrez payer ici. Rien n'est débité avant — et s'il n'est pas libre, nous vous proposerons un équivalent.",
      noteTitle: "À propos de votre demande",
      approvedTitle: "Il est disponible — à vous de le confirmer",
      holdingUntil: (when: string) =>
        `Nous le gardons pour vous jusqu'au ${when}. Passé ce délai, il repart aux autres clients.`,
      payBelow: "Payez ci-dessous pour le confirmer.",
      lookUpAnother: "Suivre une autre réservation",
    },
    contact: {
      eyebrow: "NOUS CONTACTER",
      title: "CONTACTEZ-NOUS",
      subtitle:
        "Prêt à explorer Rodrigues à deux roues ? Écrivez-nous sur WhatsApp pour une réponse rapide, ou remplissez le formulaire.",
      nameLabel: "NOM",
      emailLabel: "EMAIL",
      phoneLabel: "TÉLÉPHONE",
      scooterLabel: "SCOOTER",
      datesLabel: "DATES DE LOCATION",
      datesPlaceholder: "ex. 15 Jan – 22 Jan",
      messageLabel: "MESSAGE",
      messagePlaceholder: "Questions ou demandes spéciales ?",
      submit: "Envoyer le message",
      sending: "Envoi…",
      sent: "Envoyé !",
      successTitle: "Message envoyé !",
      successDesc:
        "Nous vous répondrons dans les heures qui suivent. Vérifiez aussi votre WhatsApp !",
      errorTitle: "Une erreur s'est produite",
      errorDesc:
        "Veuillez réessayer ou nous contacter directement sur WhatsApp.",
    },
    footer: {
      navigate: "NAVIGATION",
      follow: "SUIVEZ-NOUS",
      tagline:
        "Explorez Rodrigues. Roulez libre. Location de scooters premium sur la plus belle île de l'Océan Indien.",
      tag: "Identifiez-nous dans vos aventures à Rodrigues.",
      rights: (year: number) =>
        `© ${year} Roule Rodrigues. Tous droits réservés.`,
      location: "Île Rodrigues, République de Maurice",
      legal: "LÉGAL",
      terms: "Conditions",
      privacy: "Confidentialité",
      refunds: "Remboursements",
      disclaimer: "Avertissement",
      notice: "Mentions légales",
      listScooter: "Référencez votre activité",
    },
    planner: {
      eyebrow: "PERSONNALISÉ POUR VOUS",
      title: "PLANIFICATEUR",
      subtitle:
        "Dites-nous combien de jours vous avez et ce que vous aimez — nous créerons votre itinéraire idéal à Rodrigues.",
      daysLabel: "JOURS À RODRIGUES",
      interestsLabel: "CE QUE VOUS AIMEZ",
      plan: "Planifier mon voyage",
      planning: "Création de votre itinéraire…",
      emptyTitle: "Votre itinéraire apparaîtra ici",
      emptyDesc:
        "Choisissez vos jours, vos intérêts, et cliquez sur Planifier.",
      loadingDesc: (n: number) =>
        `Cartographie des meilleurs sites de Rodrigues pour ${n} jour${n > 1 ? "s" : ""}`,
      dayOf: (d: number, t: number) => `JOUR ${d} SUR ${t}`,
      prevDay: "Jour précédent",
      nextDay: "Jour suivant",
      readyTitle: "Prêt à rouler ?",
      readyDesc: (n: number) =>
        `Réservez votre scooter et commencez votre aventure de ${n} jour${n > 1 ? "s" : ""} à Rodrigues.`,
      bookNow: "Réserver",
      paceLabel: "RYTHME DU SÉJOUR",
      directions: "Itinéraire",
      dayRoute: "Ouvrir la journée dans Maps",
      copyPlan: "Copier le plan",
      copied: "Copié !",
      sharePlan: "Partager sur WhatsApp",
      stopsCount: (n: number) => `${n} étape${n !== 1 ? "s" : ""}`,
      pace: {
        relaxed: "Tranquille",
        balanced: "Équilibré",
        packed: "Intense",
      },
      interests: {
        beach: "Plages & Lagon",
        culture: "Culture & Histoire",
        adventure: "Aventure & Randonnée",
        food: "Gastronomie & Marchés",
      },
    },
    map: {
      eyebrow: "EXPLORER L'ÎLE",
      title: "GUIDE DE L'ÎLE",
      subtitle:
        "Découvrez les trésors cachés de Rodrigues. Touchez une photo pour l'agrandir, ou « itinéraire » pour la distance depuis votre position.",
      directions: "Itinéraire & distance",
      scrollMore: "Faites défiler",
    },
    explore: {
      nav: "Explorer",
      eyebrow: "COMMENCEZ ICI",
      title: "Que recherchez-vous ?",
      subtitle:
        "Véhicules, restaurants, activités — choisissez une catégorie à explorer.",
      cta: "Explorer",
      option: "option",
      options: "options",
      back: "Que recherchez-vous ?",
      popular: "Populaire",
    },
    routes: {
      eyebrow: "ITINÉRAIRES",
      title: "PARCOURS À SCOOTER",
      subtitle:
        "Des itinéraires en scooter triés sur le volet à Rodrigues — ouvrez-en un dans Google Maps et roulez.",
      offline: "Fonctionne hors-ligne — chargez une fois, roulez partout",
      openMaps: "Ouvrir dans Google Maps",
      difficulty: { Easy: "Facile", Moderate: "Modéré", Advanced: "Difficile" },
    },
    waitlist: {
      eyebrow: "RESTEZ INFORMÉ",
      title: "CONSEILS & OFFRES",
      subtitle:
        "Inscrivez-vous pour des offres exclusives, de nouveaux parcours et le meilleur de Rodrigues — directement dans votre boîte mail.",
      placeholder: "votre@email.com",
      button: "S'inscrire",
      successTitle: "Vous êtes inscrit !",
      successDesc: "Nous vous écrirons avec les bonnes nouvelles.",
      privacy: "Pas de spam. Désinscription à tout moment.",
      invalid: "Veuillez saisir un email valide.",
      error: "Une erreur s'est produite. Veuillez réessayer.",
    },
    useful: {
      eyebrow: "BON À SAVOIR",
      title: "NUMÉROS UTILES",
      subtitle:
        "Enregistrez-les avant de rouler — urgences, taxis et contacts locaux. Touchez un numéro pour appeler.",
      groups: { emergency: "URGENCES", taxi: "TAXIS", other: "AUTRES" },
    },
    events: {
      eyebrow: "À L'AFFICHE",
      title: "ÉVÉNEMENTS",
      subtitle:
        "Festivals, marchés et animations à Rodrigues pendant votre séjour.",
    },
    sponsors: {
      title: "FIÈREMENT SOUTENU PAR",
      heading: "Nos Partenaires",
      subtitle:
        "Les entreprises locales et amis qui nous aident à faire vivre Rodrigues.",
    },
    experience: {
      eyebrow1: "L'ÎLE VOUS ATTEND",
      title1: "RODRIGUES COMME JAMAIS",
      para1:
        "Longez les falaises côtières où le lagon turquoise s'étend à l'infini jusqu'à l'horizon. Découvrez des plages cachées accessibles uniquement en scooter, et traversez des villages pittoresques où les habitants vous accueillent avec un sourire sincère.",
      para2:
        "Rodrigues est un monde à part — préservé, paisible et tout simplement extraordinaire. La meilleure façon de tout vivre ? À deux roues, à votre rythme, avec le vent pour seul guide.",
      statLabel: "km de routes côtières magnifiques à découvrir à votre rythme",
      eyebrow2: "LOCATION FACILE",
      title2: "TROIS ÉTAPES VERS LA LIBERTÉ",
      stepLabel: "ÉTAPE",
      steps: [
        {
          title: "Choisissez votre scooter",
          description:
            "Optez pour le Burgman 125 ou l'Avenis 125 — tous deux impeccables et prêts à explorer.",
        },
        {
          title: "Payez en toute sécurité",
          description:
            "Tarifs simples et transparents. Réservez en ligne ou payez à l'arrivée. Aucun frais caché, aucune surprise.",
        },
        {
          title: "Récupérez et roulez",
          description:
            "Récupérez votre scooter à notre point de retrait ou profitez de la livraison gratuite sur les locations à la semaine. La route est à vous.",
        },
      ],
    },
    whyUs: {
      eyebrow: "POURQUOI NOUS CHOISIR",
      title: "ROULEZ EN CONFIANCE",
      features: [
        {
          title: "Entièrement assuré",
          description:
            "Roulez l'esprit tranquille. Chaque location inclut une assurance responsabilité civile complète, sans frais supplémentaires.",
        },
        {
          title: "Horaires flexibles",
          description:
            "Prise et retour selon votre emploi du temps. Nous nous adaptons à votre itinéraire — tôt le matin ou tard le soir, aucun souci.",
        },
        {
          title: "Livraison sur l'île",
          description:
            "Nous livrons votre scooter directement à votre hôtel, pension ou aéroport. Livraison gratuite pour les locations à la semaine.",
        },
        {
          title: "Support 24h/24",
          description:
            "Un pneu crevé ? Besoin d'indications ? Nous sommes à un message WhatsApp, jour et nuit, où que vous soyez sur l'île.",
        },
      ],
    },
    pricing: {
      eyebrow: "TARIFS",
      title: "TARIFS TRANSPARENTS",
      model: "MODÈLE",
      daily: "Journée",
      threeDays: "3 Jours",
      weekly: "Semaine",
      bestValue: "MEILLEUR PRIX",
      includedTitle: "TOUJOURS INCLUS",
      included: [
        "Casque",
        "Assurance responsabilité civile",
        "Support WhatsApp 24h/24",
        "Livraison gratuite à la semaine",
      ],
      quote: "Demander un devis",
    },
    gallery: { eyebrow: "PHOTOS", title: "NOS SCOOTERS" },
    testimonials: { eyebrow: "AVIS", title: "CE QUE DISENT LES CLIENTS" },
    marketplace: {
      eyebrow: "OFFRES EXCLUSIVES",
      title: "BONS PLANS LOCAUX",
      subtitle:
        "Offres spéciales de nos partenaires de l'île — restaurants, excursions et activités, exclusivement pour les clients de Roule Rodrigues.",
    },
    cta: {
      eyebrow: "COMMENCER",
      title: "PRÊT À ROULER ?",
      subtitle:
        "Réservez votre scooter en ligne en 60 secondes. Annulez plus de 48 h avant : 80 % de l'acompte remboursé.",
      bookNow: "Réserver",
    },
    reviews: {
      eyebrow: "AVIS DES CLIENTS",
      title: "PARTAGEZ VOTRE EXPÉRIENCE",
      write: "Laisser un avis",
      beFirst: "Soyez le premier à donner votre avis",
      beFirstDesc:
        "Vous avez loué chez nous ? Partagez votre expérience et aidez d'autres voyageurs.",
      loading: "Chargement des avis…",
      modalEyebrow: "VOTRE EXPÉRIENCE",
      modalTitle: "Laisser un avis",
      ratingLabel: "VOTRE NOTE",
      nameLabel: "VOTRE NOM",
      namePh: "ex. Sophie L.",
      originLabel: "D'OÙ VENEZ-VOUS (optionnel)",
      originPh: "ex. Paris, France",
      scooterLabel: "QUEL SCOOTER ? (optionnel)",
      selectPh: "— Choisir —",
      reviewLabel: "VOTRE AVIS",
      reviewPh: "Parlez de votre expérience aux autres voyageurs…",
      submit: "Envoyer l'avis",
      submitting: "Envoi…",
      thankTitle: "Merci !",
      thankDesc:
        "Votre avis a été envoyé et apparaîtra sur le site une fois approuvé par notre équipe.",
      done: "Terminé",
      note: "Les avis sont vérifiés avant publication.",
      errRating: "Veuillez choisir une note.",
      errName: "Veuillez saisir votre nom.",
      errText: "Veuillez écrire un court avis.",
    },

    // Page Taxi & Transport
    taxi: {
      eyebrow: "ÎLE RODRIGUES · TRANSPORT",
      title1: "Taxi &",
      title2: "Transport",
      subtitle:
        "Des chauffeurs locaux de confiance pour les transferts aéroport, les tours de l'île et les trajets ponctuels. Touchez WhatsApp ou appelez directement pour convenir du tarif — et laissez un avis pour aider les autres voyageurs.",
      loading: "Chargement des chauffeurs…",
      empty: "Aucun chauffeur pour le moment — revenez bientôt.",
      topDriver: "TOP CHAUFFEUR",
      photosCount: (n: number) => `${n} photo${n > 1 ? "s" : ""}`,
      bookRide: "Réserver une course",
      airportTransfer: "Transfert aéroport",
      followRide: "Déjà réservé ? Suivez votre course",
      from: "À partir de",
      priceNote:
        "Nous confirmerons le prix avec vous — rien n’est débité avant votre accord.",
      whatsapp: "WhatsApp",
      call: "Appeler",
      reviewsRate: "Avis & noter",
      rate: "Noter ce chauffeur",
      fareNote:
        "Nous confirmerons le prix avec vous — rien n’est débité avant votre accord. Chaque chauffeur fixe son tarif ; Roulé Rodrigues n’encaisse jamais une course.",
      disclaimer:
        "Les chauffeurs de taxi sont des tiers indépendants listés pour votre commodité — Roule Rodrigues n'est pas un opérateur de transport et n'est pas responsable de leur service.",
      feedback: "AVIS CHAUFFEUR",
      review: "avis",
      reviews: "avis",
      loadingReviews: "Chargement des avis…",
      noReviews: (name: string) =>
        `Pas encore d'avis — soyez le premier à noter ${name}.`,
      rateThis: "NOTER CE CHAUFFEUR",
      yourName: "Votre nom",
      fromPh: "D'où venez-vous (facultatif)",
      reviewPh:
        "Comment s'est passé votre trajet ? Ponctuel, sympathique, conduite sûre…",
      submit: "Envoyer l'avis",
      submitting: "Envoi…",
      thankTitle: "Merci !",
      thankDesc:
        "Votre avis est en attente d'approbation et apparaîtra bientôt.",
      done: "Terminé",
      moderationNote:
        "Les avis sont vérifiés avant publication pour rester équitables.",
      errRating: "Veuillez choisir une note.",
      errName: "Veuillez saisir votre nom.",
      errText: "Veuillez écrire un court avis.",
      errDriver: "Veuillez choisir un chauffeur.",
      errBusy: "Trop de tentatives. Veuillez patienter un instant et réessayer.",
      errServer: "Une erreur s’est produite. Veuillez réessayer.",
      errOffline: "Pas de connexion. Vérifiez votre réseau et réessayez.",
    },

    // Loger · Manger · Faire (lieux recommandés)
    stayEatDo: {
      eyebrow: "RECOMMANDÉ",
      all: "Tout",
      stay: "Loger",
      eat: "Manger",
      do: "Faire",
      catHotel: "HÔTEL",
      catRestaurant: "RESTAURANT",
      catActivity: "ACTIVITÉ",
      bookEnquire: "Réserver / Demander",
      visit: "Visiter",
      viewMap: "Voir sur la carte",
      sponsored: "SPONSORISÉ",
      disclaimer:
        "Ce sont des entreprises indépendantes listées pour votre commodité. Roule Rodrigues les référence pour vous aider à les trouver et n'est pas responsable de leurs services ou réservations.",
    },

    // Carte Se déplacer
    gettingAround: {
      eyebrow: "SE DÉPLACER",
      bestWay: "MEILLEUR CHOIX",
    },

    // Concierge culinaire (/food)
    food: {
      eyebrow: "CONCIERGE CULINAIRE",
      title: "Votre concierge culinaire",
      subtitle:
        "Dites-nous ce qui vous fait envie — on trouve et réserve la table.",
      free: "Gratuit pour vous",
      local: "Experts locaux",
      fast: "Réponse rapide",
      cravingHeading: "De quoi avez-vous envie ?",
      cravingHint: "Touchez tout ce qui vous tente",
      budgetHeading: "Budget",
      budgetHint: "Facultatif",
      partyHeading: "Combien de personnes ?",
      partyHint: "Facultatif",
      cta: "Discuter sur WhatsApp",
      tip: "Pas dans la liste ? Écrivez-nous — on vous oriente vers ce qui se cuisine aujourd'hui.",
      previewTitle: "Votre demande",
      previewEmpty:
        "Choisissez une envie pour commencer — ou touchez le bouton et dites-nous en quelques mots.",
      clear: "Effacer",
      labelCraving: "Envies",
      labelBudget: "Budget",
      areaHeading: "Où êtes-vous ?",
      whenHeading: "Quand ?",
      labelParty: "Personnes",
      labelArea: "Zone",
      labelWhen: "Quand",
      cravings: {
        ourite: "Ourite (poulpe)",
        fish: "Poisson frais du jour",
        seafood: "Plateau de fruits de mer",
        creole: "Cuisine créole maison",
        snacks: "Snacks & street food locaux",
        desserts: "Desserts rodriguais",
        seaview: "Table face à la mer",
        occasion: "Occasion spéciale",
      },
      budgets: { budget: "Économique", moderate: "Modéré" },
      party: { two: "Pour 2", small: "3–4", group: "5+" },
      areas: {
        north: "Nord / Port Mathurin",
        east: "Côte est",
        south: "Sud",
        west: "Ouest / La Ferme",
        anywhere: "N'importe où",
      },
      when: {
        tonight: "Ce soir",
        tomorrow: "Demain",
        thisweek: "Cette semaine",
        lunch: "Pour le déjeuner",
        flexible: "Flexible",
      },
      steps: {
        tell: "Dites-nous votre envie",
        match: "On vous oriente",
        book: "On réserve votre table",
      },
      prefill:
        "Bonjour Roule Rodrigues 👋 J'aimerais votre aide pour trouver un bon endroit où manger à Rodrigues.",
    },
      placeBooking: {
      yourName: "Votre nom",
      validEmail: "Merci d’entrer une adresse e-mail valide.",
      notes: "Quelque chose à nous signaler ? (facultatif)",
      arrivalTitle: "VOTRE ARRIVÉE",
      arrivalHint: "Heure d’arrivée, vol ou bateau — pour savoir quand vous arrivez",
      cancelTitle: "SI VOUS DEVEZ ANNULER",
      fullPolicy: "Conditions complètes",
      priceForBooking: "Prix de cette réservation",
      totalToPay: "Total à payer maintenant",
      paidInFull: "Payé en totalité pour confirmer. Plus rien à régler à l’arrivée.",
      requestReservation: "Demander la réservation",
      requestSent: "Demande envoyée !",
      requestReceived: "Demande de réservation reçue !",
      confirmed: "Réservation confirmée !",
      error: "Une erreur est survenue. Merci de réessayer.",
      whatsappChat: "Vous préférez discuter ? Écrivez-nous sur WhatsApp",
      whatsappCta: "Écrivez-nous sur WhatsApp",
      eitherWay: "Nous vous écrivons sur WhatsApp dans tous les cas — payant ou non.",
      eitherWayEmailPrefix: "Nous écrivons à",
      eitherWaySuffix: "dans tous les cas — payant ou non.",
    },
    orderTrack: {
      title: "Suivre ma commande",
      noAccount: "Pas besoin de compte — entrez votre numéro de commande et l’e-mail utilisé.",
      orderNumber: "Numéro de commande",
      find: "Trouver ma commande",
      another: "Chercher une autre commande",
      hint: "Votre numéro de commande se trouve dans l’e-mail de confirmation.",
      confirmed: "Commande confirmée",
      emailed: "Nous avons envoyé votre confirmation à",
      timeRemaining: "Temps restant :",
      attachReceipt: "Joignez le reçu pour continuer.",
      createAccount: "Créer un compte ou se connecter",
      createWithEmail: "Créez un compte avec cet e-mail pour suivre vos prochaines commandes",
    },
    install: {
      install: "Installer l’app",
      installNow: "Installer maintenant",
      installApp: "Installer l’application",
      installTitle: "Installer Roule Rodrigues",
      subtitle: "Ajoutez-la à votre écran d’accueil — elle s’ouvre comme une application.",
      tapThe: "Appuyez sur",
      clickThe: "Cliquez sur",
      scrollDown: "Descendez et appuyez sur",
      browserMenu: "Ou ouvrez le menu du navigateur",
    },
    auth: {
      myAccount: "MON COMPTE",
      password: "Mot de passe",
      forgot: "Mot de passe oublié ?",
      resetTitle: "Réinitialiser votre mot de passe",
      resetHint: "Nous vous enverrons un lien pour en choisir un nouveau.",
      sendReset: "Envoyer le lien",
      backToSignIn: "Retour à la connexion",
      checkInbox: "Regardez votre boîte mail",
      ifAccountExists: "Si un compte existe pour",
      confirmEmail: "Confirmez votre e-mail",
      sentConfirmation: "Nous avons envoyé un lien de confirmation à",
      linkExpired: "Ce lien de connexion a expiré ou a déjà été utilisé. Merci de vous reconnecter.",
    },
},

  // ── KREOL RODRIG ────────────────────────────────────────────────────────────
  cr: {
    picker: {
      heading: "Swazi ou langaz",
      subheading: "Séleksionn langaz ou prefer pou kontinie",
    },
    nav: {
      scooters: "Skooter",
      booking: "Rezervasion",
      pricing: "Pri",
      map: "Kar Zil",
      taxi: "Taksi",
      stayEatDo: "Reste · Manze · Fer",
      routes: "Trazé",
      events: "Evennman",
      contact: "Kontakt",
      account: "Mo Kont",
      bookNow: "Rezerv Astèr",
    },
    fleet: {
      sectionEyebrow: "NOU LOTO",
      sectionTitle: "SWAZI OU LOTO",
      sectionSub: "De loto emblematik Rodrig. Prop ek pare pou ou.",
      available: "DISPONIB",
      unavailable: "PA DISPONIB",
      bookedToday: "REZERVE ZORDI",
      bookNow: "Rezerv Astèr",
      unavailableBtn: "Pa Disponib",
      allTypes: "Tou",
      bookedThisWeek: (n: number) => `Rezerve ${n}× sa semenn la`,
    },
    booking: {
      eyebrow: "REZERV AN LIZINN",
      title: "REZERV AN LIZINN",
      subtitle:
        "Swazi ou veikil, swazi ou dat, ek nou pou konfirm ou rezervasion dan kektan.",
      scooterLabel: "VEIKIL",
      scooterPlaceholder: "Swazi enn veikil…",
      pickupLabel: "DAT PRAN",
      returnLabel: "DAT RETIR",
      nameLabel: "OU NON",
      namePlaceholder: "Non konplet",
      emailLabel: "EMAIL",
      phoneLabel: "TELEFONN / WHATSAPP",
      phonePlaceholder: "+230 XXXX XXXX",
      messageLabel: "DEMANN SPESIAL",
      messagePlaceholder: "Non lotel, ladrès livrezon, kasket ekstra…",
      partnerPrompt: "Ou ena enn kode partner ou lotel?",
      partnerLabel: "KOD PARTNER",
      partnerPlaceholder: "ex. CHEZ-FRANCINE",
      partnerHint: "Demann kode la kot ou lotel ou pansion.",
      submit: "Demann Rezervasion",
      sending: "Anvoy…",
      sent: "Demann Anvoy!",
      successTitle: "Nou finn gagn ou demann — nou pe verifye",
      successDesc:
        "Nou pe konfirm sa veikil la ar so proprieter. Kan li konfirme, nou avoy ou enn lien pou peye ek blok li. Nanye pa debite avan sa.",
      checkingTitle: "Ki pou arive apre",
      checkingStep1: "Nou verifye ki veikil la lib pou ou bann dat.",
      checkingStep2: "Nou ekrir ou pou konfirme — normalman dan detrwa erdtan.",
      checkingStep3: "Ou peye, ek veikil la pou ou pou sa bann dat la.",
      checkingNote:
        "Si li pa lib, nou dir ou deswit ek propoz ou enn lot parey — nou pa pou zame debit ou pou enn veikil ki nou pa kapav donn ou.",
      errorTitle: "Enn zafer finn mal pas",
      errorDesc: "Esey ankor ou kontakt nou lor WhatsApp.",
      summaryTitle: "REZIME REZERVASION",
      summaryScooter: "Veikil",
      summaryPickup: "Dat Pran",
      summaryReturn: "Dat Retir",
      summaryDuration: "Dire",
      summaryRental: "Lokasion",
      summaryDelivery: "Livrezon",
      deliveryNote: "Livrezon + rekiperasion",
      deliveryFree: "Gratis",
      summaryTotal: "Total Estime",
      depositToConfirm: (pct: number) => `Depo pou konfirmen (${pct}%)`,
      balanceAtPickup: "Balans kan ou pran li",
      discountNote: "Reduksion plizie zour aplike!",
      availabilityTitle: "DISPONIBILITE",
      includedTitle: "INKLI",
      included: [
        "Kasket & kadna",
        "Reservoir plen",
        "Sipor WhatsApp 24/7",
        "Livrezon gratis kot lotel",
        "Assirans responsabilite sivil",
      ],
      requestNote:
        "Avoy sa form la, nou demann pou gard veikil la pou ou. Nou verifie si li lib sa bann dat la ek nou reponn ou, dabitid dan detrwa er — kan nou konfirme, li pou ou pandan ou peye.",
      bookedDatesLabel: "DEZA REZERVE",
      overlapWarning:
        "Sa bann dat la pe sevose ar enn lot rezervasion. Silvouple swazi lezot dat.",
      datesLabel: "SWAZI OU BANN DAT",
      calBooked: "Rezerve",
      calAvailable: "Disponib",
      calSelected: "Ou bann dat",
      calHint: "Tous dat pran, apre dat retir",
      tripPrefill: (n: number) =>
        `Rezervasion pou ou vwayaz ${n} zour ✨ Bann dat fini ranpli — swazi zis ou dat pran ek ou skooter.`,
      referredBy: (code: string) =>
        `Rekomande par ${code} — ou rezervasion lie ar zot otomatikman.`,
      confirmWhatsApp: "Konfirme lor WhatsApp",
      agreeBefore: "Mo aksepte bann",
      agreeLink: "Kondision & Reg Lokasion",
      agreeError:
        "Silvouple aksepte bann Kondision & Reg Lokasion pou kontinie.",
      days: (n: number) => `${n} zour`,
    },
    manageBooking: {
      title: "Swiv ou komann",
      subtitleVehicle:
        "Pena bizin kont — met ou referans ek email ki ou finn servi pou rezerve.",
      subtitleShop:
        "Bann komann laboutik lie ar kont ki ou finn servi pou komande.",
      tabsLabel: "Ki ou pe swiv?",
      tabVehicle: "Lokasion veikil",
      tabShop: "Komann laboutik",
      shopTitle: "Ou bann komann laboutik",
      shopBody:
        "Konekte ar email ki ou finn servi kan ou finn peye pou get tou ou bann komann, zot stati, ek detay peyman laboutik la.",
      shopCta: "Get mo bann komann",
      shopSwitchBefore: "Ou finn plito loue enn skooter ou enn loto? Al lor",
      shopSwitchAfter: "anwo — pena bizin kont pou sa.",
      refLabel: "Referans rezervasion",
      emailLabel: "Email",
      find: "Trouv mo rezervasion",
      refHint:
        "Ou referans dan ou email konfirmasion ek ou resi (li kouma RR-XXXXXX).",
      errMissing: "Met ou referans rezervasion ek ou email.",
      errNotFound: "Nou pa finn trouv sa rezervasion la.",
      statusCancelled: "Anile",
      statusCompleted: "Fini",
      statusConfirmed: "Konfirmen",
      statusAwaiting: "Pe atann depo",
      cancelledBody:
        "Sa rezervasion la finn anile — swa letan pou konfirme li finn depase, swa enn lot dimounn finn pran veikil la avan ou.",
      cancelledNoCharge: "Nanye pa finn debite.",
      bookAgain: "Rezerv ankor",
      rowVehicle: "Veikil",
      rowReservation: "Rezervasion",
      rowWhen: "Kan",
      rowTotal: "Total Estime",
      rowPaidInFull: "Finn pey tou",
      rowDepositPaid: "Depo peye",
      rowDepositToConfirm: "Depo pou konfirmen",
      rowBalanceAtPickup: "Balans kan ou pran li",
      rowBalance: "Balans",
      rowNothingToPay: "Nanye ankor pou peye",
      checkingTitle: "Nou pe verifye disponibilite",
      checkingBody:
        "Nou pe konfirm sa veikil la ar so proprieter. Kan li konfirme, nou avoy ou enn email ek ou kapav peye isi. Nanye pa debite avan sa — ek si li pa lib, nou propoz ou enn lot parey.",
      noteTitle: "Lor ou demann",
      approvedTitle: "Li disponib — ou zis bizin konfirme li",
      holdingUntil: (when: string) =>
        `Nou gard li pou ou ziska ${when}. Apre sa, li retourn pou lezot kliyan.`,
      payBelow: "Pey anba pou konfirmen li.",
      lookUpAnother: "Swiv enn lot rezervasion",
    },
    contact: {
      eyebrow: "KONTAKT NOU",
      title: "KONTAKT NOU",
      subtitle:
        "Pre pou explor Rodrig lor de rou? Kontakt nou lor WhatsApp pou repons rapid, ou ranpli formilair la.",
      nameLabel: "NON",
      emailLabel: "EMAIL",
      phoneLabel: "TELEFONN",
      scooterLabel: "SKOOTER",
      datesLabel: "DAT LOKASION",
      datesPlaceholder: "ex. 15 Zan – 22 Zan",
      messageLabel: "MESAZ",
      messagePlaceholder: "Kestion ou demann spesial?",
      submit: "Anvoy Mesaz",
      sending: "Anvoy…",
      sent: "Anvoy!",
      successTitle: "Mesaz anvoy!",
      successDesc: "Nou pou reponn ou dan kektan. Get ou WhatsApp osi!",
      errorTitle: "Enn zafer finn mal pas",
      errorDesc: "Esey ankor ou kontakt nou direkteman lor WhatsApp.",
    },
    footer: {
      navigate: "NAVIGE",
      follow: "SWIV NOU",
      tagline:
        "Explor Rodrig. Rul lib. Lokasion skooter premiem lor zil pli zoli dan Losean Indien.",
      tag: "Tagn nou dan ou lavantur Rodrig.",
      rights: (year: number) => `© ${year} Roule Rodrigues. Tou drwa rezerve.`,
      location: "Zil Rodrig, Repiblik Moris",
      legal: "LEGAL",
      terms: "Kondision",
      privacy: "Konfidansialite",
      refunds: "Ranbourseman",
      disclaimer: "Avertisman",
      notice: "Mansion legal",
      listScooter: "Met ou biznes lor sit",
    },
    planner: {
      eyebrow: "PERSONALIZE POU OU",
      title: "PLANN VWAYAZ",
      subtitle:
        "Dir nou konbien zour ou ena ek sa ki ou kontan — nou pou kree ou itinerèr parfe dan Rodrig.",
      daysLabel: "ZOUR DAN RODRIG",
      interestsLabel: "SA KI OU KONTAN",
      plan: "Plann Mo Vwayaz",
      planning: "Pe kreyé ou itinerèr…",
      emptyTitle: "Ou itinerèr pou parèt isi",
      emptyDesc: "Swazi ou zour, ou enterè, ek klik Plann Mo Vwayaz.",
      loadingDesc: (n: number) => `Pe map pli bon plas Rodrig pou ${n} zour`,
      dayOf: (d: number, t: number) => `ZOU ${d} SIR ${t}`,
      prevDay: "Zour Avan",
      nextDay: "Prosenn Zour",
      readyTitle: "Pre pou rul?",
      readyDesc: (n: number) =>
        `Rezerv ou skooter astèr ek koumans ou lavantur ${n} zour dan Rodrig.`,
      bookNow: "Rezerv Astèr",
      paceLabel: "RITM VWAYAZ",
      directions: "Direksion",
      dayRoute: "Ouver zour dan Maps",
      copyPlan: "Kopye plan",
      copied: "Kopye!",
      sharePlan: "Partaz lor WhatsApp",
      stopsCount: (n: number) => `${n} arè`,
      pace: {
        relaxed: "Trankil",
        balanced: "Balanse",
        packed: "Ranpli",
      },
      interests: {
        beach: "Plaz & Lagon",
        culture: "Kilti & Listwar",
        adventure: "Lavantur & Randonn",
        food: "Manze & Bazar",
      },
    },
    map: {
      eyebrow: "EXPLOR ZIL LA",
      title: "GID ZIL",
      subtitle:
        "Dekouvr kaset Rodrig. Tous enn foto pou agrandi li, ouswa « direksion » pou distans depi kot ou ete.",
      directions: "Direksion & distans",
      scrollMore: "Fer defile",
    },
    explore: {
      nav: "Explor",
      eyebrow: "KOUMANS ISI",
      title: "Ki ou pe rode ?",
      subtitle:
        "Bann veikil, restoran, aktivite — swazir enn kategori pou explor.",
      cta: "Explor",
      option: "opsion",
      options: "opsion",
      back: "Ki ou pe rode ?",
      popular: "Popiler",
    },
    routes: {
      eyebrow: "BANN PARKOUR",
      title: "PARKOUR SKOOTER",
      subtitle:
        "Bann parkour skooter swazi spesial pou Rodrig — ouver enn dan Google Maps ek al rul.",
      offline: "Marse oflinn — sarz enn fwa, rul partou",
      openMaps: "Ouver dan Google Maps",
      difficulty: { Easy: "Fasil", Moderate: "Mwayen", Advanced: "Difisil" },
    },
    waitlist: {
      eyebrow: "RES INFORME",
      title: "KONSEY & OFER",
      subtitle:
        "Inskrir ou pou bann ofer exklizif, nouvo parkour ek meyer Rodrig — direk dan ou email.",
      placeholder: "ou@email.com",
      button: "Inskrir",
      successTitle: "Ou finn inskrir!",
      successDesc: "Nou pou ekrir ou ar bann bon nouvel.",
      privacy: "Pena spam. Dezinskrir ninport kan.",
      invalid: "Silvouple met enn email valid.",
      error: "Enn zafer finn mal pas. Esey ankor.",
    },
    useful: {
      eyebrow: "BON POU KONE",
      title: "NIMERO ITIL",
      subtitle:
        "Anrezistre zot avan ou rul — irzans, taxi ek kontak lokal. Tous enn nimero pou apele.",
      groups: { emergency: "IRZANS", taxi: "TAXI", other: "LEZOT" },
    },
    events: {
      eyebrow: "SA KI POU ARIVE",
      title: "EVENMAN",
      subtitle: "Festival, bazar ek lanimasion dan Rodrig pandan ou sezour.",
    },
    sponsors: {
      title: "SOUTENI PAR",
      heading: "Nou Partener",
      subtitle: "Bann biznes lokal ek kamarad ki ed nou fer Rodrigues bouze.",
    },
    experience: {
      eyebrow1: "ZIL LA PE ATAN OU",
      title1: "RODRIG KOUMA OU PANKOR TROUVE",
      para1:
        "Rul lor falez kot lagon ble-ver kontinie ziska orizon. Dekouvr bann laplaz kaste ki ou kapav al zis an skooter, ek travers bann vilaz kot bann dimoun akeyir ou avek enn sourir senser.",
      para2:
        "Rodrig se enn lemond apar — natirel, trankil ek vreman extraordiner. Pli bon fason pou viv tousala? Lor de rou, ou prop ritm, avek divan kouma sel gid.",
      statLabel: "km bann zoli sime bor lamer pou dekouver ou prop ritm",
      eyebrow2: "LOKASION FASIL",
      title2: "TRWA ETAP VER LALIBERTE",
      stepLabel: "ETAP",
      steps: [
        {
          title: "Swazi ou skooter",
          description:
            "Swazi Burgman 125 ouswa Avenis 125 — toulede prop ek pare pou explor.",
        },
        {
          title: "Pey an sekirite",
          description:
            "Pri sinp ek transparan. Rezerv an lizinn ou pey kan ou arive. Pena fre kaste, pena sirpriz.",
        },
        {
          title: "Pran ek rul",
          description:
            "Vinn pran ou skooter kot nou ouswa swazi livrezon gratis lor zil pou lokasion par semenn. Sime la pou ou.",
        },
      ],
    },
    whyUs: {
      eyebrow: "KIFER SWAZI NOU",
      title: "RUL AVEK KONFIANS",
      features: [
        {
          title: "Byen Asire",
          description:
            "Rul lespri trankil. Sak lokasion inklir enn assirans responsabilite sivil konple, san fre siplemanter.",
        },
        {
          title: "Ler Flexib",
          description:
            "Pran ek retir dapre ou orer. Nou adapte ar ou program — boner gramaten ouswa tar aswar, pena problem.",
        },
        {
          title: "Livrezon lor Zil",
          description:
            "Nou livre ou skooter direk kot ou lotel, pansion ou erport. Lokasion par semenn inklir livrezon gratis partou lor zil.",
        },
        {
          title: "Sipor 24/7",
          description:
            "Enn pne plat? Bizin direksion? Nou touzour zis enn mesaz WhatsApp, lizour kouma aswar, partou lor zil.",
        },
      ],
    },
    pricing: {
      eyebrow: "PRI",
      title: "PRI TRANSPARAN",
      model: "MODEL",
      daily: "Par Zour",
      threeDays: "3 Zour",
      weekly: "Par Semenn",
      bestValue: "MEYER PRI",
      includedTitle: "TOUZOUR INKLI",
      included: [
        "Kasket",
        "Assirans responsabilite sivil",
        "Sipor WhatsApp 24/7",
        "Livrezon gratis par semenn",
      ],
      quote: "Demann enn Devi",
    },
    gallery: { eyebrow: "FOTO", title: "NOU SKOOTER" },
    testimonials: { eyebrow: "LAVI", title: "SA KI BANN KLIAN DIR" },
    marketplace: {
      eyebrow: "OFER EXKLIZIF",
      title: "BON PLAN LOKAL",
      subtitle:
        "Ofer spesial sorti kot nou partner lor zil — restoran, tour ek aktivite, exklizivman pou bann klian Roule Rodrigues.",
    },
    cta: {
      eyebrow: "KOUMANSE",
      title: "PRE POU RUL?",
      subtitle:
        "Rezerv ou skooter an lizinn dan 60 segonn. Pena depo. Anilasion gratis.",
      bookNow: "Rezerv Astèr",
    },
    reviews: {
      eyebrow: "LAVI BANN KLIAN",
      title: "PARTAZ OU LEXPERIANS",
      write: "Ekrir enn Lavi",
      beFirst: "Premie pou donn ou lavi",
      beFirstDesc:
        "Ou finn loue ar nou? Partaz ou lexperians ek ed lezot vwayazer.",
      loading: "Pe sarz bann lavi…",
      modalEyebrow: "OU LEXPERIANS",
      modalTitle: "Ekrir enn Lavi",
      ratingLabel: "OU NOT",
      nameLabel: "OU NON",
      namePh: "ex. Sophie L.",
      originLabel: "OU SORTI KOTE (opsionel)",
      originPh: "ex. Paris, Frans",
      scooterLabel: "KI SKOOTER? (opsionel)",
      selectPh: "— Swazi —",
      reviewLabel: "OU LAVI",
      reviewPh: "Koz lor ou lexperians ar lezot vwayazer…",
      submit: "Anvoy Lavi",
      submitting: "Anvoy…",
      thankTitle: "Mersi!",
      thankDesc:
        "Ou lavi finn anvoye ek pou parèt lor sit kan nou ekip finn aprouv li.",
      done: "Fini",
      note: "Bann lavi verifie avan zot parèt piblikman.",
      errRating: "Silvouple swazi enn not.",
      errName: "Silvouple met ou non.",
      errText: "Silvouple ekrir enn ti lavi.",
    },

    // Paz Taksi & Transpor
    taxi: {
      eyebrow: "ZIL RODRIG · TRANSPOR",
      title1: "Taksi &",
      title2: "Transpor",
      subtitle:
        "Bann chofer lokal fiab pou transfer erport, tour zil ek trazet dirèk. Tous WhatsApp ouswa apel direk pou met dakor lor pri — ek les enn lavi pou ed lezot vwayazer.",
      loading: "Pe sarz bann chofer…",
      empty: "Pankor ena chofer — revini biento.",
      topDriver: "TOP CHOFER",
      photosCount: (n: number) => `${n} foto`,
      bookRide: "Rezerv enn kours",
      airportTransfer: "Transfer erport",
      followRide: "Ou fin deza rezerve ? Swiv ou kours",
      from: "Apartir",
      priceNote:
        "Nou pou konfirm pri-la ar ou — nanye pa debite avan ou dakor.",
      whatsapp: "WhatsApp",
      call: "Apele",
      reviewsRate: "Lavi & note",
      rate: "Note sa chofer la",
      fareNote:
        "Nou pou konfirm pri-la ar ou — nanye pa debite avan ou dakor. Sak chofer fixe so prop pri; Roulé Rodrigues zame pran kas pou enn kours.",
      disclaimer:
        "Bann chofer taksi zot bann tiers indepandan liste pou ou konvenians — Roule Rodrigues pa enn operater transpor ek nou pa responsab pou zot servis.",
      feedback: "LAVI CHOFER",
      review: "lavi",
      reviews: "lavi",
      loadingReviews: "Pe sarz bann lavi…",
      noReviews: (name: string) =>
        `Pankor ena lavi — to premie pou note ${name}.`,
      rateThis: "NOTE SA CHOFER LA",
      yourName: "To non",
      fromPh: "Kot to sorti (opsionel)",
      reviewPh: "Kouma ti to trazet? Alèr, zanti, kondir an sekirite…",
      submit: "Anvoy lavi",
      submitting: "Pe anvoye…",
      thankTitle: "Mersi!",
      thankDesc: "To lavi pe atann aprouvasion ek pou paret biento.",
      done: "Fini",
      moderationNote: "Bann lavi verifie avan publie pou res zis.",
      errRating: "Silvouple swazi enn not.",
      errName: "Silvouple met ou non.",
      errText: "Silvouple ekrir enn ti lavi.",
      errDriver: "Silvouple swazi enn chofer.",
      errBusy: "Ou finn esey tro boukou fwa. Atann enn ti moman ek esey ankor.",
      errServer: "Enn zafer finn mal pase. Esey ankor.",
      errOffline: "Pa ena koneksion. Verifie ou koneksion ek esey ankor.",
    },

    // Reste · Manze · Fer (bann landrwa rekomande)
    stayEatDo: {
      eyebrow: "REKOMANDE",
      all: "Tou",
      stay: "Reste",
      eat: "Manze",
      do: "Fer",
      catHotel: "OTEL",
      catRestaurant: "RESTORAN",
      catActivity: "AKTIVITE",
      bookEnquire: "Rezerv / Demann",
      visit: "Vizite",
      viewMap: "Get lor kart",
      sponsored: "SPONSORIZE",
      disclaimer:
        "Sa bann biznes indepandan liste pou ou konvenians. Roule Rodrigues zis liste zot pou ou kapav trouv zot ek nou pa responsab pou zot servis ouswa rezervasion.",
    },

    // Kart Pou Deplase
    gettingAround: {
      eyebrow: "POU DEPLASE",
      bestWay: "PI BON FASON",
    },

    // Konsierz manze (/food)
    food: {
      eyebrow: "KONSIERZ MANZE",
      title: "Ou konsierz manze",
      subtitle: "Dir nou ki ou anvi manze — nou trouv ek rezerv latab pou ou.",
      free: "Gratis pou ou",
      local: "Bann lokal ki konn zot lakwizinn",
      fast: "Repons rapid",
      cravingHeading: "Ki ou anvi manze ?",
      cravingHint: "Tous tou seki ou anvi",
      budgetHeading: "Bidze",
      budgetHint: "Opsionel",
      partyHeading: "Konbien dimounn ?",
      partyHint: "Opsionel",
      cta: "Koz lor WhatsApp",
      tip: "Pa dan lalis ? Zis ekrir nou — nou pou dir ou seki pe kwi zordi.",
      previewTitle: "Ou demann",
      previewEmpty:
        "Swazir enn anvi pou koumanse — ou zis tous bouton la ek dir nou dan ou mo.",
      clear: "Efase",
      labelCraving: "Anvi",
      labelBudget: "Bidze",
      areaHeading: "Kot ou ete ?",
      whenHeading: "Kan ?",
      labelParty: "Dimounn",
      labelArea: "Zonn",
      labelWhen: "Kan",
      cravings: {
        ourite: "Ourit",
        fish: "Pwason fre di zour",
        seafood: "Plato fri de mer",
        creole: "Manze kreol lakaz",
        snacks: "Ti manze ek street food lokal",
        desserts: "Desert rodrige",
        seaview: "Latab kot lamer",
        occasion: "Loksion spesial",
      },
      budgets: { budget: "Pa tro ser", moderate: "Modere" },
      party: { two: "Pou 2", small: "3–4", group: "5+" },
      areas: {
        north: "Nor / Port Mathurin",
        east: "Lakot les",
        south: "Sid",
        west: "Lwes / La Ferme",
        anywhere: "Ninport kot",
      },
      when: {
        tonight: "Aswar",
        tomorrow: "Demen",
        thisweek: "Sa semenn la",
        lunch: "Pou midi",
        flexible: "Fleksib",
      },
      steps: {
        tell: "Dir nou ou anvi",
        match: "Nou trouv pou ou",
        book: "Nou rezerv ou latab",
      },
      prefill:
        "Bonzour Roule Rodrigues 👋 Mo bizin ou led pou trouv enn bon plas pou manze Rodrigues.",
    },
      placeBooking: {
      yourName: "Ou nom",
      validEmail: "Met enn adres e-mail korek souple.",
      notes: "Ena kiksoz nou bizin kone ? (si ou anvi)",
      arrivalTitle: "KAN OU PE ARIVE",
      arrivalHint: "Ler ou arive, vol ouswa bato — pou nou kone kan ou pe vini",
      cancelTitle: "SI OU BIZIN ANILE",
      fullPolicy: "Tou bann kondision",
      priceForBooking: "Pri pou sa rezervasion la",
      totalToPay: "Total pou peye asterla",
      paidInFull: "Peye net pou konfirme. Nanye pou regle kan ou arive.",
      requestReservation: "Demann rezervasion",
      requestSent: "Demann inn ale !",
      requestReceived: "Nou finn gagn ou demann !",
      confirmed: "Rezervasion konfirme !",
      error: "Enn problem inn arive. Reseye souple.",
      whatsappChat: "Ou prefer koze ? Ekrir nou lor WhatsApp",
      whatsappCta: "Ekrir nou lor WhatsApp",
      eitherWay: "Nou ekrir ou lor WhatsApp toulede fason — peye ouswa non.",
      eitherWayEmailPrefix: "Nou ekrir lor",
      eitherWaySuffix: "toulede fason — peye ouswa non.",
    },
    orderTrack: {
      title: "Swiv ou komand",
      noAccount: "Pa bizin kont — met ou nimero komand ek e-mail ki ou finn servi.",
      orderNumber: "Nimero komand",
      find: "Trouv mo komand",
      another: "Get enn lot komand",
      hint: "Ou nimero komand ete dan e-mail konfirmasion.",
      confirmed: "Komand konfirme",
      emailed: "Nou finn avoy ou konfirmasion lor",
      timeRemaining: "Letan ki reste :",
      attachReceipt: "Met resi la pou kontinie.",
      createAccount: "Kree enn kont ouswa konekte",
      createWithEmail: "Kree enn kont avek sa e-mail la pou swiv ou bann komand apre",
    },
    install: {
      install: "Install app",
      installNow: "Install asterla",
      installApp: "Install aplikasion",
      installTitle: "Install Roule Rodrigues",
      subtitle: "Met li lor ou lekran — li ouver kouma enn aplikasion.",
      tapThe: "Tap lor",
      clickThe: "Klik lor",
      scrollDown: "Desann anba ek tap lor",
      browserMenu: "Ouswa ouver meni navigater",
    },
    auth: {
      myAccount: "MO KONT",
      password: "Modpas",
      forgot: "Bliye modpas ?",
      resetTitle: "Chanz ou modpas",
      resetHint: "Nou pou avoy ou enn lien pou swazir enn nouvo.",
      sendReset: "Avoy lien",
      backToSignIn: "Retourn lor koneksion",
      checkInbox: "Get ou bwat mesaz",
      ifAccountExists: "Si ena enn kont pou",
      confirmEmail: "Konfirm ou e-mail",
      sentConfirmation: "Nou finn avoy enn lien konfirmasion lor",
      linkExpired: "Sa lien koneksion la finn expire ouswa finn deza servi. Konekte ankor souple.",
    },
},
} as const;

export default translations;
export { translations };
