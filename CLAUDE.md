# Modelo — working notes

Modelo is a local-first notebook where prose and a calculation model are the same document. React 19 + Vite, no backend, no auth, no router.

Ultracite's own standards live in [.claude/CLAUDE.md](./.claude/CLAUDE.md). This file covers what is specific to Modelo.

## The one invariant

`editor.document` is the only source of truth for an open notebook.

Everything else is derived from it:

1. `projectDocument()` walks the blocks and builds the variable registry.
2. `evaluateModel()` resolves the formula graph by dependency, not block order.
3. React paints the result through `ModelProvider`.
4. `onChange` persists the snapshot to `localStorage`.

Do not add a parallel document store, a Zustand slice, or a server copy. React state selects the open notebook and owns the workspace catalogue — nothing more.

Every mutation, human or agent, goes through the BlockNote editor API inside `editor.transact`.

## Layout

| Path | Holds |
| --- | --- |
| `src/App.tsx` | The app shell, the WebMCP adapter, and the `NotebookEditor` wrapper. |
| `src/editor.tsx` | The BlockNote schema: the five model blocks and the inline reference chip. |
| `src/engine/` | Editor-independent logic. No React, no BlockNote imports. |
| `src/model.ts` | The projected and evaluated types. No dependency on BlockNote. |
| `src/webmcp/schemas.ts` | Every tool argument shape, as zod. |
| `src/webmcp/useModeloTools.ts` | Tool registration and the failure contract. |
| `src/workspace.ts` | Persistence, seeds, and the portable-to-editor block conversion. |
| `src/components/ui/` | Vendored shadcn/ui output. Do not hand-edit; it is regenerated. |

## Rules that matter here

- **Validate at the boundary.** Anything from an agent, `localStorage`, or an imported file is parsed with zod first. Add the schema to `src/webmcp/schemas.ts` and let `z.infer` produce the type. Never hand-write a type that a schema already describes.
- **Never substitute zero.** A missing or broken variable renders `missing` or an error. Silent zeros produce wrong models.
- **Rename by symbol, not by text.** `renameVariable` parses each formula and swaps the matching `SymbolNode`.
- **`aria-label` is the test contract.** The app tests query by label and role. Changing a label breaks tests on purpose.
- **Tailwind for everything visual.** The only stylesheet is `src/blocknote-theme.css`, which exists because BlockNote paints its own editor surface and cannot be reached with utility classes.

## Commands

```bash
pnpm dev      # vite
pnpm test     # vitest, 50 tests
pnpm check    # oxlint via ultracite; must exit 0
pnpm fix      # oxlint --fix and oxfmt --write
pnpm build    # tsc -b && vite build
```

Run `pnpm fix` before committing. `oxlint.config.ts` documents every overridden rule and why; read the comment before adding another override.

Warnings are allowed and tracked: `no-explicit-any` at the BlockNote boundary, `complexity` on three functions, and one React Compiler limitation. Errors are not.

## Environment

The public npm registry is blocked on this machine. Installs go through the Artifactory proxy already configured in `~/.npmrc`. That mirror lags the public registry by roughly one version, so a brand-new release may not resolve; pick the newest version the mirror carries.
