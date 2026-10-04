// ── The travel vocabulary the search understands ─────────────────────────────
//
// search_synonyms (92 rows, bidirectional, M96) is the MARKETPLACE's
// vocabulary — honey ↔ dimiel, craft ↔ artisanat. A visitor searching the
// whole site types different words: "plage", "rando", "moto", "ourite",
// "aéroport". Each group below is one idea in English, French and Kreol; every
// word in a group finds every other. Merged with the live table when the index
// is built (lib/search/build.ts), and normalised there, so accents and case
// here do not matter.
//
// Add a group when the search console shows a query that found nothing but
// meant something the site has (the `search_no_results` event in PostHog).

export const TRAVEL_SYNONYMS: string[][] = [
  ["beach", "beaches", "plage", "plages", "laplaz", "plaj", "swim", "baignade"],
  ["viewpoint", "view", "point de vue", "belvedere", "panorama", "lookout", "vi"],
  ["hike", "hiking", "trail", "walk", "randonnee", "rando", "sentier", "marse", "promenade"],
  ["ride", "road trip", "balade", "itineraire", "drive"],
  ["scooter", "scooters", "moto", "motorbike", "motorcycle", "moped", "scoot", "deux roues"],
  ["car", "cars", "voiture", "loto", "auto", "vehicule", "4x4", "rental car"],
  ["rent", "rental", "hire", "location", "louer", "lwe"],
  ["taxi", "cab", "chauffeur", "driver", "transfer", "transfert", "navette", "shuttle"],
  ["airport", "aeroport", "plaine corail", "ayropor", "flight", "vol"],
  ["stay", "stays", "hotel", "hebergement", "accommodation", "guest house", "guesthouse", "chambre", "room", "lodge", "gite", "lakaz", "sleep", "dormir"],
  ["food", "eat", "manger", "manze", "restaurant", "resto", "cuisine", "meal", "repas", "dish", "plat", "takeaway", "lunch", "dinner", "dejeuner", "diner"],
  ["octopus", "ourite", "zourit", "poulpe"],
  ["fish", "poisson", "pwason", "seafood", "fruits de mer"],
  ["snorkelling", "snorkeling", "snorkel", "masque tuba", "palmes", "apnee", "plongee en apnee", "aquarium"],
  ["diving", "dive", "scuba", "plongee"],
  ["fishing", "peche", "lapes", "fisherman", "pecheur"],
  ["boat", "bateau", "pirogue", "lagoon trip", "sortie en mer", "catamaran", "kanot"],
  ["massage", "spa", "wellness", "bien etre", "relax"],
  ["tour", "tours", "excursion", "guided", "visite", "guide"],
  ["island", "islet", "ile", "ilot", "lil"],
  ["cave", "caves", "grotte", "caverne", "lakav"],
  ["tortoise", "tortoises", "tortue", "tortues", "torti"],
  ["market", "marche", "bazar", "bazaar"],
  ["delivery", "deliver", "livraison", "livrezon", "courier", "coursier", "parcel", "colis", "move", "moving"],
  ["errand", "errands", "commission", "komisyon", "do it for me"],
  ["emergency", "urgence", "ijans", "hospital", "hopital", "lopital", "police", "doctor", "medecin", "dokter", "ambulance"],
  ["pharmacy", "pharmacie", "farmasi", "chemist"],
  ["fuel", "petrol", "gas", "essence", "carburant", "delwil", "petrol station", "gas station"],
  ["money", "atm", "cash", "bank", "banque", "distributeur", "larzan"],
  ["kitesurf", "kitesurfing", "kite", "kite surf"],
  ["sunset", "coucher de soleil", "sunrise", "lever de soleil"],
  ["event", "events", "evenement", "festival", "concert", "fete", "lafet", "party", "soiree"],
  ["shop", "shops", "boutique", "magasin", "store", "souvenir", "souvenirs", "shopping"],
  ["map", "carte", "plan", "kart"],
  ["booking", "reservation", "reserver", "book", "manage booking", "my booking"],
  ["price", "prices", "prix", "tarif", "tarifs", "pri", "cost", "how much"],
  ["faq", "question", "questions", "help", "aide", "ed"],
];
