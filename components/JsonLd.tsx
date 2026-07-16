// Renders a JSON-LD structured-data block.
//
// Escapes "<" so admin-entered text containing "</script>" can't break out of
// the tag. Server component — costs nothing on the client.
export default function JsonLd({ data }: { data: object | object[] }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}
