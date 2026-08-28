import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // ── BRACES, ALWAYS ────────────────────────────────────────────
      // A real bug, shipped, in app/taxi/book/BookRide.tsx. The line was:
      //
      //     if (!r.ok || !b.ok) throw new Error(b.error || "…");
      //
      // Replacing that one statement with two — a console.warn and the throw —
      // without adding braces left the `throw` OUTSIDE the condition. Every
      // ride booking then threw, the setDone() below it became unreachable,
      // and the customer saw an error for a ride the server had just created.
      //
      // TypeScript flags neither half: a brace-less if is valid, and
      // unreachable code after a throw is not an error. The build passed, 1905
      // tests passed, and only driving the flow found it.
      //
      // `curly` is the rule that would have caught the CAUSE, and it is
      // deliberately NOT enabled: this codebase has 157 brace-less bodies
      // written before it, and turning it on would mean 157 edits across files
      // nothing in this change has tested. A lint sweep of that size, bundled
      // with a bug fix, is how a fix becomes a risk. Worth doing on its own.
      //
      // `no-unreachable` catches the CONSEQUENCE instead, which is the half
      // that actually hurt: `setDone(...)` sitting after an unconditional
      // throw, so the customer never saw their reference. It costs nothing —
      // the codebase has no existing violations — and it would have failed
      // this exact commit.
      "no-unreachable": "error",
    },
  },

  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
