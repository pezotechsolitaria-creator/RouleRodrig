import { NextResponse } from "next/server";

// Live exchange rates for Ti Roulé's currency converter. Fetched server-side
// (CSP blocks the browser from calling the provider directly) from a free,
// key-less endpoint and cached for an hour. USD-based, so the client can
// convert any pair. Never fabricates a rate — on failure it returns an error
// and Ti Roulé says so instead of inventing a number.
export const revalidate = 3600;

export async function GET() {
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD", {
      next: { revalidate: 3600 },
    });
    if (!res.ok) throw new Error(`upstream ${res.status}`);
    const data = (await res.json()) as {
      result?: string;
      rates?: Record<string, number>;
      time_last_update_utc?: string;
    };
    if (data.result !== "success" || !data.rates?.MUR) throw new Error("bad payload");
    return NextResponse.json(
      { base: "USD", rates: data.rates, updated: data.time_last_update_utc ?? null },
      { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } },
    );
  } catch {
    return NextResponse.json({ error: "rates_unavailable" }, { status: 502 });
  }
}
