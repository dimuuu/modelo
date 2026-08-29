# Modelo

Modelo is a local-first notebook where the story and the calculation model are the same document. You edit prose with BlockNote. Formulas evaluate in the page with MathJS. A browser agent writes the same visible document through native WebMCP tools.

**Live:** https://modelo.vercel.app

> Pre-release. The README is short on purpose and will grow at v1.

## What works

- Three notebooks on first run: AE compensation, founder runway, and rent against mortgage.
- Full BlockNote prose editing: headings, paragraphs, lists, marks, the slash menu, block drag, and undo.
- Five model blocks: `/Number`, `/Slider`, `/Select`, `/Toggle`, and `/Formula`. Each one declares a variable.
- Type `@` in prose to insert a live variable chip. Delete the source and the chip reads `missing`. It never falls back to zero.
- A MathJS formula graph with forward references, visible parse, missing, and cycle errors, and formula rewrites on rename.
- Named scenarios. Save the current inputs, apply a saved set, and see which one matches. Up to eight.
- A workspace you can create, open, rename, duplicate, and delete. Everything persists in `localStorage`.
- Browser-style tabs. A new tab opens on home, which lists every notebook, and a notebook takes over the tab you open it from.
- JSON export and import of one notebook. Export from the tab that has it open.
- Native WebMCP registration. No backend and no polyfill.

## Run it

```bash
pnpm install
pnpm dev
```

Checks:

```bash
pnpm test     # vitest
pnpm check    # oxlint via ultracite
pnpm fix      # oxlint --fix and oxfmt --write
pnpm build    # tsc -b && vite build
```

## Stack

React 19, Vite, and TypeScript. BlockNote for the editor. MathJS for formulas. zod at every boundary. Tailwind CSS and shadcn/ui on Base UI for the interface. Ultracite with oxlint and oxfmt for linting and formatting. There is no server.

## WebMCP

Use Chrome with `chrome://flags/#enable-webmcp-testing`, or ChatGPT's in-app browser. Modelo needs native `document.modelContext`. Without it the app stays fully usable; the tools simply do not register.

Workspace tools are always registered. Notebook tools register only while a notebook is open. `src/webmcp/tools.ts` is the full list: one row per tool.

Every tool argument is parsed with zod before it reaches the document. A failure returns `{ ok: false, error: { code, message, details? } }` with no stack trace.

Try these against the AE compensation notebook:

1. "List the notebooks, open the AE compensation notebook, then summarize its model and any errors."
2. "Set `closed_arr` to 1,050,000 and tell me the new earned commission and total cash compensation."
3. "Insert a formula named `variable_pay_multiple` equal to `earned_commission / target_variable_pay`, then add a paragraph that references it."

To build a new model, ask the agent to write a section rather than to dump variables. An `@name` in a paragraph becomes a live reference.

## Browser data

Everything lives in this browser under the `modelo.workspace.v1` key. Open tabs are not stored; they last as long as the page. Export a notebook before you clear site data or change browser.

## More

- [CONTEXT.md](./CONTEXT.md) — the domain vocabulary.
- [CONTRIBUTING.md](./CONTRIBUTING.md) — the module map and the recipes for adding a block type or a tool.
- [DECISIONS.md](./DECISIONS.md) — open questions, v1 assumptions, and why the architecture is this way.

## License

MIT
