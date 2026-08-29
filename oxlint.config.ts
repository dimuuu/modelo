import { defineConfig } from "oxlint";
import core from "ultracite/oxlint/core";
import react from "ultracite/oxlint/react";

export default defineConfig({
  extends: [core, react],
  ignorePatterns: [
    ...core.ignorePatterns,
    // Vendored shadcn/ui output. The shadcn CLI regenerates these on upgrade,
    // so any local style fix would be silently overwritten.
    "src/components/ui/**",
    "src/lib/utils.ts",
  ],
  rules: {
    // Tracked cleanup, not accepted style. Three evaluation and serialisation
    // functions exceed the branch budget; see DECISIONS.md.
    complexity: "warn",
    // The engine uses hoisted `function` declarations, including recursive
    // document visitors that are called before their definition.
    "func-style": "off",
    // The three model validation errors belong together in projector.ts.
    "max-classes-per-file": "off",
    // src/engine/index.ts is the engine's deliberate public surface.
    "oxc/no-barrel-file": "off",
    // React components follow the same `function` convention as the engine,
    // as shadcn's own generated components do.
    "react/function-component-definition": "off",
    // Tracked cleanup. React Compiler cannot lower `throw` inside try/catch,
    // which the WebMCP tool error contract relies on.
    "react/todo": "warn",
    // Tracked cleanup. BlockNote's editor and block API is not usefully typed
    // at this boundary. Warn so new `any` still stands out.
    "typescript/no-explicit-any": "warn",
    // React convention: PascalCase component files, camelCase hook files.
    "unicorn/filename-case": [
      "error",
      { cases: { camelCase: true, kebabCase: true, pascalCase: true } },
    ],
    // Document snapshots are persisted to localStorage, so the JSON round trip
    // is the intended clone: it drops non-serialisable values instead of
    // throwing, which is what structuredClone would do.
    "unicorn/prefer-structured-clone": "off",
  },
});
