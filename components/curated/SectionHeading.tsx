"use client";

import Reveal from "./Reveal";

/**
 * One heading treatment for the whole page.
 *
 * Serif title, sans subtitle, and a hairline that fades at both ends. Sections
 * that each invented their own heading are how a page stops reading as one
 * publication — the rule below is doing as much work as the type.
 */
export default function SectionHeading({
  title,
  subtitle,
  id,
  align = "left",
}: {
  title: string;
  subtitle?: string;
  id?: string;
  align?: "left" | "center";
}) {
  if (!title && !subtitle) return null;
  return (
    <Reveal>
      <div className={align === "center" ? "text-center" : ""}>
        <div
          className="rr-cur-rule mb-6"
          style={align === "center" ? { maxWidth: "8rem", marginInline: "auto" } : { maxWidth: "5rem" }}
        />
        <h2
          id={id}
          className="rr-cur-display text-[clamp(1.75rem,5.4vw,2.9rem)]"
          style={{ color: "var(--cur-ivory)" }}
        >
          {title}
        </h2>
        {subtitle && (
          <p
            className={`mt-2.5 font-dm text-sm leading-relaxed lg:text-base ${
              align === "center" ? "mx-auto max-w-xl" : "max-w-xl"
            }`}
            style={{ color: "var(--cur-dim)" }}
          >
            {subtitle}
          </p>
        )}
      </div>
    </Reveal>
  );
}
