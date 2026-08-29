import { defineConfig } from "oxlint";
import core from "ultracite/oxlint/core";
import react from "ultracite/oxlint/react";

export default defineConfig({
  extends: [core, react],
  ignorePatterns: [
    ...core.ignorePatterns,
    // Vendored shadcn/ui primitives. The shadcn CLI regenerates these on
    // upgrade, so any local style fix would be silently overwritten.
    "src/components/ui/**",
  ],
  rules: {
    // The engine uses hoisted `function` declarations, including recursive
    // document visitors that are called before their definition.
    "func-style": "off",
    // The three model validation errors belong together in projector.ts.
    "max-classes-per-file": "off",
    // src/engine/index.ts is the engine's deliberate public surface.
    "oxc/no-barrel-file": "off",
    // BlockNote's editor and block API is not usefully typed at this
    // boundary. Warn instead of error so new `any` still stands out.
    "typescript/no-explicit-any": "warn",
    // Document snapshots are persisted to localStorage, so the JSON round
    // trip is the intended clone: it drops non-serialisable values instead
    // of throwing, which is what structuredClone would do.
    "unicorn/prefer-structured-clone": "off",
  },
});
