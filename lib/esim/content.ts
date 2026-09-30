// ── The words of the eSIM store, in English and French ───────────────────────
//
// One file so the store page, the French page, the install page and the
// FAQPage markup can never disagree. Every FAQ answer restates its subject and
// ends on a concrete fact: an AI assistant quoting one answer out of context
// (which is how most of this page will be read) still gets a complete,
// correct statement.
//
// FACTS THIS COPY RELIES ON, and where each one comes from:
//   · my.t 4G in Mauritius — eSIM Access package data, operatorList "my.t"
//     (docs.esimaccess.com, checked 2026-09-30). Recomputed on every sync.
//   · Chili has no network on Rodrigues — the owner, and the reason the
//     store exists in this form (lib/esim/networks.ts).
//   · Days start at first connection; 180 days to install — activeType 2,
//     unusedValidTime 180 on every launch package.
//   · Traffic exits in the UK/Norway — ipExport "UK/NO".
//   · Data only, no phone number — smsStatus/voice not included.

export type Lang = "en" | "fr";
export type Step = { title: string; body: string };
/** `id` marks an answer the page decorates (the phone checker sits under
 *  "compat"); JSON-LD reads only q and a. */
export type Faq = { q: string; a: string; id?: "compat" };

export const IOS_STEPS: Record<Lang, Step[]> = {
  en: [
    { title: "Connect to Wi-Fi", body: "Do this at home or at the airport before you fly. The eSIM downloads over the internet, so it needs a connection that isn't itself." },
    { title: "Add the eSIM", body: "On iOS 17.4 or later, tap “Install on this iPhone” on your order page and follow the prompt. Otherwise open Settings → Mobile Service (or Cellular) → Add eSIM → Use QR Code, and scan the code from another screen." },
    { title: "No second screen? Enter it by hand", body: "In the same Add eSIM screen choose “Enter Details Manually” and paste the SM-DP+ address and activation code shown on your order page." },
    { title: "Label it and choose its jobs", body: "Name it “Rodrigues”. Keep your usual line for calls, texts and iMessage; choose the Rodrigues eSIM for Mobile Data. Turn off “Allow Mobile Data Switching” so your home plan is never used." },
    { title: "When you land", body: "Settings → Mobile Service → Rodrigues: make sure the line is on and turn on Data Roaming. Roaming is how this eSIM works and costs nothing extra. It connects to the local network (my.t in Mauritius and Rodrigues) within a minute or two." },
  ],
  fr: [
    { title: "Connectez-vous au Wi-Fi", body: "À la maison ou à l'aéroport, avant le départ. L'eSIM se télécharge par internet : il lui faut une connexion qui n'est pas elle-même." },
    { title: "Ajoutez l'eSIM", body: "Sous iOS 17.4 ou plus récent, touchez « Installer sur cet iPhone » sur votre page de commande et suivez les instructions. Sinon : Réglages → Données cellulaires → Ajouter une eSIM → Utiliser un code QR, et scannez le code affiché sur un autre écran." },
    { title: "Pas de second écran ? Saisie manuelle", body: "Dans le même écran, choisissez « Saisir les informations manuellement » et collez l'adresse SM-DP+ et le code d'activation affichés sur votre page de commande." },
    { title: "Nommez-la et choisissez son rôle", body: "Appelez-la « Rodrigues ». Gardez votre ligne habituelle pour les appels, SMS et iMessage ; choisissez l'eSIM Rodrigues pour les données cellulaires. Désactivez « Autoriser le changement de données cellulaires » pour ne jamais consommer votre forfait habituel." },
    { title: "À l'arrivée", body: "Réglages → Données cellulaires → Rodrigues : vérifiez que la ligne est activée et activez l'itinérance des données. C'est ainsi que fonctionne l'eSIM, sans frais supplémentaires. Elle se connecte au réseau local (my.t à Maurice et Rodrigues) en une minute ou deux." },
  ],
};

export const ANDROID_STEPS: Record<Lang, Step[]> = {
  en: [
    { title: "Connect to Wi-Fi", body: "Before you fly. The eSIM downloads over the internet." },
    { title: "Samsung Galaxy", body: "Settings → Connections → SIM manager → Add eSIM → Scan QR code from service provider. Or choose “Enter activation code” and paste the full code starting with LPA:1$ from your order page." },
    { title: "Google Pixel and most others", body: "Settings → Network & internet → SIMs → Add SIM (or “Download a SIM instead?”) → scan the QR code. On a Pixel you can also tap “Install on this phone” on your order page." },
    { title: "Set it for data", body: "In the SIM settings, choose the new eSIM for Mobile data and keep your usual SIM for calls and texts." },
    { title: "When you land", body: "Turn the eSIM on and enable Roaming for it (Settings → Connections → Mobile networks → Data roaming on Samsung). It connects to the local network (my.t in Mauritius and Rodrigues) within a minute or two." },
  ],
  fr: [
    { title: "Connectez-vous au Wi-Fi", body: "Avant le départ. L'eSIM se télécharge par internet." },
    { title: "Samsung Galaxy", body: "Paramètres → Connexions → Gestionnaire de carte SIM → Ajouter une eSIM → Scanner le code QR de l'opérateur. Ou choisissez « Saisir le code d'activation » et collez le code complet commençant par LPA:1$ depuis votre page de commande." },
    { title: "Google Pixel et la plupart des autres", body: "Paramètres → Réseau et Internet → SIM → Ajouter une SIM (ou « Télécharger une SIM à la place ? ») → scannez le code QR. Sur Pixel, vous pouvez aussi toucher « Installer sur ce téléphone » sur votre page de commande." },
    { title: "Choisissez-la pour les données", body: "Dans les réglages SIM, choisissez la nouvelle eSIM pour les données mobiles et gardez votre SIM habituelle pour les appels et SMS." },
    { title: "À l'arrivée", body: "Activez l'eSIM et l'itinérance pour elle (Paramètres → Connexions → Réseaux mobiles → Itinérance des données sur Samsung). Elle se connecte au réseau local (my.t à Maurice et Rodrigues) en une minute ou deux." },
  ],
};

// Places a Rodrigues visitor passes through or comes from, named in the order
// they matter. Only the ones the widest live plan ACTUALLY covers are named.
const NAMED: { code: string; en: string; fr: string }[] = [
  { code: "FR", en: "France", fr: "la France" },
  { code: "RE", en: "Réunion", fr: "La Réunion" },
  { code: "GB", en: "the UK", fr: "le Royaume-Uni" },
  { code: "ZA", en: "South Africa", fr: "l'Afrique du Sud" },
  { code: "MG", en: "Madagascar", fr: "Madagascar" },
  { code: "SC", en: "the Seychelles", fr: "les Seychelles" },
  { code: "AE", en: "the UAE (a Dubai layover)", fr: "les Émirats (escale à Dubaï)" },
];

function listJoin(items: string[], lang: Lang): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} ${lang === "en" ? "and" : "et"} ${items[items.length - 1]}`;
}

/**
 * The FAQ, computed from the live catalogue — never typed:
 *   fromPrice   the cheapest active plan, formatted;
 *   countries   the country list of the widest active plan (null/1 → the
 *               "where else" answer is omitted rather than invented).
 */
export function esimFaq(lang: Lang, fromPrice: string | null, countries: string[] | null = null): Faq[] {
  const from = fromPrice ?? (lang === "en" ? "a few euros" : "quelques euros");
  const abroad = abroadAnswer(lang, countries);
  return [...baseFaq(lang, from), ...(abroad ? [abroad] : [])];
}

function abroadAnswer(lang: Lang, countries: string[] | null): Faq | null {
  if (!countries || countries.length < 2) return null;
  const set = new Set(countries.map((c) => c.toUpperCase()));
  const named = NAMED.filter((n) => set.has(n.code)).map((n) => (lang === "en" ? n.en : n.fr));
  const noReunion = !set.has("RE");
  if (lang === "fr") {
    return {
      q: "Où puis-je utiliser cette eSIM en dehors de Maurice ?",
      a: `Nos forfaits multi-pays fonctionnent dans ${countries.length} pays${named.length ? `, dont ${listJoin(named, lang)}` : ""}.${noReunion ? " La Réunion n'en fait pas partie." : ""}`,
    };
  }
  return {
    q: "Where else does this eSIM work?",
    a: `Our multi-country plans work in ${countries.length} countries${named.length ? `, including ${listJoin(named, lang)}` : ""}.${noReunion ? " Réunion is not one of them." : ""}`,
  };
}

function baseFaq(lang: Lang, from: string): Faq[] {
  if (lang === "fr") {
    return [
      {
        q: "Une eSIM fonctionne-t-elle à Rodrigues ?",
        a: "Oui, à condition qu'elle utilise le bon réseau. À Rodrigues, seuls my.t (Mauritius Telecom) et Emtel ont un réseau mobile ; Chili (MTML) n'en a pas. Les eSIM vendues par Roulé Rodrigues se connectent à my.t en 4G, qui couvre Port-Mathurin, les villages et les routes principales de l'île. Le signal peut faiblir au fond de certaines vallées et sur les îlots du lagon comme l'Île aux Cocos.",
      },
      {
        q: "Combien coûte une eSIM pour Maurice et Rodrigues ?",
        a: `Les forfaits eSIM de Roulé Rodrigues commencent à ${from}, prix final payé par carte ou PayPal, sans frais ajoutés au paiement. Chaque forfait indique ses données et sa durée ; le partage de connexion est inclus.`,
      },
      {
        q: "Quand faut-il installer l'eSIM ?",
        a: "Avant le départ, en Wi-Fi. Les jours du forfait ne commencent qu'à la première connexion à un réseau compatible, donc installer tôt ne coûte rien — vous avez 180 jours pour l'installer. Attention : si vous l'activez pendant une escale (Dubaï, Paris…), le décompte commence à ce moment-là.",
      },
      {
        id: "compat",
        q: "Mon téléphone est-il compatible eSIM ?",
        a: "La plupart des iPhone depuis le XR/XS, des Samsung Galaxy depuis le S20 et des Google Pixel depuis le 3 le sont. Le test fiable : composez *#06# — si un numéro « EID » s'affiche, votre téléphone accepte les eSIM. Il doit aussi être désimlocké.",
      },
      {
        q: "Vais-je garder mon numéro de téléphone ?",
        a: "Oui. L'eSIM Roulé Rodrigues fournit uniquement des données : vous gardez votre SIM habituelle active pour les appels et SMS, et WhatsApp continue de fonctionner avec votre numéro via les données de l'eSIM.",
      },
      {
        q: "Combien de temps pour recevoir l'eSIM ?",
        a: "En général moins d'une minute après le paiement : le QR code s'affiche à l'écran et arrive par email. Si notre fournisseur tarde, vous recevez l'eSIM ou un remboursement intégral dans les 24 heures.",
      },
    ];
  }
  return [
    {
      q: "Does an eSIM work on Rodrigues Island?",
      a: "Yes, if it uses the right network. On Rodrigues only my.t (Mauritius Telecom) and Emtel have mobile coverage; Chili (MTML) has none. The eSIMs sold by Roulé Rodrigues connect to my.t 4G, which covers Port Mathurin, the villages and the main roads of the island. Expect weaker signal in some deep valleys and on lagoon islets such as Île aux Cocos.",
    },
    {
      q: "How much is an eSIM for Mauritius and Rodrigues?",
      a: `Roulé Rodrigues eSIM plans start at ${from}, the final price paid by card or PayPal with nothing added at checkout. Every plan states its data and days, and hotspot sharing is included.`,
    },
    {
      q: "When should I install my eSIM?",
      a: "Before you travel, on Wi-Fi. The plan's days only start when it first connects to a supported network, so installing early costs nothing — you have 180 days to install it. One caveat: if you switch it on during a layover (Dubai, Paris…), the days start there.",
    },
    {
      id: "compat",
      q: "Is my phone compatible with eSIM?",
      a: "Most iPhones from the XR/XS on, Samsung Galaxy phones from the S20 on and Google Pixels from the 3 on are. The test that is never wrong: dial *#06# — if an “EID” number appears, your phone takes eSIMs. It must also be carrier-unlocked.",
    },
    {
      q: "Will I keep my phone number?",
      a: "Yes. The Roulé Rodrigues eSIM is data only: keep your usual SIM on for calls and texts, and WhatsApp keeps working on your own number over the eSIM's data.",
    },
    {
      q: "How fast is the eSIM delivered?",
      a: "Usually in under a minute after payment: the QR code appears on screen and arrives by email. If our supplier is slow, you receive the eSIM or a full refund within 24 hours.",
    },
  ];
}

// ── Other destinations (M224) ────────────────────────────────────────────────
// Two answers are specific to the country and computed from its shelf — the
// networks the plans actually use there, and the real "from" price — and the
// rest are the store's general answers, which are true everywhere. A page of
// country-name templating with no facts in it is exactly the thin content
// Google discards; these are facts, drawn from the same rows the page sells.

export type WorldPlace = { name: string; inPlace: string };

function joinList(items: string[], lang: Lang): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} ${lang === "en" ? "and" : "et"} ${items[items.length - 1]}`;
}

export function worldFaq(lang: Lang, place: WorldPlace, fromPrice: string | null, networks: string[]): Faq[] {
  const from = fromPrice ?? (lang === "en" ? "a few euros" : "quelques euros");
  const nets = networks.length ? joinList(networks.slice(0, 4), lang) : null;
  const specific: Faq[] =
    lang === "fr"
      ? [
          {
            q: `Quelle eSIM choisir ${place.inPlace} ?`,
            a: nets
              ? `${place.inPlace.charAt(0).toUpperCase()}${place.inPlace.slice(1)}, les eSIM Roulé Rodrigues se connectent à ${nets}. Elles fournissent des données mobiles avec partage de connexion, livrées en quelques secondes par QR code.`
              : `${place.inPlace.charAt(0).toUpperCase()}${place.inPlace.slice(1)}, les eSIM Roulé Rodrigues se connectent aux réseaux locaux 4G/5G. Elles fournissent des données mobiles avec partage de connexion, livrées en quelques secondes par QR code.`,
          },
          {
            q: `Combien coûte une eSIM ${place.inPlace} ?`,
            a: `Les forfaits eSIM de Roulé Rodrigues ${place.inPlace} commencent à ${from}, prix final payé par carte ou PayPal, sans frais ajoutés au paiement. Chaque forfait indique ses données et sa durée.`,
          },
        ]
      : [
          {
            q: `Which eSIM works ${place.inPlace}?`,
            a: nets
              ? `Roulé Rodrigues eSIMs for ${place.name} connect to ${nets} ${place.inPlace}. They are data eSIMs with hotspot sharing, delivered by QR code in seconds.`
              : `Roulé Rodrigues eSIMs for ${place.name} connect to local 4G/5G networks ${place.inPlace}. They are data eSIMs with hotspot sharing, delivered by QR code in seconds.`,
          },
          {
            q: `How much is an eSIM ${place.inPlace}?`,
            a: `Roulé Rodrigues eSIM plans ${place.inPlace} start at ${from}, the final price paid by card or PayPal with nothing added at checkout. Every plan states its data and days.`,
          },
        ];
  // install · compatibility · number · delivery — true for every destination.
  return [...specific, ...baseFaq(lang, from).slice(2)];
}
