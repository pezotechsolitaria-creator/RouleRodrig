import type { TransferPricing } from "@/lib/rides/transfer";

// An airport price sheet for tests (SEO audit 2026-09-29 C2, C8). Its numbers
// are deliberately NOT the live ones (Rs 1,111 / 1,444 / 1,777, zones at 6 and
// 13 km, Rs 123 per extra passenger, Rs 321 evening): a sentence that printed
// a remembered fare instead of the sheet's would print the wrong number and
// fail the test that reads it.
export const SHEET: TransferPricing = {
  id: 9,
  label: "fixture",
  zone1MaxKm: 6,
  zone2MaxKm: 13,
  oneWay: [111100, 144400, 177700],
  returnEach: [111100, 144400, 166600],
  includedPassengers: 1,
  extraPassengerFee: 12300,
  maxPricedPassengers: 6,
  nightMode: "manual",
  nightFromHour: 22,
  nightToHour: 4,
  nightSurcharge: 0,
  nightMultiplier: 1,
  eveningMode: "fixed",
  eveningFromHour: 17,
  eveningToHour: 21,
  eveningSurcharge: 32100,
  eveningMultiplier: 1,
  bookable: true,
  places: [
    { id: "port-mathurin", label: "Port Mathurin", roadKm: 18.2, zone: 3 },
    { id: "mourouk", label: "Mourouk", roadKm: 5.4, zone: 1 },
    { id: "graviers", label: "Graviers", roadKm: 20.1, zone: 3 },
  ],
};
