import {
  BedDouble,
  Compass,
  Sparkles,
  UtensilsCrossed,
  ShoppingBag,
  PlaneLanding,
  TreePalm,
  Waves,
  Mountain,
  Camera,
  Coffee,
  Heart,
} from "lucide-react";

// Quick-action icon keys, chosen from the same lucide set the rest of the app
// uses so nothing looks imported from a different design language. The keys are
// what the admin stores, so renaming one here would orphan saved content —
// add, don't rename.
export const CURATED_ICONS: Record<string, React.ElementType> = {
  stay: BedDouble,
  experience: TreePalm,
  eat: UtensilsCrossed,
  shop: ShoppingBag,
  transfer: PlaneLanding,
  curated: Sparkles,
  lagoon: Waves,
  hike: Mountain,
  view: Camera,
  cafe: Coffee,
  loved: Heart,
  compass: Compass,
};

export const CURATED_ICON_KEYS = Object.keys(CURATED_ICONS);

export function curatedIcon(key: string): React.ElementType {
  return CURATED_ICONS[key] ?? Compass;
}
