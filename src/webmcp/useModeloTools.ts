import { useWebMCP } from "use-webmcp-tool";
import type { WebMCPState } from "use-webmcp-tool";

import { CURRENCIES, UNITS } from "../engine/units";
import type {
  ModeloToolFailure,
  ModeloToolsAdapter,
  NotebookFindReferencesArgs,
  NotebookGetModelArgs,
  NotebookInsertBlocksArgs,
  NotebookInsertInlineRefArgs,
  NotebookRemoveBlocksArgs,
  NotebookRemoveVariableArgs,
  NotebookReplaceParagraphArgs,
  NotebookSaveScenarioArgs,
  NotebookScenarioArgs,
  NotebookSetVariableArgs,
  NotebookUpdateBlockArgs,
  NotebookUpdateBlocksArgs,
  NotebookWriteSectionArgs,
  NotebookWriteSectionsArgs,
  WorkspaceCreateArgs,
  WorkspaceDeleteArgs,
  WorkspaceDuplicateArgs,
  WorkspaceOpenArgs,
  WorkspaceRenameArgs,
} from "./types";

const emptySchema = {
  additionalProperties: false,
  properties: {},
  type: "object",
} as const;

const getModelSchema = {
  additionalProperties: false,
  properties: {
    includeDependencies: {
      description:
        "Include formula and paragraph block ids that use each variable.",
      type: "boolean",
    },
  },
  type: "object",
} as const;

const idSchema = {
  additionalProperties: false,
  properties: {
    id: { description: "Workspace notebook id.", minLength: 1, type: "string" },
  },
  required: ["id"],
  type: "object",
} as const;

const createSchema = {
  additionalProperties: false,
  properties: {
    name: {
      description: "Name for the new notebook.",
      minLength: 1,
      type: "string",
    },
  },
  required: ["name"],
  type: "object",
} as const;

const duplicateSchema = {
  additionalProperties: false,
  properties: {
    id: {
      description: "Notebook id to duplicate.",
      minLength: 1,
      type: "string",
    },
    name: {
      description: "Optional name for the copy.",
      minLength: 1,
      type: "string",
    },
  },
  required: ["id"],
  type: "object",
} as const;

const renameSchema = {
  additionalProperties: false,
  properties: {
    id: { description: "Notebook id to rename.", minLength: 1, type: "string" },
    name: { description: "New notebook name.", minLength: 1, type: "string" },
  },
  required: ["id", "name"],
  type: "object",
} as const;

const nameProperty = {
  pattern: "^[A-Za-z_][A-Za-z0-9_]*$",
  type: "string",
} as const;
const decimalsProperty = { maximum: 8, minimum: 0, type: "integer" } as const;
const optionProperty = {
  items: {
    additionalProperties: false,
    properties: { label: { type: "string" }, value: { type: "number" } },
    required: ["label", "value"],
    type: "object",
  },
  type: "array",
} as const;
const displayProperties = {
  currency: { enum: CURRENCIES, type: "string" },
  decimals: decimalsProperty,
  format: { enum: ["number", "currency", "percent", "unit"], type: "string" },
  label: { minLength: 1, type: "string" },
  unit: { enum: UNITS, type: "string" },
} as const;
const inputProperties = {
  name: nameProperty,
  value: { type: "number" },
  ...displayProperties,
  min: { type: "number" },
  max: { type: "number" },
  step: { type: "number" },
  options: optionProperty,
} as const;

const insertBlocksSchema = {
  additionalProperties: false,
  properties: {
    blocks: {
      items: {
        anyOf: [
          {
            additionalProperties: false,
            properties: {
              id: { type: "string" },
              level: { default: 2, enum: [1, 2, 3], type: "integer" },
              text: { type: "string" },
              type: { const: "heading" },
            },
            required: ["type", "text"],
            type: "object",
          },
          {
            additionalProperties: false,
            properties: {
              id: { type: "string" },
              text: { type: "string" },
              type: { const: "paragraph" },
            },
            required: ["type", "text"],
            type: "object",
          },
          {
            additionalProperties: false,
            properties: {
              id: { type: "string" },
              text: { type: "string" },
              type: { const: "bullet" },
            },
            required: ["type", "text"],
            type: "object",
          },
          ...(["number", "slider", "select", "boolean"] as const).map(
            (type) => ({
              additionalProperties: false,
              properties: {
                id: { type: "string" as const },
                type: { const: type },
                ...inputProperties,
              },
              required: ["type", "name", "value"] as const,
              type: "object" as const,
            })
          ),
          {
            additionalProperties: false,
            properties: {
              formula: { minLength: 1, pattern: "\\S", type: "string" },
              id: { type: "string" },
              label: { minLength: 1, type: "string" },
              name: nameProperty,
              type: { const: "formula" },
            },
            required: ["type", "name", "formula"],
            type: "object",
          },
        ],
      },
      minItems: 1,
      type: "array",
    },
    placement: { enum: ["before", "after"], type: "string" },
    referenceBlockId: { minLength: 1, type: "string" },
  },
  required: ["blocks"],
  type: "object",
} as const;

const writeSectionSchema = {
  additionalProperties: false,
  properties: {
    body: {
      description:
        "One to three short paragraphs. Newlines start paragraphs; @name inserts a live value.",
      minLength: 1,
      pattern: "\\S",
      type: "string",
    },
    dry_run: { description: "Preview without writing.", type: "boolean" },
    formulas: {
      description: "Named formulas whose result is reused later.",
      items: {
        additionalProperties: false,
        properties: {
          formula: { minLength: 1, pattern: "\\S", type: "string" },
          label: { minLength: 1, type: "string" },
          name: { pattern: "^[A-Za-z_][A-Za-z0-9_]*$", type: "string" },
        },
        required: ["name", "formula"],
        type: "object",
      },
      type: "array",
    },
    heading: { description: "Section title.", minLength: 1, type: "string" },
    inputs: {
      description: "Assumptions the reader will change.",
      items: {
        additionalProperties: false,
        properties: {
          currency: { enum: CURRENCIES, type: "string" },
          decimals: decimalsProperty,
          format: {
            enum: ["number", "currency", "percent", "unit"],
            type: "string",
          },
          kind: {
            enum: ["number", "slider", "select", "boolean"],
            type: "string",
          },
          label: { minLength: 1, type: "string" },
          max: { type: "number" },
          min: { type: "number" },
          name: { pattern: "^[A-Za-z_][A-Za-z0-9_]*$", type: "string" },
          options: {
            items: {
              additionalProperties: false,
              properties: {
                label: { type: "string" },
                value: { type: "number" },
              },
              required: ["label", "value"],
              type: "object",
            },
            type: "array",
          },
          step: { type: "number" },
          unit: { enum: UNITS, type: "string" },
          value: { type: "number" },
        },
        required: ["kind", "name", "value"],
        type: "object",
      },
      type: "array",
    },
    placement: {
      description: "Position relative to referenceBlockId; defaults to after.",
      enum: ["before", "after"],
      type: "string",
    },
    referenceBlockId: {
      description:
        "Existing block id used as the insertion anchor. Omit to append.",
      minLength: 1,
      type: "string",
    },
  },
  required: ["heading", "body"],
  type: "object",
} as const;

const { dry_run: _sectionDryRun, ...writeSectionItemProperties } =
  writeSectionSchema.properties;

const writeSectionsSchema = {
  additionalProperties: false,
  properties: {
    dry_run: { description: "Preview without writing.", type: "boolean" },
    sections: {
      items: { ...writeSectionSchema, properties: writeSectionItemProperties },
      minItems: 1,
      type: "array",
    },
  },
  required: ["sections"],
  type: "object",
} as const;

const updateId = { minLength: 1, type: "string" } as const;
const namedValueProperties = {
  id: updateId,
  label: inputProperties.label,
  name: inputProperties.name,
  value: inputProperties.value,
} as const;
const numericUpdateProperties = {
  ...namedValueProperties,
  currency: inputProperties.currency,
  decimals: inputProperties.decimals,
  format: inputProperties.format,
  max: inputProperties.max,
  min: inputProperties.min,
  step: inputProperties.step,
  unit: inputProperties.unit,
} as const;
const updateBlockSchema = {
  anyOf: [
    {
      additionalProperties: false,
      properties: {
        formula: { minLength: 1, pattern: "\\S", type: "string" },
        id: updateId,
      },
      required: ["id", "formula"],
      type: "object",
    },
    {
      additionalProperties: false,
      properties: {
        id: updateId,
        level: { enum: [1, 2, 3], type: "integer" },
        text: { type: "string" },
      },
      required: ["id", "text"],
      type: "object",
    },
    {
      additionalProperties: false,
      properties: { id: updateId, level: { enum: [1, 2, 3], type: "integer" } },
      required: ["id", "level"],
      type: "object",
    },
    {
      additionalProperties: false,
      minProperties: 2,
      properties: numericUpdateProperties,
      required: ["id"],
      type: "object",
    },
    {
      additionalProperties: false,
      minProperties: 2,
      properties: { ...namedValueProperties, options: inputProperties.options },
      required: ["id"],
      type: "object",
    },
    {
      additionalProperties: false,
      minProperties: 2,
      properties: namedValueProperties,
      required: ["id"],
      type: "object",
    },
  ],
} as const;

const updateBlocksSchema = {
  additionalProperties: false,
  properties: {
    blocks: { items: updateBlockSchema, minItems: 1, type: "array" },
  },
  required: ["blocks"],
  type: "object",
} as const;

const variableSelectorProperties = {
  name: { pattern: "^[A-Za-z_][A-Za-z0-9_]*$", type: "string" },
  varId: { minLength: 1, type: "string" },
} as const;
const variableSelectorSchema = {
  additionalProperties: false,
  oneOf: [{ required: ["name"] }, { required: ["varId"] }],
  properties: variableSelectorProperties,
  type: "object",
} as const;
const removeVariableSchema = {
  additionalProperties: false,
  oneOf: [{ required: ["name"] }, { required: ["varId"] }],
  properties: { ...variableSelectorProperties, force: { type: "boolean" } },
  type: "object",
} as const;

const removeBlocksSchema = {
  additionalProperties: false,
  properties: {
    ids: {
      description: "Block ids to remove.",
      items: { minLength: 1, type: "string" },
      minItems: 1,
      type: "array",
      uniqueItems: true,
    },
  },
  required: ["ids"],
  type: "object",
} as const;

const replaceParagraphSchema = {
  additionalProperties: false,
  properties: {
    id: { description: "Paragraph block id.", minLength: 1, type: "string" },
    text: { description: "Replacement plain text.", type: "string" },
  },
  required: ["id", "text"],
  type: "object",
} as const;

const inlineRefSchema = {
  additionalProperties: false,
  properties: {
    blockId: {
      description: "Paragraph block id.",
      minLength: 1,
      type: "string",
    },
    label: {
      description: "Optional displayed label.",
      minLength: 1,
      type: "string",
    },
    offset: {
      description: "Optional UTF-16 insertion offset; omit to append.",
      minimum: 0,
      type: "integer",
    },
    variable: {
      description: "Variable name to reference.",
      minLength: 1,
      type: "string",
    },
  },
  required: ["blockId", "variable"],
  type: "object",
} as const;

const setVariableSchema = {
  additionalProperties: false,
  properties: {
    name: { description: "Variable name.", minLength: 1, type: "string" },
    value: {
      description: "New finite numeric variable value.",
      type: "number",
    },
  },
  required: ["name", "value"],
  type: "object",
} as const;

const scenarioNameSchema = {
  additionalProperties: false,
  properties: {
    name: { description: "Scenario name.", minLength: 1, type: "string" },
  },
  required: ["name"],
  type: "object",
} as const;

const saveScenarioSchema = {
  additionalProperties: false,
  properties: {
    name: { description: "Scenario name.", minLength: 1, type: "string" },
    values: {
      additionalProperties: { type: "number" },
      description: "Optional values keyed by input name.",
      type: "object",
    },
  },
  required: ["name"],
  type: "object",
} as const;

const readOnly = { readOnlyHint: true } as const;

function withoutStacks(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (seen.has(value)) {
    return "[circular]";
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => withoutStacks(item, seen));
  }

  const clean: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (key.toLowerCase() === "stack") {
      continue;
    }
    clean[key] = withoutStacks(item, seen);
  }
  return clean;
}

function failure(error: unknown): ModeloToolFailure {
  if (error && typeof error === "object") {
    const candidate = error as {
      code?: unknown;
      message?: unknown;
      details?: unknown;
    };
    const result: ModeloToolFailure = {
      error: {
        code:
          typeof candidate.code === "string" && candidate.code.length > 0
            ? candidate.code
            : "INTERNAL_ERROR",
        message:
          typeof candidate.message === "string" && candidate.message.length > 0
            ? candidate.message
            : "The operation could not be completed.",
      },
      ok: false,
    };
    if (candidate.details !== undefined) {
      result.error.details = withoutStacks(candidate.details);
    }
    return result;
  }

  return {
    error: {
      code: "INTERNAL_ERROR",
      message:
        typeof error === "string" && error.length > 0
          ? error
          : "The operation could not be completed.",
    },
    ok: false,
  };
}

async function run(
  operation: () => unknown | Promise<unknown>
): Promise<unknown | ModeloToolFailure> {
  try {
    const result = await operation();
    return result instanceof Error ? failure(result) : result;
  } catch (error) {
    return failure(error);
  }
}

function noNotebook(): ModeloToolFailure {
  return {
    error: {
      code: "NO_NOTEBOOK_OPEN",
      message: "Open a notebook before using document tools.",
    },
    ok: false,
  };
}

export interface ModeloToolsState {
  supported: boolean;
  registered: boolean;
  errors: Error[];
  tools: Record<string, WebMCPState>;
}

/** Registers Modelo's workspace tools and the tools for the currently open notebook. */
export function useModeloTools(adapter: ModeloToolsAdapter): ModeloToolsState {
  const workspaceList = useWebMCP({
    annotations: readOnly,
    description:
      "List the notebooks in the Modelo workspace and identify the currently open notebook.",
    execute: () => run(() => adapter.workspace.list()),
    inputSchema: emptySchema,
    name: "list_notebooks",
  });
  const workspaceOpen = useWebMCP<WorkspaceOpenArgs>({
    description: "Open an existing workspace notebook by id.",
    execute: (args) => run(() => adapter.workspace.open(args)),
    inputSchema: idSchema,
    name: "open_notebook",
  });
  const workspaceCreate = useWebMCP<WorkspaceCreateArgs>({
    description:
      "Create and open an empty notebook with narrative-first composition guidance.",
    execute: (args) => run(() => adapter.workspace.create(args)),
    inputSchema: createSchema,
    name: "create_notebook",
  });
  const workspaceDuplicate = useWebMCP<WorkspaceDuplicateArgs>({
    description: "Duplicate an existing workspace notebook.",
    execute: (args) => run(() => adapter.workspace.duplicate(args)),
    inputSchema: duplicateSchema,
    name: "duplicate_notebook",
  });
  const workspaceDelete = useWebMCP<WorkspaceDeleteArgs>({
    description: "Permanently delete a workspace notebook by id.",
    execute: (args) => run(() => adapter.workspace.delete(args)),
    inputSchema: idSchema,
    name: "delete_notebook",
  });
  const workspaceRename = useWebMCP<WorkspaceRenameArgs>({
    description: "Rename a workspace notebook.",
    execute: (args) => run(() => adapter.workspace.rename(args)),
    inputSchema: renameSchema,
    name: "rename_notebook",
  });

  const notebookEnabled = adapter.notebook !== null;
  const callNotebook = (
    operation: (
      notebook: NonNullable<ModeloToolsAdapter["notebook"]>
    ) => unknown
  ) =>
    run(() => (adapter.notebook ? operation(adapter.notebook) : noNotebook()));

  const notebookGetDocument = useWebMCP({
    annotations: readOnly,
    description:
      "Get ordered blocks and composition, so you can see whether the page reads like a story.",
    enabled: notebookEnabled,
    execute: () => callNotebook((notebook) => notebook.getDocument()),
    inputSchema: emptySchema,
    name: "get_document",
  });
  const notebookGetModel = useWebMCP<NotebookGetModelArgs>({
    annotations: readOnly,
    description:
      "Get slim variables, formulas, computed values, and evaluation errors from the open notebook.",
    enabled: notebookEnabled,
    execute: (args) => callNotebook((notebook) => notebook.getModel(args)),
    inputSchema: getModelSchema,
    name: "get_model",
  });
  const notebookFindReferences = useWebMCP<NotebookFindReferencesArgs>({
    annotations: readOnly,
    description:
      "Find formula and paragraph block ids that reference one variable by name or stable varId.",
    enabled: notebookEnabled,
    execute: (args) =>
      callNotebook((notebook) => notebook.findReferences(args)),
    inputSchema: variableSelectorSchema,
    name: "find_references",
  });
  const notebookInsertBlocks = useWebMCP<NotebookInsertBlocksArgs>({
    description:
      "Low-level block insert for surgery. Prefer write_section when adding new content.",
    enabled: notebookEnabled,
    execute: (args) => callNotebook((notebook) => notebook.insertBlocks(args)),
    inputSchema: insertBlocksSchema,
    name: "insert_blocks",
  });
  const notebookWriteSection = useWebMCP<NotebookWriteSectionArgs>({
    description:
      "Add one prose-first section. Use format number for counts/loan terms; unit year means a duration. Supports dry_run.",
    enabled: notebookEnabled,
    execute: (args) => callNotebook((notebook) => notebook.writeSection(args)),
    inputSchema: writeSectionSchema,
    name: "write_section",
  });
  const notebookWriteSections = useWebMCP<NotebookWriteSectionsArgs>({
    description:
      "Add sections atomically, or preview with dry_run. Examples: 1 + mortgage_rate; price * (1 + tax_rate); principal * rate / 12; 5 km + 500 m. Percent inputs are formula ratios. Use number for counts/loan terms; unit year is a duration.",
    enabled: notebookEnabled,
    execute: (args) => callNotebook((notebook) => notebook.writeSections(args)),
    inputSchema: writeSectionsSchema,
    name: "write_sections",
  });
  const notebookUpdateBlock = useWebMCP<NotebookUpdateBlockArgs>({
    description: "Apply a partial update to one block in the open notebook.",
    enabled: notebookEnabled,
    execute: (args) => callNotebook((notebook) => notebook.updateBlock(args)),
    inputSchema: updateBlockSchema,
    name: "update_block",
  });
  const notebookUpdateBlocks = useWebMCP<NotebookUpdateBlocksArgs>({
    description: "Update multiple blocks atomically.",
    enabled: notebookEnabled,
    execute: (args) => callNotebook((notebook) => notebook.updateBlocks(args)),
    inputSchema: updateBlocksSchema,
    name: "update_blocks",
  });
  const notebookRemoveBlocks = useWebMCP<NotebookRemoveBlocksArgs>({
    description:
      "Remove one or more blocks from the open notebook in one operation.",
    enabled: notebookEnabled,
    execute: (args) => callNotebook((notebook) => notebook.removeBlocks(args)),
    inputSchema: removeBlocksSchema,
    name: "remove_blocks",
  });
  const notebookRemoveVariable = useWebMCP<NotebookRemoveVariableArgs>({
    description:
      "Remove an input variable. Refuses referenced variables unless force is true; never rewrites formulas or prose.",
    enabled: notebookEnabled,
    execute: (args) =>
      callNotebook((notebook) => notebook.removeVariable(args)),
    inputSchema: removeVariableSchema,
    name: "remove_variable",
  });
  const notebookReplaceParagraph = useWebMCP<NotebookReplaceParagraphArgs>({
    description:
      "Replace all plain text in a paragraph block while preserving the block id.",
    enabled: notebookEnabled,
    execute: (args) =>
      callNotebook((notebook) => notebook.replaceParagraph(args)),
    inputSchema: replaceParagraphSchema,
    name: "replace_paragraph",
  });
  const notebookInsertInlineRef = useWebMCP<NotebookInsertInlineRefArgs>({
    description:
      "Insert an inline reference to a notebook variable into a paragraph.",
    enabled: notebookEnabled,
    execute: (args) =>
      callNotebook((notebook) => notebook.insertInlineRef(args)),
    inputSchema: inlineRefSchema,
    name: "insert_inline_ref",
  });
  const notebookSetVariable = useWebMCP<NotebookSetVariableArgs>({
    description: "Set the value of an existing variable in the open notebook.",
    enabled: notebookEnabled,
    execute: (args) => callNotebook((notebook) => notebook.setVariable(args)),
    inputSchema: setVariableSchema,
    name: "set_variable",
  });
  const notebookListScenarios = useWebMCP({
    annotations: readOnly,
    description: "List saved input scenarios and the active one.",
    enabled: notebookEnabled,
    execute: () => callNotebook((notebook) => notebook.listScenarios()),
    inputSchema: emptySchema,
    name: "list_scenarios",
  });
  const notebookSaveScenario = useWebMCP<NotebookSaveScenarioArgs>({
    description: "Save or overwrite a named input scenario.",
    enabled: notebookEnabled,
    execute: (args) => callNotebook((notebook) => notebook.saveScenario(args)),
    inputSchema: saveScenarioSchema,
    name: "save_scenario",
  });
  const notebookApplyScenario = useWebMCP<NotebookScenarioArgs>({
    description: "Apply a named input scenario.",
    enabled: notebookEnabled,
    execute: (args) => callNotebook((notebook) => notebook.applyScenario(args)),
    inputSchema: scenarioNameSchema,
    name: "apply_scenario",
  });
  const notebookDeleteScenario = useWebMCP<NotebookScenarioArgs>({
    description: "Delete a named input scenario.",
    enabled: notebookEnabled,
    execute: (args) =>
      callNotebook((notebook) => notebook.deleteScenario(args)),
    inputSchema: scenarioNameSchema,
    name: "delete_scenario",
  });

  const tools: Record<string, WebMCPState> = {
    notebook_apply_scenario: notebookApplyScenario,
    notebook_delete_scenario: notebookDeleteScenario,
    notebook_find_references: notebookFindReferences,
    notebook_get_document: notebookGetDocument,
    notebook_get_model: notebookGetModel,
    notebook_insert_blocks: notebookInsertBlocks,
    notebook_insert_inline_ref: notebookInsertInlineRef,
    notebook_list_scenarios: notebookListScenarios,
    notebook_remove_blocks: notebookRemoveBlocks,
    notebook_remove_variable: notebookRemoveVariable,
    notebook_replace_paragraph: notebookReplaceParagraph,
    notebook_save_scenario: notebookSaveScenario,
    notebook_set_variable: notebookSetVariable,
    notebook_update_block: notebookUpdateBlock,
    notebook_update_blocks: notebookUpdateBlocks,
    notebook_write_section: notebookWriteSection,
    notebook_write_sections: notebookWriteSections,
    workspace_create: workspaceCreate,
    workspace_delete: workspaceDelete,
    workspace_duplicate: workspaceDuplicate,
    workspace_list: workspaceList,
    workspace_open: workspaceOpen,
    workspace_rename: workspaceRename,
  };
  const states = Object.values(tools);

  return {
    errors: states.flatMap((state) => (state.error ? [state.error] : [])),
    registered: states
      .filter((_, index) => notebookEnabled || index < 6)
      .every((state) => state.registered),
    supported: states.some((state) => state.supported),
    tools,
  };
}

export type { ModeloToolsAdapter } from "./types";
