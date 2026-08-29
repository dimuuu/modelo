# Decisions

What the code cannot say for itself: the questions still open, the assumptions v1 rests on, and the alternative each architecture choice rejected.

## Open questions

- **Name and copy.** Keep "Modelo" and the one-line positioning, or change them before submission?
- **Persistence.** v1 is browser-local on purpose. Accounts or sharing would need a backend.
- **Units.** v1 takes a display unit and leaves conversion to a MathJS expression. Should the editor grow unit pickers?
- **Import.** Import takes one exported notebook and adds it. Should a whole-workspace file come back?
- **Demo flow.** Notebook tools disappear on a home tab. Is that the flow the demo should show?
- **Domain.** Use `modelo.vercel.app`, or attach a custom domain?
- **Dark mode.** `src/index.css` carries a full dark palette and every shadcn component honours it. Nothing toggles `.dark`, and `BlockNoteView` is pinned to `theme="light"`. Finish it, or delete the tokens?

## What v1 assumes

- A variable name is a MathJS identifier. It starts with a letter or `_`, then takes letters, digits, or `_`. Names are case-sensitive.
- Currency is formatting only. There is no live exchange rate. The seeds use EUR.
- Workspace defaults are EUR and `es-ES`. A stored workspace that fails the schema falls back to the seeds.
- Number, slider, and select blocks may fix 0 to 8 decimals. Without that, currency shows 0 decimals for a whole number and 2 for any other. A formula takes its format from its units.
- Select option values are numbers. The labels carry the meaning.
- BlockNote refuses to delete the last block. Deleting a variable leaves formula errors and `missing` chips on show.
- Out of scope: sync between browser windows, auth, sharing, locks, AI chat, and a backend.
- One Vitest and happy-dom smoke test covers the UI. The engine, the tools, and the portable format are tested without a DOM.

## Why the architecture is this way

Each entry names the alternative it rejects. [CONTEXT.md](./CONTEXT.md) names the parts.

- **One portable format.** Seeds, storage, exports, agent payloads, and `get_document` share one shape. Before this, the editor's own block shape was stored and read back through a converter that expected another dialect, so prose was lost on every reload.
- **An editor port with two adapters.** Notebook logic talks to `EditorPort`, never to BlockNote. The in-memory adapter runs the same code in tests and for `dry_run`. Anything that cannot run against `createMemoryPort` does not belong in a tool.
- **A tool table, not a hook per tool.** One row describes a tool once. `useWebMCP` must be called at a component's top level, so `ModeloTools` renders one small component per row.
- **Lenient projection.** An invalid block becomes an issue on that block. A duplicate name marks the second block, not the whole document. A strict `projectDocument` remains for callers that need a clean model.
- **The title is a block, not a field.** Every document opens with a level 1 heading, and that heading is the notebook title. The rejected alternative was a `title` field on the notebook record beside a heading in the document: two names for one thing, free to drift, and one of them invisible to the agent tools that write prose.
- **Domain schemas live with their module.** The engine owns its rules; `src/webmcp/schemas.ts` only composes them. A tool schema that restates a rule will drift from it.
- **Tabs, not a sidebar.** The notebook owns the viewport, and navigation is a strip of browser-style tabs over a home page. A sidebar spent width on a list a reader consults rarely, and it could show only one notebook at a time. Every open notebook now stays mounted behind its tab, so switching keeps the cursor and the scroll position.
- **The query string is the tab store.** `?tabs=home,sales-ae-comp-plan&tab=2` is the whole tab strip, read and written with nuqs. A reload, a bookmark, and a shared link all open the same tabs, and there is no second copy of the state to keep in step. The rejected alternative was React state mirrored into the URL, which is two sources of truth for one list.
- **One tab per notebook.** Opening a notebook that is already open brings its tab forward. Two editors over one record would fork the document, because each one saves its own copy of the blocks.
- **shadcn on Base UI, not Radix.** One component library covers every control. The one stylesheet left is `src/blocknote-theme.css`, because BlockNote paints its own editor surface.

## Known gaps

Date each entry. Delete it when it is fixed.

- **2026-08-29** — the architecture refactor and the tab shell have not been seen in a browser. Tests and the build pass.
- **2026-08-29** — the production bundle is one 2.1 MB chunk. Code splitting is untouched.
