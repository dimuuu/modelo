# Modelo — working notes

Modelo is a local-first notebook where prose and a calculation model are the same document. React 19 + Vite, no backend, no auth, no router.

Ultracite's own standards live in [.claude/CLAUDE.md](./.claude/CLAUDE.md). This file covers what is specific to Modelo. The domain vocabulary is in [CONTEXT.md](./CONTEXT.md); use those names in code and in conversation.

## The one invariant

`editor.document` is the only source of truth for an open notebook.

Everything else is derived from it, once, by `describeNotebook()`:

1. `inspectDocument()` walks the blocks and builds the variable registry. An invalid block becomes an issue on that block, not a failure of the whole document.
2. `evaluateModel()` resolves the formula graph by dependency, not block order.
3. React paints the result through `ModelProvider`.
4. `onChange` converts the document to the portable format and persists it.

Do not add a parallel document store, a Zustand slice, or a server copy. React state holds the workspace catalogue and the id of the open notebook — nothing more.

Every mutation, human or agent, goes through an `EditorPort` inside one transaction. `src/notebook/mutations.ts` holds the mutations both sides call.

## Layout

| Path | Holds |
| --- | --- |
| `src/engine/` | Editor-independent logic. No React, no BlockNote imports. Import modules by name; there is no barrel. |
| `src/engine/document.ts` | The block vocabulary and the document walk. Add a block type here first. |
| `src/engine/variable.ts` | The shape of one variable and its rules: identifiers, decimals, select options, slider clamp, format helpers. |
| `src/engine/portable.ts` | The portable notebook format. `toEditorBlocks` and `fromEditorBlocks` are inverses. |
| `src/engine/notebook.ts` | `describeNotebook` and `diffNotebooks`: the notebook value and the mutation report. |
| `src/engine/block-update.ts` | The `update_block` policy as a table, and `planBlockUpdate`. |
| `src/engine/section.ts` | The section schema and `buildSectionBlocks`. |
| `src/notebook/port.ts` | `EditorPort`, the seam, plus the in-memory adapter for tests and `dry_run`. |
| `src/notebook/blocknote-port.ts` | The BlockNote adapter. The only file that casts the editor to `any`. |
| `src/notebook/session.ts` | `NotebookSession`: `current()`, `mutate()`, `preview()`, `insert()`. |
| `src/notebook/mutations.ts` | Mutations shared by block components and tools. |
| `src/webmcp/tools.ts` | The tool table: name, schema, description, and `run` for every tool. `runTool` is the test surface. |
| `src/webmcp/schemas.ts` | Tool argument schemas, composed from the engine's schemas and published as JSON Schema. |
| `src/webmcp/ModeloTools.tsx` | Registers the table with WebMCP, one component per row. |
| `src/workspace.ts` | Persistence and the catalogue reducers. |
| `src/App.tsx` | The shell. Sidebar, header, dialogs. Every button calls `runTool`. |
| `src/NotebookEditor.tsx` | The BlockNote surface for one notebook. |
| `src/editor.tsx` | The BlockNote schema: the five model blocks and the inline reference chip. |
| `src/components/ui/` | Vendored shadcn/ui output. Do not hand-edit; it is regenerated. |

## Rules that matter here

- **Validate at the boundary.** Anything from an agent, `localStorage`, or an imported file is parsed with zod first. Domain schemas live next to their module (`section.ts`, `block-update.ts`, `variable.ts`); `src/webmcp/schemas.ts` composes them into tool arguments. Let `z.infer` produce the type. Never hand-write a type that a schema already describes.
- **Never substitute zero.** A missing or broken variable renders `missing` or an error. Silent zeros produce wrong models.
- **Rename by symbol, not by text.** `renameVariable` parses each formula and swaps the matching `SymbolNode`.
- **One vocabulary.** Ask `document.ts` whether a block is an input, a formula, or prose. Ask `variable.ts` how to clamp, coerce, or format. Do not add a local `Set` of type names.
- **Tools run against plain data.** A tool must work through `createMemoryPort`. If it needs BlockNote, the logic is in the wrong place.
- **`aria-label` is the test contract.** The app tests query by label and role. Changing a label breaks tests on purpose.
- **Tailwind for everything visual.** The only stylesheet is `src/blocknote-theme.css`, which exists because BlockNote paints its own editor surface and cannot be reached with utility classes.

## Commands

```bash
pnpm dev      # vite
pnpm test     # vitest, 96 tests
pnpm check    # oxlint via ultracite; must exit 0
pnpm fix      # oxlint --fix and oxfmt --write
pnpm build    # tsc -b && vite build
```

Run `pnpm fix` before committing. `oxlint.config.ts` documents every overridden rule and why; read the comment before adding another override.

One warning is kept on purpose: the `any` in `src/notebook/blocknote-port.ts`, where BlockNote's editor meets the port. Errors are not allowed.

## Environment

The public npm registry is blocked on this machine. Installs go through the Artifactory proxy already configured in `~/.npmrc`. That mirror lags the public registry by roughly one version, so a brand-new release may not resolve; pick the newest version the mirror carries.
