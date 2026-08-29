# Modelo — domain vocabulary

The names below are the ones the code uses. Use them in modules, tests, docs, and conversation. Each entry names the module that owns the concept.

## The document

- **Notebook** — one document and everything derived from it: the projected model and the evaluated model. Computed once per document version by `describeNotebook` (`src/engine/notebook.ts`). Not to be confused with a notebook record.
- **Notebook record** — a notebook as the workspace stores it: id, title, portable blocks, scenarios, `updatedAt` (`src/workspace.ts`).
- **Document** — the ordered blocks of an open notebook. `editor.document` is the only source of truth. The engine sees it as `ModeloDocument`, plain data (`src/model.ts`).
- **Block** — one unit of the document. Three families: **prose blocks** (heading, paragraph, list items), **variable blocks** (the four inputs and the formula), and **foreign blocks** (BlockNote blocks Modelo does not model, such as tables). The vocabulary lives in `src/engine/document.ts`.
- **Portable format** — the one shape a notebook takes outside the editor: seeds, `localStorage`, export files, agent payloads, `get_document`. Prose carries `inline`; variables carry flat fields. `toEditorBlocks` and `fromEditorBlocks` are inverses (`src/engine/portable.ts`).
- **Inline reference** — an `@name` mention in prose, rendered as a live chip. `variableRef` in the editor, `{ type: "ref" }` in the portable format.

## The model

- **Variable** — a named, stable-id value that formulas can use. Every variable block declares one. Its shape and rules live in `src/engine/variable.ts`.
- **Input** — a variable a reader sets: number, slider, select, or boolean. Booleans store 0 or 1. Sliders stay inside their bounds.
- **Formula** — a variable computed from a MathJS expression over other variables. Its display format comes from its units, never from a stored field.
- **Projection** — the walk from blocks to the variable registry (`inspectDocument`, `src/engine/projector.ts`). Lenient by default: an invalid block becomes an **issue** on that block. `projectDocument` is the strict form and throws.
- **Evaluation** — resolving the formula graph by dependency, not block order (`evaluateModel`, `src/engine/evaluate.ts`). A variable is `ok`, `missing`, or `error`. Zero is never substituted.
- **Formula engine** — one MathJS instance with its registered currencies (`FormulaEngine`). Production shares one; tests may hold their own.
- **Scenario** — a named snapshot of input values by `varId`. A notebook holds up to eight (`src/engine/scenarios.ts`).
- **Section** — the unit an agent writes: a heading, prose that mentions variables by `@name`, and the inputs and formulas those mentions resolve to (`src/engine/section.ts`).
- **Composition** — how a document reads: counts of prose, variables, and inline references, and whether it reads like a story or a calculator.

## Mutation

- **Editor port** — the seam between notebook logic and the editor that holds the document: seven operations (`src/notebook/port.ts`). Two adapters: BlockNote (`blocknote-port.ts`) and in-memory (`createMemoryPort`).
- **Session** — one open notebook seen through an editor port (`NotebookSession`). `current()` gives the notebook; `mutate()` runs a change in one transaction and reports what moved; `preview()` runs it on an in-memory copy.
- **Mutation** — a change to the document, written once in `src/notebook/mutations.ts` and called by both block components and tools.
- **Mutation report** — what a mutation changed, as the agent sees it: changed values, remaining errors, composition (`diffNotebooks`).
- **Update plan** — what one `update_block` call will do, decided without the editor (`planBlockUpdate`, `src/engine/block-update.ts`).

## Tools

- **Tool** — one row of the tool table: name, scope, schema, description, `run` (`src/webmcp/tools.ts`). Workspace tools are always registered; notebook tools only while a notebook is open.
- **Tool runtime** — what the app hands the tools: the workspace store and the open notebook's editor port.
- **Tool error** — a failure with a stable code (`ModeloToolError`, `src/notebook/errors.ts`), serialised as `{ ok: false, error: { code, message, details? } }`.

## Workspace

- **Workspace** — the catalogue of notebook records plus display defaults (currency, locale). Persisted under one `localStorage` key. Every change is a pure reducer in `src/workspace.ts`.
- **Seeds** — the three notebooks copied into storage on first run, in the portable format (`src/data/seeds.json`).
