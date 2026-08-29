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

`pnpm check` allows warnings and forbids errors. The warnings that stand today are listed in [DECISIONS.md](./DECISIONS.md).

## How the pieces fit

```
BlockNote document  ──projectDocument──▶  ProjectedModel  ──evaluateModel──▶  EvaluationResult
       ▲                                                                              │
       │                                                                              ▼
  human edits                                                                 ModelProvider
  WebMCP tools                                                          (formula values, @chips)
       │
       └── onChange ──▶ localStorage (modelo.workspace.v1)
```

- `src/engine/` never imports React or BlockNote. It takes plain blocks and returns plain data. That is what makes it testable without a DOM.
- `src/editor.tsx` is the only file that knows the BlockNote schema.
- `src/App.tsx` holds the shell and the WebMCP adapter — the layer that turns tool calls into editor transactions.

## Adding a model block type

A model block is one variable. Five exist: `number`, `slider`, `select`, `boolean`, `formula`.

1. **Schema.** Add a `createReactBlockSpec` in `src/editor.tsx` and register it in `modeloSchema.blockSpecs`. Give the render an `aria-label` — the tests query by it.
2. **Defaults.** Extend `newVariableProps` so the slash menu can insert one.
3. **Projection.** Add the type to `inputTypes` (or `formulaTypes`) in `src/engine/projector.ts`, and to `inputTypeOf` if it needs a narrowed kind.
4. **Scenarios.** Add it to `SCENARIO_INPUT_TYPES` in `src/engine/scenarios.ts` if its value should be captured.
5. **Composition.** Add it to `VARIABLE_TYPES` in `src/engine/composition.ts`.
6. **Persistence.** Add it to the type list in `portableToEditorBlocks` and `slimBlock` so it survives export and import.
7. **Tool schema.** Add it to `src/webmcp/schemas.ts` so agents can create one.

Steps 3 to 6 are easy to forget. A block that projects but is not in `slimBlock` looks fine until export.

## Adding a WebMCP tool

1. Declare the argument shape in `src/webmcp/schemas.ts` and export the inferred type.
2. Add the method to `ModeloToolsAdapter` in `src/webmcp/types.ts`.
3. Implement it in the `adapter` memo in `src/App.tsx`. Read from `currentEditor()`, mutate inside `editor.transact`, and return `ok(mutationResult(before, after, workspace, extra))`.
4. Register it in `src/webmcp/useModeloTools.ts` with `checkedNotebook(schema, ...)` (or `checked` for workspace tools) and `inputSchema: toInputSchema(schema)`.
5. Add it to the tool list in the README.

Use `fault(code, message, details?)` for expected failures. It throws a `ModeloToolError`, which the runner turns into `{ ok: false, error: { code, message, details? } }`. Never let a stack trace reach the agent.

Read-only tools take `annotations: readOnly`.

## Tests

`tests/` uses Vitest with happy-dom.

- `engine.test.ts`, `composition.test.ts`, `scenarios.test.ts`, `get-model.test.ts` — pure functions, no DOM.
- `webmcp-schemas.test.ts` — the zod schemas accept valid payloads and reject malformed ones.
- `editor-config.test.ts` — the block schema and its helpers.
- `app.test.tsx` — renders the real `App` against seeded `localStorage`.

The app tests query by `getByRole` and `getByLabelText`. shadcn's Select is a Base UI combobox, not a native `<select>`: click the trigger, then query `role="option"`.

## Style

Formatting is oxfmt's job — do not hand-align anything. Naming, structure, and comment conventions follow the surrounding code:

- `function` declarations, not arrow consts, for top-level functions and components.
- Comments explain why, not what. The engine's comments about currency algebra and percent ratios are the model to follow.
- `any` is acceptable only where BlockNote's editor API is genuinely untyped. It is a warning so new ones stay visible.

## Registry note

The public npm registry is blocked on the primary development machine; installs go through an Artifactory proxy that lags by about one version. If a dependency fails to resolve, pick the newest version the mirror carries rather than switching registries.
