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
- Workspace display defaults are EUR and `es-ES`, and are required in storage. The product has not launched, so there is no compatibility path for older snapshots: a stored workspace that fails the schema falls back to the seeds.
- Number, slider, and select blocks may set 0–8 fixed decimals. Without it, currency shows 0 decimals for integers and 2 for non-integers. A formula's display format comes from its units; a formula block stores no format fields.
- Select option values are numeric; labels carry scenario meaning.
- Deleting the final block is refused by BlockNote; deleting variables otherwise leaves formula errors and `missing` inline chips visible.
- Multi-tab live synchronization, auth, sharing, locks, AI chat, and a backend are intentionally out of scope.
- A Vitest + happy-dom smoke test is sufficient for the UI. The tools, the engine, and the portable format are tested without a DOM.

## Architecture decisions

- **One portable format.** Seeds, `localStorage`, exports, agent payloads, and `get_document` all use the same shape (`src/engine/portable.ts`). Before this, the editor's own block shape was persisted and read back through a converter that expected a different dialect, so prose was lost on every reload. `toEditorBlocks` and `fromEditorBlocks` are inverses and are tested as such.
- **An editor port with two adapters.** Notebook logic talks to `EditorPort`, not to BlockNote. The in-memory adapter runs the same code in tests and for `dry_run`. Anything that cannot run against `createMemoryPort` does not belong in a tool.
- **A tool table, not a hook per tool.** `src/webmcp/tools.ts` is the only description of a tool. Registration loops over it; the UI's buttons call `runTool` like an agent does. `useWebMCP` must be called at a component's top level, so `ModeloTools` renders one small component per row.
- **Lenient projection.** `inspectDocument` keeps an invalid block as an issue on that block. A duplicate name marks the second block, not the whole document. `projectDocument` remains as the strict form for callers that need a clean model (rename).
- **Domain schemas live with their module.** `variable.ts`, `section.ts`, and `block-update.ts` own their zod schemas; `src/webmcp/schemas.ts` composes them into tool arguments and publishes JSON Schema. `z.infer` produces every type.
- **No compatibility code.** The product has not launched. Legacy block type names, the seed `props` dialect, the `bullet` alias, and optional-with-default storage fields were removed rather than supported.

## Tooling decisions

- **Ultracite with oxlint and oxfmt.** oxfmt owns formatting. `pnpm check` must exit 0. Warnings are allowed and tracked below.
- **shadcn/ui on the Base UI variant, not Radix.** Every control in the app is a shadcn component. The only remaining stylesheet is `src/blocknote-theme.css`, which binds BlockNote's own editor surface to the shadcn tokens; BlockNote paints that surface itself and cannot be reached with utility classes.
- **zod at every boundary.** WebMCP tool arguments, `localStorage`, imported files, and the select-options JSON prop are parsed, not trusted.
- **Registry.** The public npm registry is blocked on the primary machine, so installs use an Artifactory proxy that lags roughly one version. `@types/react-dom` is pinned to 19.2.4 for that reason, and the lockfile is resolved against what the mirror carries.

### Lint rules turned off on purpose

Each is commented in `oxlint.config.ts`:

- `func-style` and `react/function-component-definition` — the codebase uses hoisted `function` declarations.
- `max-classes-per-file` — the three model validation errors belong together in `projector.ts`.
- `unicorn/prefer-structured-clone` — document snapshots are persisted to `localStorage`, so the JSON round trip is the intended clone: it drops non-serialisable values instead of throwing.

### Warnings kept on purpose

- `typescript/no-explicit-any` (1) — `type AnyEditor = any` in `src/notebook/blocknote-port.ts`. This is the adapter, the one place BlockNote's opaque editor generics are allowed to meet the port. The block components in `src/editor.tsx` type their props structurally (`ModelBlockFields`) and hand the editor to the port as `unknown`.

## Known gaps

- The architecture refactor has not been reviewed in a real browser. The test suite and the production build pass, but the visual result needs a pass at `pnpm dev`.
- The production bundle is a single 2.1 MB chunk. Code splitting is untouched.
- `src/components/ui/` is vendored output and is excluded from linting; upgrading shadcn will overwrite any local edit.
