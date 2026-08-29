# Modelo — working notes

Modelo is a local-first notebook where prose and a calculation model are the same document. React 19 and Vite. No backend, no auth, no router; the tab strip keeps its state in the query string with nuqs.

Read the code for how it works. Read these files for what the code cannot say:

- [CONTEXT.md](./CONTEXT.md) — the domain vocabulary. Use these names in code, in tests, and in conversation.
- [CONTRIBUTING.md](./CONTRIBUTING.md) — the module map, the checks, and the recipes for adding a block type or a tool.
- [DECISIONS.md](./DECISIONS.md) — open questions, the assumptions v1 rests on, and why the architecture is this way.
- [.claude/CLAUDE.md](./.claude/CLAUDE.md) — Ultracite's own standards.

## How to work here

- **The product has not launched.** There is no user and no stored data to protect. Delete the old path. Do not add a fallback, a migration, an alias, or an optional field to keep it alive.
- **Take the simplest solution that works.** Prefer deleting code to adding an option. If a change needs a new layer, say why before you build it.
- **`editor.document` is the only source of truth for an open notebook.** Everything else is derived from it. Do not add a second document store, a Zustand slice, or a server copy.
- **Every mutation goes through `EditorPort`, inside one transaction.** Humans and agents call the same functions in `src/notebook/mutations.ts`.
- **Validate at the boundary.** Parse anything from an agent, from `localStorage`, or from an imported file with zod first. Let `z.infer` produce the type. Never hand-write a type a schema already describes.
- **Never substitute zero.** A missing or broken variable renders `missing` or an error. A silent zero produces a wrong model.
- **One vocabulary.** Ask `document.ts` whether a block is an input, a formula, or prose. Ask `variable.ts` how to clamp, coerce, or format. Do not keep a local `Set` of type names.
- **`aria-label` is the test contract.** The app tests query by label and role. Changing a label breaks tests on purpose.
- **Tailwind for everything visual.** The one stylesheet is `src/blocknote-theme.css`.
- **Do not hand-edit `src/components/ui/`.** The shadcn CLI regenerates it.

## Commands

```bash
pnpm dev      # vite
pnpm test     # vitest
pnpm check    # oxlint via ultracite; must exit 0
pnpm fix      # oxlint --fix and oxfmt --write
pnpm build    # tsc -b && vite build
```

Run `pnpm fix` before committing. `oxlint.config.ts` explains every overridden rule; read the comment there before adding another override. One warning stands on purpose: the `any` in `src/notebook/blocknote-port.ts`, where BlockNote's editor meets the port. Errors are not allowed.

## Environment

The public npm registry is blocked on this machine. Installs go through the Artifactory proxy in `~/.npmrc`. That mirror lags the public registry by about one version, so pick the newest version it carries.
