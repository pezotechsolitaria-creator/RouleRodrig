"use client";

import { MotionConfig } from "framer-motion";

// Site-wide motion policy.
//
// WHY THIS EXISTS: DESIGN.md commits to "60fps transform/opacity/filter motion,
// fully disabled under prefers-reduced-motion". In practice only 3 of the 45
// components using framer-motion called useReducedMotion(), so ~42 animated
// regardless — including infinite loops in the hero backdrop and an
// auto-advancing carousel. app/globals.css has several
// @media (prefers-reduced-motion) blocks, but they can only reach CSS
// animations: framer-motion writes INLINE styles that a media query never sees.
//
// MotionConfig reducedMotion="user" is the only mechanism that covers the whole
// tree at once — every <motion.*> descendant drops transform/layout animation
// when the OS asks for reduced motion, while opacity crossfades still resolve
// so nothing disappears or gets stuck mid-transition.
//
// It is a Client Component solely because MotionConfig uses context; it renders
// no DOM of its own, so it costs nothing in the server-rendered markup.
export default function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
