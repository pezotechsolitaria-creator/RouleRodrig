// ── THE MARK ON THE RECEIPT (M167) ──────────────────────────────────────────
//
// A 120x120 JPEG of the app icon, flattened onto white and stored as base64 so
// lib/receipt-pdf.ts can embed it as an Image XObject with no network call and
// no dependency — the same constraints the rest of that file was written under.
//
// JPEG, not PNG: DCTDecode is a filter every PDF reader has, so the bytes go in
// untouched. A PNG would need its alpha flattened and its rows re-deflated by
// hand, for a logo that sits on white anyway.
//
// Regenerate with:
//   sharp("public/icon-192.png").flatten({ background: "#ffffff" })
//     .resize(120, 120, { fit: "contain", background: "#ffffff" })
//     .jpeg({ quality: 82, chromaSubsampling: "4:4:4" })
//
// Keep it small. The receipt was ~2 KB by design and this is its only asset;
// at 5.5 KB of JPEG the finished PDF is still under 10 KB.

export const RECEIPT_LOGO = {
  width: 120,
  height: 120,
  /** Base64 JPEG, decoded to a latin-1 string when the PDF is assembled. */
  base64:
  "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" +
  "9gPYe36mpAKWmx8dkDelq//Z",
} as const;
