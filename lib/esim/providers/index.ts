import { esimAccess } from "./esimaccess";
import { mockProvider } from "./mock";
import type { EsimProvider } from "./types";

// One switch: ESIM_PROVIDER (default "esimaccess"). Adding a wholesaler is a
// new file implementing EsimProvider and one line here.
const PROVIDERS: Record<string, EsimProvider> = {
  esimaccess: esimAccess,
  mock: mockProvider,
};

export function activeProvider(): EsimProvider {
  const id = (process.env.ESIM_PROVIDER || "esimaccess").toLowerCase();
  return PROVIDERS[id] ?? esimAccess;
}

/** The provider that sold a given order — an order is always finished by the
 *  wholesaler it was placed with, even after the switch changes. */
export function providerById(id: string): EsimProvider | null {
  return PROVIDERS[id] ?? null;
}

export { ProviderError } from "./types";
export type { EsimProvider, ProviderPackage, Profile, WebhookEvent } from "./types";
