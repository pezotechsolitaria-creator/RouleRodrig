import { vehicleName } from "@/lib/vehicle-slug";

// ── One card per physical scooter ───────────────────────────────────────────
//
// The fleet is stored as the owner types it: "BURGMAN 125cc" (1 unit),
// "AVENIS 125cc" twice, "Suzuki Burgman 125cc" holding 2 units. As cards that
// read as the same two scooters repeated with different essays and badges.
// For scooters the listing now shows ONE card per bike, numbered within its
// model — "Burgman 125 · 01/02/03", "Avenis 125 · 01/02" — recognised across
// the two spellings of one model. Cars stay one card per model.
//
// Display only. Every unit still books its own fleet ROW (the id the booking
// API and the availability count know); a row holding two bikes is pooled, so
// either of its cards books whichever is free.

export type DisplayUnit<T> = {
  /** Unique per card: row id, plus the unit number within a pooled row. */
  key: string;
  item: T;
  /** "Avenis 125 · 02", or the vehicle's own name for a car. */
  label: string;
};

type UnitSource = {
  id: string;
  name: string;
  category?: string;
  units?: number;
  assets?: { active?: boolean }[];
};

const BRANDS = /^(suzuki|toyota|hyundai|honda|yamaha|kia|nissan|mitsubishi|ford|renault|peugeot|tvs|piaggio|vespa)\s+/i;

/** "BURGMAN 125cc" / "Suzuki Burgman 125cc" -> "Burgman 125". */
export function scooterModelLabel(name: string): string {
  const clean = vehicleName({ name })
    .replace(BRANDS, "")
    .replace(/(\d+)\s*cc\b/i, "$1")
    .trim();
  // Owner names are often all caps; a model name reads in title case.
  return clean
    .split(" ")
    .map((w) => (/^[A-Z]{2,}$/.test(w) ? w[0] + w.slice(1).toLowerCase() : w))
    .join(" ");
}

/** Physical bikes behind one row: active assets when listed, else `units`. */
export function unitCount(item: UnitSource): number {
  const active = (item.assets ?? []).filter((a) => a.active !== false).length;
  return active > 0 ? active : Math.max(1, Math.round(item.units ?? 1));
}

export function displayUnits<T extends UnitSource>(items: T[]): DisplayUnit<T>[] {
  const out: DisplayUnit<T>[] = [];
  const isScooter = (it: T) => (it.category ?? "scooter") === "scooter";
  // Count bikes per model first, so a model of one keeps its plain name.
  const perModel = new Map<string, number>();
  for (const it of items) {
    if (!isScooter(it)) continue;
    const m = scooterModelLabel(it.name).toLowerCase();
    perModel.set(m, (perModel.get(m) ?? 0) + unitCount(it));
  }
  const seen = new Map<string, number>();
  for (const it of items) {
    if (!isScooter(it)) {
      out.push({ key: it.id, item: it, label: vehicleName(it) });
      continue;
    }
    const model = scooterModelLabel(it.name);
    const m = model.toLowerCase();
    const n = unitCount(it);
    for (let k = 1; k <= n; k++) {
      const idx = (seen.get(m) ?? 0) + 1;
      seen.set(m, idx);
      const label = (perModel.get(m) ?? 1) > 1 ? `${model} · ${String(idx).padStart(2, "0")}` : model;
      out.push({ key: n > 1 ? `${it.id}#${k}` : it.id, item: it, label });
    }
  }
  return out;
}
