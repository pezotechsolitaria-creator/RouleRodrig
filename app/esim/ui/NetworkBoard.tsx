import { Check, X } from "lucide-react";
import { COPY, type UiLang } from "../copy";

// ── The network, as a departures board ───────────────────────────────────────
//
// On the home shelf this is the store's reason to exist, so it gets the most
// deliberate object on the page: the three Mauritian operators on a board,
// with the one fact that matters — does it work on Rodrigues. Bebas (the
// system's own label face) carries the board; no new colour: covered is
// offwhite with a gold tick, "no signal" is muted with a cross.
//
// On another destination the board lists the operators its plans actually use
// there, straight from the shelf.

type Row = { name: string; status: string; ok: boolean | null };

export default function NetworkBoard({
  lang,
  home,
  networks,
  title,
  body,
  footnote,
}: {
  lang: UiLang;
  home: boolean;
  /** For a non-home shelf: operator labels ("Orange 5G"). */
  networks: string[];
  title: string;
  body: string;
  footnote?: string;
}) {
  const t = COPY[lang];
  const rows: Row[] = home
    ? [
        { name: "my.t", status: t.boardCovered, ok: true },
        { name: "Emtel", status: t.boardCovered, ok: true },
        { name: "Chili", status: t.boardNoSignal, ok: false },
      ]
    : networks.map((n) => {
        const [name, ...rest] = n.split(" ");
        return { name, status: rest.join(" ") || "4G", ok: null };
      });

  return (
    <div className="overflow-hidden rounded-3xl border border-white/10 bg-[#0d0d0d]">
      <div className="px-5 pb-5 pt-5">
        <h2 id="esim-net-title" className="font-syne text-xl font-bold text-offwhite">
          {title}
        </h2>
        <p className="mt-2 font-dm text-sm leading-relaxed text-offwhite/80">{body}</p>
      </div>
      <div className="border-t border-white/10 bg-black/40 px-5 py-4">
        <div className="flex justify-between font-bebas text-[11px] tracking-[0.24em] text-muted">
          <span>{t.boardOperator}</span>
          <span>{home ? t.boardRodrigues : t.boardNetwork}</span>
        </div>
        <ul className="mt-2 divide-y divide-white/[0.07]">
          {rows.map((r) => (
            <li key={r.name} className="flex items-center justify-between py-2.5">
              <span className={`font-bebas text-[1.35rem] leading-none tracking-[0.12em] ${r.ok === false ? "text-muted/70 line-through decoration-1" : "text-offwhite"}`}>
                {r.name}
              </span>
              <span className={`flex items-center gap-1.5 font-bebas text-[15px] leading-none tracking-[0.18em] ${r.ok === false ? "text-muted" : "text-offwhite"}`}>
                {r.ok === true && <Check size={15} className="text-yellow" aria-hidden />}
                {r.ok === false && <X size={15} aria-hidden />}
                {r.status}
              </span>
            </li>
          ))}
        </ul>
        {footnote && <p className="mt-3 font-dm text-xs leading-relaxed text-muted">{footnote}</p>}
      </div>
    </div>
  );
}
