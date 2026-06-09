"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { type Currency, convertPrice } from "@/lib/currency";

const LS_KEY = "rr_currency";

interface CurrencyContextValue {
  currency: Currency;
  setCurrency: (c: Currency) => void;
  convert: (priceText: string) => string;
}

const CurrencyContext = createContext<CurrencyContextValue>({
  currency: "MUR",
  setCurrency: () => {},
  convert: (p) => p,
});

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currency, setCur] = useState<Currency>("MUR");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(LS_KEY) as Currency | null;
      if (saved && ["MUR", "EUR", "GBP", "USD"].includes(saved)) setCur(saved);
    } catch {
      /* ignore */
    }
  }, []);

  function setCurrency(c: Currency) {
    setCur(c);
    try {
      localStorage.setItem(LS_KEY, c);
    } catch {
      /* ignore */
    }
  }

  return (
    <CurrencyContext.Provider
      value={{ currency, setCurrency, convert: (p) => convertPrice(p, currency) }}
    >
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  return useContext(CurrencyContext);
}
