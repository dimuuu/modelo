# Decisions

## Needs Dmytro

- **Public name and copy:** keep "Modelo" and the restrained one-line positioning, or tune the name and voice before submission?
- **Persistence expectation:** v1 is deliberately browser-local. Decide whether a later version needs account sync or sharing, which would change the no-backend architecture.
- **Units UX:** v1 accepts a display unit and leaves explicit conversions to MathJS formula expressions. Decide whether the editor should grow dedicated unit pickers and conversion controls.
- **Import policy:** workspace import replaces the local workspace after validation. Decide whether import should merge instead.
- **WebMCP test surface:** document tools disappear on the workspace home by design; workspace tools remain. Confirm this is the desired demo flow.
- **Production domain:** use Vercel's `modelo.vercel.app` alias, or attach a custom domain.
- **Dark mode:** shadcn ships a full dark palette in `src/index.css` and every component honours it, but nothing toggles `.dark` yet and `BlockNoteView` is pinned to `theme="light"`. Decide whether to finish it or drop the tokens.

## Assumptions made for v1

- Variable names are MathJS-safe identifiers (`letters/_`, then `letters/digits/_`) and case-sensitive.
- Currency is formatting only; there is no live FX. Seed models use EUR.
- Workspace display defaults are EUR and `es-ES`; older v1 storage receives those defaults without a storage-key migration.
- Number, slider, and formula blocks may set 0–8 fixed decimals. Without it, currency shows 0 decimals for integers and 2 for non-integers.
- Select option values are numeric; labels carry scenario meaning.
- Deleting the final block is refused by BlockNote; deleting variables otherwise leaves formula errors and `missing` inline chips visible.
- Multi-tab live synchronization, auth, sharing, locks, AI chat, and a backend are intentionally out of scope.
- A Vitest + happy-dom smoke test is sufficient for v1. Playwright was not added to avoid shipping a browser dependency for a handful of assertions.

## Tooling decisions

- **Ultracite with oxlint and oxfmt.** oxfmt owns formatting; the previous dense one-line style is gone. `pnpm check` must exit 0. Warnings are allowed and tracked below.
- **shadcn/ui on the Base UI variant, not Radix.** Every control in the app is a shadcn component. The only remaining stylesheet is `src/blocknote-theme.css`, which binds BlockNote's own editor surface to the shadcn tokens; BlockNote paints that surface itself and cannot be reached with utility classes.
- **zod at every boundary.** WebMCP tool arguments, `localStorage`, imported files, and the select-options JSON prop are parsed, not trusted. `src/webmcp/schemas.ts` is the single source for tool argument shapes: it produces the published JSON Schema, the TypeScript types, and the runtime check.
- **Registry.** The public npm registry is blocked on the primary machine, so installs use an Artifactory proxy that lags roughly one version. `@types/react-dom` is pinned to 19.2.4 for that reason, and the lockfile is resolved against what the mirror carries.

### Lint rules turned off on purpose

Each is commented in `oxlint.config.ts`:

- `func-style` and `react/function-component-definition` — the codebase uses hoisted `function` declarations, including recursive document visitors called before their definition.
- `max-classes-per-file` — the three model validation errors belong together in `projector.ts`.
- `oxc/no-barrel-file` — `src/engine/index.ts` is the engine's deliberate public surface.
- `unicorn/prefer-structured-clone` — document snapshots are persisted to `localStorage`, so the JSON round trip is the intended clone: it drops non-serialisable values instead of throwing.

### Warnings kept as tracked cleanup

- `typescript/no-explicit-any` (92) — BlockNote's editor and block API is not usefully typed at the App and editor boundary. Reducing this needs real generic work against BlockNote's schema types.
- `eslint/complexity` (5) — `formatValue`, `slimBlock`, the section builder, `evaluateModel`'s inner evaluator, and the adapter's update preparation each exceed the branch budget. Splitting them is worthwhile but carries regression risk; do it behind the existing tests.
- `react/todo` (1) — React Compiler cannot lower `throw` inside `try`/`catch`, which the WebMCP tool error contract relies on.

## Known gaps

- The shadcn migration has not been reviewed in a real browser. The test suite and the production build pass, but the visual result needs a pass at `pnpm dev`.
- The production bundle is a single 2.1 MB chunk. Code splitting is untouched.
- `src/components/ui/` is vendored output and is excluded from linting; upgrading shadcn will overwrite any local edit.
