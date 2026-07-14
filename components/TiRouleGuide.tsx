"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Compass, UtensilsCrossed, Waves, Mountain, Bike, Footprints, Car, Languages,
} from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import type { Language } from "@/lib/i18n";
import { resolvePose } from "@/lib/mascot";
import { loc } from "@/lib/localize";

/**
 * Ti Roulé — the Roule Rodrigues mascot as an animated island-guide chat.
 * He greets visitors, "types", swaps expression pose-by-pose, answers common
 * questions from the site's own island data, teaches a Creole word, and routes
 * people into the real tools (trip planner, food concierge, map, routes, taxi).
 * Scripted + free — no LLM cost, no hallucinations. Renders nothing until at
 * least one mascot image (default or a pose) is uploaded in admin.
 */

type LocName = { name: string; nameFr?: string; nameCr?: string };
export type MascotData = { beaches: LocName[]; viewpoints: LocName[] };

type TopicKey = "plan" | "eat" | "beaches" | "viewpoints" | "rent" | "hike" | "taxi" | "creole";
type Msg =
  | { id: number; who: "bot"; text: string; pose?: string; cta?: { label: string; href: string } }
  | { id: number; who: "user"; text: string };

const TOPIC_ICON: Record<TopicKey, typeof Compass> = {
  plan: Compass, eat: UtensilsCrossed, beaches: Waves, viewpoints: Mountain,
  rent: Bike, hike: Footprints, taxi: Car, creole: Languages,
};
const TOPIC_ORDER: TopicKey[] = ["plan", "eat", "beaches", "viewpoints", "rent", "hike", "taxi", "creole"];

const CREOLE: { p: string; en: string; fr: string }[] = [
  { p: "Bonzur!", en: "Hello / good day", fr: "Bonjour" },
  { p: "Koman ou lé?", en: "How are you?", fr: "Comment ça va ?" },
  { p: "Mo byen, mersi", en: "I'm well, thank you", fr: "Je vais bien, merci" },
  { p: "Kot sa été?", en: "Where is it?", fr: "Où est-ce ?" },
  { p: "Mersi boukou", en: "Thank you very much", fr: "Merci beaucoup" },
  { p: "Zoli sa!", en: "That's beautiful!", fr: "C'est magnifique !" },
  { p: "Ale dousman", en: "Take it easy / drive safe", fr: "Vas-y doucement" },
];

type Copy = {
  role: string; online: string; bubble: string; open: string; close: string;
  greet: string; hint: string;
  topics: Record<TopicKey, string>;
  plan: string; planCta: string;
  eat: string; eatCta: string;
  beachesLead: string; viewpointsLead: string; mapCta: string; guideFallback: string;
  rent: string; rentCta: string;
  hike: string; hikeCta: string;
  taxi: string; taxiCta: string;
  creoleLead: string; means: string;
};

const COPY: Record<Language, Copy> = {
  en: {
    role: "Island guide", online: "online", bubble: "Koman ou lé?",
    open: "Chat with Ti Roulé", close: "Close chat",
    greet: "Bonzur! 👋 I'm Ti Roulé, your Rodrigues guide. What can I help you with?",
    hint: "Tap a topic 👇",
    topics: {
      plan: "Plan my trip", eat: "Where should I eat?", beaches: "Best beaches",
      viewpoints: "Best viewpoints", rent: "Rent a scooter or car", hike: "Hiking trails",
      taxi: "Find a taxi", creole: "Teach me a Creole word",
    },
    plan: "Tell me what you love and I'll build a day-by-day island route in seconds — beaches, food, viewpoints, the lot.",
    planCta: "Open the trip planner",
    eat: "Hungry? Our food concierge finds you the right table and sorts it all on WhatsApp — no endless searching.",
    eatCta: "Ask the food concierge",
    beachesLead: "Rodrigues has stunning beaches. Try these:",
    viewpointsLead: "For the best views on the island, head to:",
    mapCta: "See them on the map",
    guideFallback: "Explore every beach and viewpoint in the island guide.",
    rent: "Scooter to feel the breeze, or a car for the family — pick your dates and you're ready to roll.",
    rentCta: "Browse the vehicles",
    hike: "Lace up! Rodrigues has gorgeous trails with big ocean views.",
    hikeCta: "See the trails",
    taxi: "Need a lift? I'll connect you with trusted local drivers.",
    taxiCta: "Find a taxi",
    creoleLead: "Here's a Creole word to sound like a local:",
    means: "means",
  },
  fr: {
    role: "Guide de l'île", online: "en ligne", bubble: "Koman ou lé ?",
    open: "Discuter avec Ti Roulé", close: "Fermer le chat",
    greet: "Bonzur ! 👋 Moi c'est Ti Roulé, votre guide de Rodrigues. Comment puis-je vous aider ?",
    hint: "Choisissez un sujet 👇",
    topics: {
      plan: "Planifier mon séjour", eat: "Où manger ?", beaches: "Plus belles plages",
      viewpoints: "Plus beaux points de vue", rent: "Louer un scooter ou une voiture", hike: "Sentiers de randonnée",
      taxi: "Trouver un taxi", creole: "Apprends-moi un mot créole",
    },
    plan: "Dites-moi ce que vous aimez et je crée un itinéraire jour par jour en quelques secondes — plages, restos, points de vue, tout.",
    planCta: "Ouvrir le planificateur",
    eat: "Faim ? Notre concierge culinaire vous trouve la bonne table et gère tout sur WhatsApp — sans recherches interminables.",
    eatCta: "Demander au concierge",
    beachesLead: "Rodrigues a des plages magnifiques. Essayez :",
    viewpointsLead: "Pour les plus belles vues de l'île, rendez-vous à :",
    mapCta: "Voir sur la carte",
    guideFallback: "Découvrez toutes les plages et points de vue dans le guide de l'île.",
    rent: "Un scooter pour sentir la brise, ou une voiture pour la famille — choisissez vos dates et c'est parti.",
    rentCta: "Voir les véhicules",
    hike: "En route ! Rodrigues a de superbes sentiers avec vue sur l'océan.",
    hikeCta: "Voir les sentiers",
    taxi: "Besoin d'un transport ? Je vous mets en relation avec des chauffeurs locaux de confiance.",
    taxiCta: "Trouver un taxi",
    creoleLead: "Voici un mot créole pour parler comme un local :",
    means: "veut dire",
  },
  cr: {
    role: "Gid lil", online: "online", bubble: "Koman ou lé?",
    open: "Koz ek Ti Roulé", close: "Ferm chat la",
    greet: "Bonzur! 👋 Mo Ti Roulé, ou gid Rodrigues. Ki mo kapav fer pou ou?",
    hint: "Swazir enn size 👇",
    topics: {
      plan: "Plann mo vwayaz", eat: "Kot pou manze?", beaches: "Pli zoli laplaz",
      viewpoints: "Pli zoli pwin vi", rent: "Loue enn skooter ou loto", hike: "Santie rando",
      taxi: "Trouv enn taxi", creole: "Aprann mwa enn mo kreol",
    },
    plan: "Dir mwa ki ou kontan ek mo pou fer enn program zour par zour dan de segond — laplaz, manze, pwin vi, tou.",
    planCta: "Ouver planifikater la",
    eat: "Ou fin? Nou konsierz manze trouv ou bon plas ek aranz tou lor WhatsApp — pa bizin rode partou.",
    eatCta: "Demann konsierz la",
    beachesLead: "Rodrigues ena bann zoli laplaz. Sey sa bann la:",
    viewpointsLead: "Pou pli zoli vi lor lil, al:",
    mapCta: "Get lor lakart",
    guideFallback: "Explor tou laplaz ek pwin vi dan gid lil la.",
    rent: "Enn skooter pou santi labriz, ou enn loto pou fami — swazir ou bann dat ek ou paré.",
    rentCta: "Get bann veikil",
    hike: "Met ou soulie! Rodrigues ena bann zoli santie ek gran vi lor lamer.",
    hikeCta: "Get bann santie",
    taxi: "Bizin enn transpor? Mo konekt ou ek bann sofer lokal ou kapav fer konfians.",
    taxiCta: "Trouv enn taxi",
    creoleLead: "Ala enn mo kreol pou koz kouma enn lokal:",
    means: "vedir",
  },
};

export default function TiRouleGuide({
  image,
  poses,
  data,
}: {
  image?: string;
  poses?: Record<string, string>;
  data?: MascotData;
}) {
  const { language } = useLanguage();
  const c = COPY[language] ?? COPY.en;
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [typing, setTyping] = useState(false);
  const [pose, setPose] = useState("welcome");
  const idRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const avatar = (key?: string) => resolvePose(key, poses, image);
  const hasMascot = !!avatar("welcome");

  const nextId = () => (idRef.current += 1);

  // Seed the greeting the first time the chat opens.
  useEffect(() => {
    if (open && messages.length === 0) {
      setPose("welcome");
      setMessages([{ id: nextId(), who: "bot", text: c.greet, pose: "welcome" }]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Keep the conversation scrolled to the newest line.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, typing]);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const names = useCallback(
    (list: LocName[] | undefined) =>
      (list ?? []).map((l) => loc(language, l.name, l.nameFr, l.nameCr)).filter(Boolean),
    [language],
  );

  const buildAnswer = useCallback(
    (topic: TopicKey): { text: string; pose: string; cta?: { label: string; href: string } } => {
      switch (topic) {
        case "plan":
          return { text: c.plan, pose: "holdingMap", cta: { label: c.planCta, href: "/#trip-planner" } };
        case "eat":
          return { text: c.eat, pose: "happy", cta: { label: c.eatCta, href: "/food" } };
        case "beaches": {
          const b = names(data?.beaches);
          return {
            text: b.length ? `${c.beachesLead} ${b.join(", ")}.` : c.guideFallback,
            pose: "atBeach",
            cta: { label: c.mapCta, href: "/#map" },
          };
        }
        case "viewpoints": {
          const v = names(data?.viewpoints);
          return {
            text: v.length ? `${c.viewpointsLead} ${v.join(", ")}.` : c.guideFallback,
            pose: "atViewpoint",
            cta: { label: c.mapCta, href: "/#map" },
          };
        }
        case "rent":
          return { text: c.rent, pose: "onScooter", cta: { label: c.rentCta, href: "/#explore" } };
        case "hike":
          return { text: c.hike, pose: "hiking", cta: { label: c.hikeCta, href: "/#routes" } };
        case "taxi":
          return { text: c.taxi, pose: "pointing", cta: { label: c.taxiCta, href: "/taxi" } };
        case "creole": {
          const w = CREOLE[Math.floor(Math.random() * CREOLE.length)];
          const meaning = language === "fr" ? w.fr : w.en;
          return { text: `${c.creoleLead}\n“${w.p}” — ${c.means} “${meaning}”.`, pose: "excited" };
        }
      }
    },
    [c, data, language, names],
  );

  const ask = (topic: TopicKey) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setMessages((m) => [...m, { id: nextId(), who: "user", text: c.topics[topic] }]);
    setTyping(true);
    setPose("thinking");
    timerRef.current = setTimeout(() => {
      const a = buildAnswer(topic);
      setTyping(false);
      setPose(a.pose);
      setMessages((m) => [...m, { id: nextId(), who: "bot", text: a.text, pose: a.pose, cta: a.cta }]);
    }, 850);
  };

  if (!hasMascot) return null;

  return (
    <>
      {/* Floating mascot button — bottom-left (WhatsApp FAB owns bottom-right) */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={c.open}
        className={`fixed bottom-4 left-4 z-[85] transition-opacity duration-300 ${open ? "opacity-0 pointer-events-none" : "opacity-100"}`}
      >
        <span className="relative block rr-mascot-bob">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={avatar("welcome")}
            alt=""
            className="h-20 w-20 object-contain drop-shadow-[0_10px_18px_rgba(0,0,0,0.45)]"
            loading="lazy"
          />
          <span className="absolute -top-1 left-14 whitespace-nowrap rounded-full rounded-bl-sm bg-white px-2.5 py-1 font-dm text-[11px] font-medium text-dark shadow-lg">
            {c.bubble}
          </span>
          <span className="absolute top-1 right-2 flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-green-500 border-2 border-dark" />
          </span>
        </span>
      </button>

      {/* Chat panel */}
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-[86] bg-black/50 backdrop-blur-[2px]"
              onClick={() => setOpen(false)}
              aria-hidden="true"
            />
            <motion.div
              initial={{ opacity: 0, y: 24, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 24, scale: 0.97 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              role="dialog"
              aria-label={`Ti Roulé — ${c.role}`}
              className="fixed bottom-4 left-4 right-4 sm:right-auto sm:w-[380px] z-[87] flex max-h-[78vh] flex-col overflow-hidden rounded-3xl border border-white/10 bg-dark-card shadow-[0_24px_80px_-20px_rgba(0,0,0,0.9)]"
            >
              {/* Header */}
              <div className="flex items-center gap-3 border-b border-white/10 bg-gradient-to-b from-yellow/[0.08] to-transparent p-4">
                <span className="relative shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={avatar(typing ? "thinking" : pose)} alt="" className="h-12 w-12 object-contain" />
                  <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-green-500 border-2 border-dark-card" />
                </span>
                <div className="min-w-0">
                  <p className="font-syne font-extrabold text-offwhite leading-tight">Ti Roulé</p>
                  <p className="font-dm text-[11px] text-green-400 leading-tight">● {c.online} · {c.role}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label={c.close}
                  className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/5 text-muted transition-colors hover:bg-white/10 hover:text-offwhite"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Messages */}
              <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
                {messages.map((m) =>
                  m.who === "bot" ? (
                    <motion.div
                      key={m.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex items-end gap-2"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={avatar(m.pose)} alt="" className="h-7 w-7 shrink-0 object-contain" />
                      <div className="max-w-[80%]">
                        <div className="whitespace-pre-line rounded-2xl rounded-bl-md bg-white/[0.06] px-3.5 py-2.5 font-dm text-sm leading-relaxed text-offwhite/90">
                          {m.text}
                        </div>
                        {m.cta && (
                          <a
                            href={m.cta.href}
                            onClick={() => setOpen(false)}
                            className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-yellow px-3.5 py-2 font-dm text-xs font-semibold text-dark transition-transform hover:scale-[1.03]"
                          >
                            {m.cta.label}
                          </a>
                        )}
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div
                      key={m.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex justify-end"
                    >
                      <div className="max-w-[80%] rounded-2xl rounded-br-md bg-yellow px-3.5 py-2.5 font-dm text-sm font-medium leading-relaxed text-dark">
                        {m.text}
                      </div>
                    </motion.div>
                  ),
                )}
                {typing && (
                  <div className="flex items-end gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={avatar("thinking")} alt="" className="h-7 w-7 shrink-0 object-contain" />
                    <div className="flex items-center gap-1 rounded-2xl rounded-bl-md bg-white/[0.06] px-4 py-3.5">
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted [animation-delay:-0.3s]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted [animation-delay:-0.15s]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted" />
                    </div>
                  </div>
                )}
              </div>

              {/* Quick-reply chips */}
              <div className="border-t border-white/10 p-3">
                <p className="mb-2 px-1 font-dm text-[11px] text-muted">{c.hint}</p>
                <div className="flex flex-wrap gap-2">
                  {TOPIC_ORDER.map((topic) => {
                    const Icon = TOPIC_ICON[topic];
                    return (
                      <button
                        key={topic}
                        type="button"
                        onClick={() => ask(topic)}
                        disabled={typing}
                        className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 font-dm text-xs text-offwhite/85 transition-colors hover:border-yellow/40 hover:bg-yellow/10 hover:text-offwhite disabled:opacity-40"
                      >
                        <Icon size={13} className="text-yellow" strokeWidth={2} />
                        {c.topics[topic]}
                      </button>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
