"use client";

import { createContext, useContext, type ReactNode } from "react";

// ── ONE BUSINESS WHATSAPP, READ ONCE ────────────────────────────────────────
//
// The number lives in site content, loaded by the root layout on the server:
//
//   contact.whatsappNumbers[0].number || social.whatsapp || contact.phone
//
// That expression already fed Ti Roulé. Payment help appears on a dozen client
// screens that have no access to server content, and each one guessing its own
// copy of that fallback chain is how two screens end up linking two numbers.
// So the layout resolves it once and provides it here.

type SupportContact = {
  /** Digits or a wa.me URL. Empty when the owner has not configured one. */
  whatsapp: string;
  /** Always present — the fallback when there is no WhatsApp. */
  email: string;
};

const Ctx = createContext<SupportContact>({ whatsapp: "", email: "" });

export function SupportContactProvider({
  whatsapp,
  email,
  children,
}: SupportContact & { children: ReactNode }) {
  return <Ctx.Provider value={{ whatsapp, email }}>{children}</Ctx.Provider>;
}

export function useSupportContact(): SupportContact {
  return useContext(Ctx);
}
