# Modelo

Modelo is a local-first, Notion-like notebook where the story and the calculation model are the same document. Humans edit with BlockNote; formulas are evaluated in the page with MathJS; browser agents author the same visible document through native WebMCP tools.

**Live:** https://modelo.vercel.app (production URL; see the Vercel deployment for aliases)

## What works

- Three first-run notebooks: AE compensation, founder runway, and a Valencia-flavoured rent-vs-mortgage model.
- Full BlockNote prose editing: headings, paragraphs, lists, marks, slash menu, block drag, and undo.
- `/Number`, `/Slider`, `/Select`, and `/Formula` custom blocks. Every model block defines one stable-id variable.
- Type `@` to insert a live variable reference chip in prose. Deleting its source shows `missing`; it never substitutes zero.
- MathJS formula graph with forward references, visible parse/missing/cycle errors, exact-symbol formula rewrites on variable rename, EUR/currency/percent/unit display, and unique-name validation.
- Workspace create, open, rename, duplicate, and delete. The complete workspace persists in `localStorage`; deleted seeds do not return.
- Export the current notebook or workspace as JSON; import a prior Modelo workspace JSON.
- Native WebMCP registration through `use-webmcp-tool` 0.2.0. There is no backend and no product polyfill.

## Run locally

```bash
pnpm install
pnpm dev
```

Tests and production build:

```bash
pnpm test
pnpm build
```

## WebMCP

Use Chrome with `chrome://flags/#enable-webmcp-testing`, or ChatGPT's in-app browser. Native `document.modelContext` must be available; otherwise Modelo stays fully usable and reports “WebMCP unavailable” in the sidebar.

Workspace tools remain registered everywhere:

- `list_notebooks`, `open_notebook`, `create_notebook`, `duplicate_notebook`, `delete_notebook`, `rename_notebook`

Document tools register only while a notebook is open:

- `get_document`, `get_model`, `write_section`, `insert_blocks`, `update_block`, `remove_blocks`, `replace_paragraph`, `insert_inline_ref`, `set_variable`

Tool failures are structured `{ ok: false, error: { code, message, details? } }` values without stack traces. Document mutations use the BlockNote editor API inside `editor.transact`.

### Suggested prompts against the Sales notebook

To build a new model, ask ChatGPT to `write_section` rather than dump variables.

1. “List the notebooks, open the AE compensation notebook, then summarize its model and any errors.”
2. “Set `closed_arr` to 1,050,000 and tell me the new earned commission and total cash compensation.”
3. “Add a paragraph after the model saying `At @closed_arr, total cash pay is @total_cash_compensation.`”
4. “Insert a formula named `variable_pay_multiple` equal to `earned_commission / target_variable_pay`, then add a paragraph that references it.”
5. “Duplicate this notebook as ‘Aggressive sales scenario’, open the copy, and set `accelerator_multiplier` to 2.”

## Architecture

`editor.document` is the open notebook's only document source of truth. Human input and WebMCP operations mutate it. `onChange` projects variables, evaluates the graph, paints formula/ref values, and persists the resulting snapshot. React state only selects the open notebook and owns the workspace catalogue; there is no parallel Zustand document, collaboration layer, server, or auth.

Seeds are repository JSON fixtures copied only when the storage key is absent. Existing storage is authoritative on later deploys.

## Browser data

All data lives in this browser's local storage under `modelo.workspace.v1`. Export before clearing site data or switching browsers.

## License

MIT
