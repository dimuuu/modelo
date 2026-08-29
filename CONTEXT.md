# Modelo — domain vocabulary

These are the names the code uses. Use them in modules, in tests, in docs, and in conversation. Each entry names the module that owns the concept.

## The document

- **Notebook** — one document and everything derived from it: the projected model and the evaluated model. `describeNotebook` computes it once per document version (`src/engine/notebook.ts`). It is not a notebook record.
- **Notebook record** — a notebook as the workspace stores it: id, portable blocks, scenarios, `updatedAt` (`src/workspace.ts`). It stores no title; `notebookTitle` reads one from the blocks.
- **Document** — the ordered blocks of an open notebook. `editor.document` is the only source of truth. The engine sees it as `ModeloDocument`, plain data (`src/model.ts`).
- **Block** — one unit of the document. There are three families: **prose blocks** (heading, paragraph, list item), **variable blocks** (the four inputs and the formula), and **foreign blocks** that Modelo does not model, such as a table. The vocabulary lives in `src/engine/document.ts`.
- **Portable format** — the one shape a notebook takes outside the editor: seeds, `localStorage`, export files, agent payloads, `get_document`. Prose carries `inline`; a variable carries flat fields. `toEditorBlocks` and `fromEditorBlocks` are inverses (`src/engine/portable.ts`).
- **Title block** — the level 1 heading every document opens with. It is the notebook title, and there is no separate title field. `readTitle` reads it, `ensureTitleBlock` puts it back when a person deletes it, and no tool may remove it, demote it, or insert above it (`src/engine/title.ts`).
- **Inline reference** — an `@name` mention in prose, painted as a live chip. It is `variableRef` in the editor and `{ type: "ref" }` in the portable format. It stores the name it displays, and `renameVariable` keeps that name in step.

## The model

- **Variable** — a named value with a stable id that formulas can use. Every variable block declares one. The name is the only caption; a block has no separate label. The engine requires a MathJS identifier and nothing more, but every name in the app is PascalCase: the seeds, the defaults, and the names an agent writes. The rules live in `src/engine/variable.ts`.
- **Input** — a variable a reader sets: number, slider, select, or boolean. A boolean stores 0 or 1. A slider stays inside its bounds, and it is the only input with a step; a number input takes any value.
- **Block configuration** — format, currency, unit, decimals, slider bounds, and select options. None of it renders in the block. It fills the drag handle menu behind the six dots (`src/block-config.tsx`).
- **Formula** — a variable computed from a MathJS expression over other variables. Its display format comes from its units, never from a stored field.
- **Projection** — the walk from blocks to the variable registry (`inspectDocument`, `src/engine/projector.ts`). It is lenient: an invalid block becomes an **issue** on that block. `projectDocument` is the strict form and throws.
- **Evaluation** — resolving the formula graph by dependency, not by block order (`evaluateModel`, `src/engine/evaluate.ts`). A variable is `ok`, `missing`, or `error`. Zero is never substituted.
- **Formula engine** — one MathJS instance with its registered currencies (`FormulaEngine`). Production shares one; a test may hold its own.
- **Scenario** — a named snapshot of input values by `varId`. A notebook holds up to eight (`src/engine/scenarios.ts`).
- **Section** — the unit an agent writes: a heading, prose that mentions variables by `@name`, and the inputs and formulas those mentions resolve to (`src/engine/section.ts`).
- **Composition** — how a document reads: counts of prose, variables, and inline references, and whether it reads like a story or like a calculator.

## Mutation

- **Editor port** — the seam between notebook logic and the editor that holds the document: seven operations (`src/notebook/port.ts`). Two adapters implement it: BlockNote (`blocknote-port.ts`) and in-memory (`createMemoryPort`).
- **Session** — one open notebook seen through an editor port (`NotebookSession`). `current()` gives the notebook. `mutate()` runs a change in one transaction and reports what moved. `preview()` runs it on an in-memory copy.
- **Mutation** — a change to the document, written once in `src/notebook/mutations.ts`. Block components and tools call the same function.
- **Mutation report** — what a mutation changed, as the agent sees it: changed values, remaining errors, composition (`diffNotebooks`).
- **Update plan** — what one `update_block` call will do, decided without the editor (`planBlockUpdate`, `src/engine/block-update.ts`).

## Tools

- **Tool** — one row of the tool table: name, scope, schema, description, `run` (`src/webmcp/tools.ts`). Workspace tools are always registered. Notebook tools register only while a notebook is open.
- **Tool runtime** — what the app hands the tools: the workspace store and the open notebook's editor port.
- **Tool error** — a failure with a stable code (`ModeloToolError`, `src/notebook/errors.ts`), serialised as `{ ok: false, error: { code, message, details? } }`.

## The shell

- **Tab** — one slot in the tab strip: a notebook id, or null for **home**. A notebook is open in at most one tab, so its editor and its saved blocks never fork. Every change is a pure reducer in `src/tabs.ts`.
- **Tab state** — the list of tabs and the index of the one in front. It lives in the query string, not in React state: `?tabs=home,sales-ae-comp-plan&tab=2`. `useTabState` binds the two with nuqs (`src/use-tab-state.ts`).
- **Home** — what a new tab shows: the catalogue of notebooks, the new notebook button, and the import button (`src/HomeTab.tsx`). There is no notebook open, so notebook tools stay unregistered.
- **Open notebook** — the notebook in the tab that is in front. It is the one the tools act on.

## Workspace

- **Workspace** — the catalogue of notebook records plus the display defaults, currency and locale. It persists under one `localStorage` key. Every change is a pure reducer in `src/workspace.ts`.
- **Seeds** — the three notebooks copied into storage on first run, in the portable format (`src/data/seeds.json`).
