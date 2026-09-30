// Renders a JSON-LD structured-data block.
//
// Escapes "<" so admin-entered text containing "</script>" can't break out of
// the tag. Server component — costs nothing on the client.
//
// ── AN ARRAY IS WRAPPED IN ONE @graph (SEO audit 2026-09-29 T1) ────────────
// A bare top-level array gives each node its own scope, so a node that did not
// spell out "@context" itself — every experienceLd() Service, stayLd()
// LodgingBusiness and sellerLd() AutoRental passed bare — resolved to nothing:
// "Service" became a relative IRI, and the nodes carrying the experience and
// stay prices were unreadable to a strict parser. One @context over one @graph
// fixes every caller at once. The "@context" most helpers still carry per node
// is harmless inside it: the same vocabulary, declared again.
export function jsonLdPayload(data: object | object[]): object {
  return Array.isArray(data) ? { "@context": "https://schema.org", "@graph": data } : data;
}

export default function JsonLd({ data }: { data: object | object[] }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(jsonLdPayload(data)).replace(/</g, "\\u003c"),
      }}
    />
  );
}
