# Contributing

## Setup

```bash
pnpm install
pnpm dev          # http://localhost:5173
```

Before you commit:

```bash
pnpm fix          # oxlint --fix and oxfmt --write
pnpm check        # must exit 0
pnpm test
pnpm build
```

`pnpm check` allows warnings and forbids errors. One warning stands on purpose; see Style below. The domain vocabulary is in [CONTEXT.md](./CONTEXT.md), and the standing assumptions are in [DECISIONS.md](./DECISIONS.md).

## How the pieces fit

```
                 portable format                       editor port
 seeds / storage ───toEditorBlocks──▶ BlockNote ◀──── NotebookSession ◀── tool table ◀── WebMCP
 export / agents ◀──fromEditorBlocks── document ◀──── mutations      ◀── block components
                                          │
                                   describeNotebook
                                          │
                       inspectDocument ─▶ evaluateModel ─▶ ModelProvider (values, @chips)
```

- `src/engine/` never imports React or BlockNote. It takes plain blocks and returns plain data. Import a module by name; there is no barrel.
- `src/notebook/` is the seam. `EditorPort` names the seven editor operations; BlockNote and an in-memory array both implement it. `NotebookSession` and the shared mutations sit on top.
- `src/webmcp/tools.ts` is the tool table. `App.tsx` buttons and WebMCP agents call the same `runTool`.
- `src/editor.tsx` is the only file that knows the BlockNote schema. `src/NotebookEditor.tsx` is the only file that creates an editor.
- Every document opens with a level 1 heading, and that heading is the notebook title. `src/engine/title.ts` reads it; `ensureTitleBlock` puts it back after a person deletes it.

## Adding a model block type

A model block is one variable. Five exist: `number`, `slider`, `select`, `boolean`, `formula`.

1. **Vocabulary.** Add the type to `INPUT_BLOCK_TYPES` in `src/engine/document.ts`. Projection, scenarios, composition, the portable format, and the tool schemas all read from it.
2. **Rules.** If the type needs its own coercion or clamp, extend `coerceInputValue` in `src/engine/variable.ts`.
3. **Update policy.** Add a row to `ALLOWED_FIELDS` in `src/engine/block-update.ts`.
4. **Schema.** Add a `createReactBlockSpec` in `src/editor.tsx` and register it in `modeloSchema.blockSpecs`. Give the render an `aria-label` — the tests query by it.
5. **Defaults.** Extend `newVariableProps` in `src/engine/variable.ts` and `MODEL_BLOCKS` in `src/NotebookEditor.tsx` so the slash menu can insert one.
6. **Tests.** Add the type to `tests/block-update.test.ts` and a round trip to `tests/portable.test.ts`.

## Adding a WebMCP tool

1. Declare the argument shape in `src/webmcp/schemas.ts`. Reuse the engine's schemas (`inputFields`, `sectionSchema`, `variableNameSchema`) rather than restating a rule.
2. Add a row to `notebookTools` or `workspaceTools` in `src/webmcp/tools.ts`: `name`, `scope`, `description`, `readOnly` if it does not write, `schema`, and `run`.
3. In `run`, take `context.session()` for a notebook tool. Read through `session.current()`, write inside `session.mutate(...)`, and return the extra fields you want merged into the mutation report. Use `session.preview(...)` for `dry_run`.
4. Use `fault(code, message, details?)` for expected failures. Add the code to `ToolErrorCode` in `src/notebook/errors.ts` if it is new.
5. Add a case to `tests/tools.test.ts`. The harness there runs the tool against `createMemoryPort`; if your tool cannot run there, its logic is in the wrong place.

Registration is automatic: `ModeloTools` renders one `useWebMCP` per row.

## Tests

`tests/` uses Vitest with happy-dom.

- `engine.test.ts`, `notebook.test.ts`, `composition.test.ts`, `scenarios.test.ts`, `get-model.test.ts`, `block-update.test.ts`, `portable.test.ts`, `editor-config.test.ts` — pure functions, no DOM.
- `tools.test.ts` — every tool through `runTool` against an in-memory editor and workspace.
- `workspace.test.ts` — persistence and the catalogue reducers.
- `webmcp-schemas.test.ts` — the zod schemas accept valid payloads and reject malformed ones.
- `model-tools-state.test.ts` — the registration aggregate.
- `app.test.tsx` — renders the real `App` against seeded `localStorage`.

The app tests query by `getByRole` and `getByLabelText`. shadcn's Select is a Base UI combobox, not a native `<select>`: click the trigger, then query `role="option"`.

## Style

Formatting is oxfmt's job — do not hand-align anything. Naming, structure, and comment conventions follow the surrounding code:

- `function` declarations, not arrow consts, for top-level functions and components.
- Comments explain why, not what. The engine's comments about currency algebra and percent ratios are the model to follow.
- `any` is acceptable in one place: `src/notebook/blocknote-port.ts`, where BlockNote's editor meets the port. Block components type their props structurally and pass the editor as `unknown`. The rule stays a warning so a new `any` stands out.

## Registry note

The public npm registry is blocked on the primary development machine; installs go through an Artifactory proxy that lags by about one version. If a dependency fails to resolve, pick the newest version the mirror carries rather than switching registries.
