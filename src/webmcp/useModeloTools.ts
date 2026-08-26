import { useWebMCP, type WebMCPState } from "use-webmcp-tool";

import type {
  ModeloToolFailure,
  ModeloToolsAdapter,
  NotebookInsertBlocksArgs,
  NotebookInsertInlineRefArgs,
  NotebookRemoveBlocksArgs,
  NotebookReplaceParagraphArgs,
  NotebookSetVariableArgs,
  NotebookUpdateBlockArgs,
  NotebookWriteSectionArgs,
  WorkspaceCreateArgs,
  WorkspaceDeleteArgs,
  WorkspaceDuplicateArgs,
  WorkspaceOpenArgs,
  WorkspaceRenameArgs,
} from "./types";

const emptySchema = {
  type: "object",
  properties: {},
  additionalProperties: false,
} as const;

const idSchema = {
  type: "object",
  properties: {
    id: { type: "string", minLength: 1, description: "Workspace notebook id." },
  },
  required: ["id"],
  additionalProperties: false,
} as const;

const createSchema = {
  type: "object",
  properties: {
    name: { type: "string", minLength: 1, description: "Name for the new notebook." },
  },
  required: ["name"],
  additionalProperties: false,
} as const;

const duplicateSchema = {
  type: "object",
  properties: {
    id: { type: "string", minLength: 1, description: "Notebook id to duplicate." },
    name: { type: "string", minLength: 1, description: "Optional name for the copy." },
  },
  required: ["id"],
  additionalProperties: false,
} as const;

const renameSchema = {
  type: "object",
  properties: {
    id: { type: "string", minLength: 1, description: "Notebook id to rename." },
    name: { type: "string", minLength: 1, description: "New notebook name." },
  },
  required: ["id", "name"],
  additionalProperties: false,
} as const;

const nameProperty = { type: "string", pattern: "^[A-Za-z_][A-Za-z0-9_]*$", description: "Unique MathJS-safe variable name." } as const;
const decimalsProperty = { type: "integer", minimum: 0, maximum: 8, description: "Fixed display decimals (0-8). If omitted, currency uses 0 for integers and 2 otherwise." } as const;
const optionProperty = {
  type: "array",
  items: { type: "object", properties: { label: { type: "string" }, value: { type: "number" } }, required: ["label", "value"], additionalProperties: false },
} as const;
const displayProperties = {
  label: { type: "string", minLength: 1 }, unit: { type: "string", minLength: 1 }, currency: { type: "string", minLength: 1 }, decimals: decimalsProperty,
} as const;
const inputProperties = {
  name: nameProperty, value: { type: "number" }, ...displayProperties,
  min: { type: "number" }, max: { type: "number" }, step: { type: "number" }, options: optionProperty,
} as const;

const insertBlocksSchema = {
  type: "object",
  properties: {
    blocks: {
      type: "array",
      minItems: 1,
      items: { anyOf: [
        { type: "object", properties: { id: { type: "string" }, type: { const: "heading" }, text: { type: "string" }, level: { type: "integer", enum: [1, 2, 3], default: 2 } }, required: ["type", "text"], additionalProperties: false },
        { type: "object", properties: { id: { type: "string" }, type: { const: "paragraph" }, text: { type: "string", description: "Plain text; known @name tokens become live references." } }, required: ["type", "text"], additionalProperties: false },
        { type: "object", properties: { id: { type: "string" }, type: { const: "bullet" }, text: { type: "string" } }, required: ["type", "text"], additionalProperties: false },
        ...(["number", "slider", "select"] as const).map((type) => ({ type: "object" as const, properties: { id: { type: "string" as const }, type: { const: type }, ...inputProperties }, required: ["type", "name", "value"] as const, additionalProperties: false })),
        { type: "object", properties: { id: { type: "string" }, type: { const: "formula" }, name: nameProperty, formula: { type: "string", minLength: 1, pattern: "\\S" }, ...displayProperties }, required: ["type", "name", "formula"], additionalProperties: false },
      ] },
      description: "Typed blocks to insert in document order. Prefer write_section for complete narrative sections.",
    },
    referenceBlockId: { type: "string", minLength: 1, description: "Existing block id used as the insertion anchor. Omit to append." },
    placement: { type: "string", enum: ["before", "after"], description: "Position relative to referenceBlockId; defaults to after." },
  },
  required: ["blocks"],
  additionalProperties: false,
} as const;

const writeSectionSchema = {
  type: "object",
  properties: {
    heading: { type: "string", minLength: 1, description: "Section title." },
    body: { type: "string", minLength: 1, pattern: "\\S", description: "One to three short paragraphs. Newlines start paragraphs; @name inserts a live value." },
    inputs: {
      type: "array",
      description: "Assumptions the reader will change.",
      items: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["number", "slider", "select"] },
          name: { type: "string", pattern: "^[A-Za-z_][A-Za-z0-9_]*$" },
          value: { type: "number" },
          label: { type: "string", minLength: 1 },
          min: { type: "number" },
          max: { type: "number" },
          step: { type: "number" },
          unit: { type: "string", minLength: 1 },
          currency: { type: "string", minLength: 1 },
          decimals: decimalsProperty,
          options: {
            type: "array",
            items: {
              type: "object",
              properties: { label: { type: "string" }, value: { type: "number" } },
              required: ["label", "value"],
              additionalProperties: false,
            },
          },
        },
        required: ["kind", "name", "value"],
        additionalProperties: false,
      },
    },
    formulas: {
      type: "array",
      description: "Named formulas whose result is reused later.",
      items: {
        type: "object",
        properties: {
          name: { type: "string", pattern: "^[A-Za-z_][A-Za-z0-9_]*$" },
          formula: { type: "string", minLength: 1, pattern: "\\S" },
          label: { type: "string", minLength: 1 },
          unit: { type: "string", minLength: 1 },
          currency: { type: "string", minLength: 1 },
          decimals: decimalsProperty,
        },
        required: ["name", "formula"],
        additionalProperties: false,
      },
    },
    referenceBlockId: { type: "string", minLength: 1, description: "Existing block id used as the insertion anchor. Omit to append." },
    placement: { type: "string", enum: ["before", "after"], description: "Position relative to referenceBlockId; defaults to after." },
  },
  required: ["heading", "body"],
  additionalProperties: false,
} as const;

const updateBlockSchema = {
  type: "object",
  properties: {
    id: { type: "string", minLength: 1, description: "Block id to update." },
    patch: {
      type: "object",
      minProperties: 1,
      description: "Partial block fields or props to apply.",
    },
  },
  required: ["id", "patch"],
  additionalProperties: false,
} as const;

const removeBlocksSchema = {
  type: "object",
  properties: {
    ids: {
      type: "array",
      minItems: 1,
      uniqueItems: true,
      items: { type: "string", minLength: 1 },
      description: "Block ids to remove.",
    },
  },
  required: ["ids"],
  additionalProperties: false,
} as const;

const replaceParagraphSchema = {
  type: "object",
  properties: {
    id: { type: "string", minLength: 1, description: "Paragraph block id." },
    text: { type: "string", description: "Replacement plain text." },
  },
  required: ["id", "text"],
  additionalProperties: false,
} as const;

const inlineRefSchema = {
  type: "object",
  properties: {
    blockId: { type: "string", minLength: 1, description: "Paragraph block id." },
    variable: { type: "string", minLength: 1, description: "Variable name to reference." },
    label: { type: "string", minLength: 1, description: "Optional displayed label." },
    offset: {
      type: "integer",
      minimum: 0,
      description: "Optional UTF-16 insertion offset; omit to append.",
    },
  },
  required: ["blockId", "variable"],
  additionalProperties: false,
} as const;

const setVariableSchema = {
  type: "object",
  properties: {
    name: { type: "string", minLength: 1, description: "Variable name." },
    value: {
      type: "number",
      description: "New finite numeric variable value.",
    },
  },
  required: ["name", "value"],
  additionalProperties: false,
} as const;

const readOnly = { readOnlyHint: true } as const;

function withoutStacks(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return "[circular]";
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => withoutStacks(item, seen));
  }

  const clean: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (key.toLowerCase() === "stack") continue;
    clean[key] = withoutStacks(item, seen);
  }
  return clean;
}

function failure(error: unknown): ModeloToolFailure {
  if (error && typeof error === "object") {
    const candidate = error as { code?: unknown; message?: unknown; details?: unknown };
    const result: ModeloToolFailure = {
      ok: false,
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
    };
    if (candidate.details !== undefined) {
      result.error.details = withoutStacks(candidate.details);
    }
    return result;
  }

  return {
    ok: false,
    error: {
      code: "INTERNAL_ERROR",
      message: typeof error === "string" && error.length > 0 ? error : "The operation could not be completed.",
    },
  };
}

async function run(operation: () => unknown | Promise<unknown>): Promise<unknown | ModeloToolFailure> {
  try {
    const result = await operation();
    return result instanceof Error ? failure(result) : result;
  } catch (error) {
    return failure(error);
  }
}

function noNotebook(): ModeloToolFailure {
  return {
    ok: false,
    error: {
      code: "NO_NOTEBOOK_OPEN",
      message: "Open a notebook before using document tools.",
    },
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
    name: "list_notebooks",
    description: "List the notebooks in the Modelo workspace and identify the currently open notebook.",
    inputSchema: emptySchema,
    annotations: readOnly,
    execute: () => run(() => adapter.workspace.list()),
  });
  const workspaceOpen = useWebMCP<WorkspaceOpenArgs>({
    name: "open_notebook",
    description: "Open an existing workspace notebook by id.",
    inputSchema: idSchema,
    execute: (args) => run(() => adapter.workspace.open(args)),
  });
  const workspaceCreate = useWebMCP<WorkspaceCreateArgs>({
    name: "create_notebook",
    description: "Create and open an empty notebook with narrative-first composition guidance.",
    inputSchema: createSchema,
    execute: (args) => run(() => adapter.workspace.create(args)),
  });
  const workspaceDuplicate = useWebMCP<WorkspaceDuplicateArgs>({
    name: "duplicate_notebook",
    description: "Duplicate an existing workspace notebook.",
    inputSchema: duplicateSchema,
    execute: (args) => run(() => adapter.workspace.duplicate(args)),
  });
  const workspaceDelete = useWebMCP<WorkspaceDeleteArgs>({
    name: "delete_notebook",
    description: "Permanently delete a workspace notebook by id.",
    inputSchema: idSchema,
    execute: (args) => run(() => adapter.workspace.delete(args)),
  });
  const workspaceRename = useWebMCP<WorkspaceRenameArgs>({
    name: "rename_notebook",
    description: "Rename a workspace notebook.",
    inputSchema: renameSchema,
    execute: (args) => run(() => adapter.workspace.rename(args)),
  });

  const notebookEnabled = adapter.notebook !== null;
  const callNotebook = (operation: (notebook: NonNullable<ModeloToolsAdapter["notebook"]>) => unknown) =>
    run(() => (adapter.notebook ? operation(adapter.notebook) : noNotebook()));

  const notebookGetDocument = useWebMCP({
    name: "get_document",
    description: "Get ordered blocks and composition, so you can see whether the page reads like a story.",
    inputSchema: emptySchema,
    annotations: readOnly,
    enabled: notebookEnabled,
    execute: () => callNotebook((notebook) => notebook.getDocument()),
  });
  const notebookGetModel = useWebMCP({
    name: "get_model",
    description: "Get variables, formulas, computed values, and evaluation errors from the open notebook.",
    inputSchema: emptySchema,
    annotations: readOnly,
    enabled: notebookEnabled,
    execute: () => callNotebook((notebook) => notebook.getModel()),
  });
  const notebookInsertBlocks = useWebMCP<NotebookInsertBlocksArgs>({
    name: "insert_blocks",
    description: "Low-level block insert for surgery. Prefer write_section when adding new content.",
    inputSchema: insertBlocksSchema,
    enabled: notebookEnabled,
    execute: (args) => callNotebook((notebook) => notebook.insertBlocks(args)),
  });
  const notebookWriteSection = useWebMCP<NotebookWriteSectionArgs>({
    name: "write_section",
    description: "Add a readable section: heading, short prose, and only the inputs the reader will change. Put results in the sentences with @name.",
    inputSchema: writeSectionSchema,
    enabled: notebookEnabled,
    execute: (args) => callNotebook((notebook) => notebook.writeSection(args)),
  });
  const notebookUpdateBlock = useWebMCP<NotebookUpdateBlockArgs>({
    name: "update_block",
    description: "Apply a partial update to one block in the open notebook.",
    inputSchema: updateBlockSchema,
    enabled: notebookEnabled,
    execute: (args) => callNotebook((notebook) => notebook.updateBlock(args)),
  });
  const notebookRemoveBlocks = useWebMCP<NotebookRemoveBlocksArgs>({
    name: "remove_blocks",
    description: "Remove one or more blocks from the open notebook in one operation.",
    inputSchema: removeBlocksSchema,
    enabled: notebookEnabled,
    execute: (args) => callNotebook((notebook) => notebook.removeBlocks(args)),
  });
  const notebookReplaceParagraph = useWebMCP<NotebookReplaceParagraphArgs>({
    name: "replace_paragraph",
    description: "Replace all plain text in a paragraph block while preserving the block id.",
    inputSchema: replaceParagraphSchema,
    enabled: notebookEnabled,
    execute: (args) => callNotebook((notebook) => notebook.replaceParagraph(args)),
  });
  const notebookInsertInlineRef = useWebMCP<NotebookInsertInlineRefArgs>({
    name: "insert_inline_ref",
    description: "Insert an inline reference to a notebook variable into a paragraph.",
    inputSchema: inlineRefSchema,
    enabled: notebookEnabled,
    execute: (args) => callNotebook((notebook) => notebook.insertInlineRef(args)),
  });
  const notebookSetVariable = useWebMCP<NotebookSetVariableArgs>({
    name: "set_variable",
    description: "Set the value of an existing variable in the open notebook.",
    inputSchema: setVariableSchema,
    enabled: notebookEnabled,
    execute: (args) => callNotebook((notebook) => notebook.setVariable(args)),
  });

  const tools: Record<string, WebMCPState> = {
    workspace_list: workspaceList,
    workspace_open: workspaceOpen,
    workspace_create: workspaceCreate,
    workspace_duplicate: workspaceDuplicate,
    workspace_delete: workspaceDelete,
    workspace_rename: workspaceRename,
    notebook_get_document: notebookGetDocument,
    notebook_get_model: notebookGetModel,
    notebook_write_section: notebookWriteSection,
    notebook_insert_blocks: notebookInsertBlocks,
    notebook_update_block: notebookUpdateBlock,
    notebook_remove_blocks: notebookRemoveBlocks,
    notebook_replace_paragraph: notebookReplaceParagraph,
    notebook_insert_inline_ref: notebookInsertInlineRef,
    notebook_set_variable: notebookSetVariable,
  };
  const states = Object.values(tools);

  return {
    supported: states.some((state) => state.supported),
    registered: states
      .filter((_, index) => notebookEnabled || index < 6)
      .every((state) => state.registered),
    errors: states.flatMap((state) => (state.error ? [state.error] : [])),
    tools,
  };
}

export type { ModeloToolsAdapter } from "./types";
