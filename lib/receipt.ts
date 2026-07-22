// Client-side branded booking receipt. Renders a clean, print-ready document
// into a hidden iframe and opens the print dialog — where every browser (desktop
// and mobile) offers "Save as PDF". No dependency, no server round-trip, and it
// can't be popup-blocked (iframe, not window.open).

export type ReceiptRow = { label: string; value: string; strong?: boolean };

export type ReceiptData = {
  ref: string;
  heading: string; // e.g. "Booking receipt" / "Deposit receipt"
  customer: string;
  itemLabel: string; // "Vehicle" / "Stay" / "Table"
  item: string;
  rows: ReceiptRow[];
  note?: string;
};

const esc = (s: string) =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

export function printReceipt(d: ReceiptData) {
  if (typeof window === "undefined") return;
  const date = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const rowsHtml = d.rows
    .map(
      (r) =>
        `<tr class="${r.strong ? "total" : ""}"><td>${esc(r.label)}</td><td class="v">${esc(r.value)}</td></tr>`,
    )
    .join("");

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(d.ref)}</title>
  <style>
    *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    body{font-family:-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#111;margin:0;padding:32px}
    .wrap{max-width:520px;margin:0 auto}
    .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #F5C842;padding-bottom:16px}
    .brand{font-weight:800;font-size:20px;letter-spacing:-.02em}
    .brand span{color:#0a7d3b}
    .muted{color:#666;font-size:12px;line-height:1.5}
    h1{font-size:14px;text-transform:uppercase;letter-spacing:.14em;margin:26px 0 2px;color:#111}
    table{width:100%;border-collapse:collapse;margin-top:8px;font-size:14px}
    td{padding:9px 0;border-bottom:1px solid #eee}
    td.v{text-align:right;font-weight:600}
    tr.total td{border-top:2px solid #111;border-bottom:none;font-size:16px;font-weight:800;padding-top:13px;color:#0a7d3b}
    .note{margin-top:20px;font-size:12px;color:#666;line-height:1.55}
    .foot{margin-top:30px;border-top:1px solid #eee;padding-top:12px;font-size:11px;color:#999;text-align:center}
    @media print{body{padding:0}}
  </style></head><body><div class="wrap">
    <div class="head">
      <div><div class="brand">ROULE <span>RODRIGUES</span></div><div class="muted">roulerodrig.com · Rodrigues Island</div></div>
      <div class="muted" style="text-align:right">${date}<br>Ref: ${esc(d.ref)}</div>
    </div>
    <h1>${esc(d.heading)}</h1>
    <table>
      <tr><td>Name</td><td class="v">${esc(d.customer)}</td></tr>
      <tr><td>${esc(d.itemLabel)}</td><td class="v">${esc(d.item)}</td></tr>
      ${rowsHtml}
    </table>
    ${d.note ? `<p class="note">${esc(d.note)}</p>` : ""}
    <div class="foot">Thank you for choosing Roule Rodrigues — take the long way. 🌴</div>
  </div></body></html>`;

  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  Object.assign(iframe.style, { position: "fixed", right: "0", bottom: "0", width: "0", height: "0", border: "0" });
  document.body.appendChild(iframe);
  const doc = iframe.contentWindow?.document;
  if (!doc) {
    iframe.remove();
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();
  setTimeout(() => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch {
      /* print unavailable */
    }
  }, 350);
  setTimeout(() => {
    try {
      iframe.remove();
    } catch {
      /* already gone */
    }
  }, 4000);
}
