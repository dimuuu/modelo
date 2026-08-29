import { useWebMCP } from "use-webmcp-tool";
import type { WebMCPState } from "use-webmcp-tool";
import type { z } from "zod";

import {
  emptySchema,
  getModelSchema,
  insertBlocksSchema,
  insertInlineRefSchema,
  removeBlocksSchema,
  removeVariableSchema,
  replaceParagraphSchema,
  saveScenarioSchema,
  scenarioNameSchema,
  setVariableSchema,
  toInputSchema,
  updateBlockSchema,
  updateBlocksSchema,
  variableSelectorSchema,
  workspaceCreateSchema,
  workspaceDeleteSchema,
  workspaceDuplicateSchema,
  workspaceOpenSchema,
  workspaceRenameSchema,
  writeSectionSchema,
  writeSectionsSchema,
} from "./schemas";
import { ModeloToolError } from "./types";
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

/**
 * Validates raw tool arguments before they reach the adapter. Agents send
 * arbitrary JSON, so the published JSON Schema is advisory: this is the check
 * that actually holds.
 */
function checked<Schema extends z.ZodType>(
  schema: Schema,
  operation: (args: z.infer<Schema>) => unknown | Promise<unknown>
): (args: unknown) => Promise<unknown | ModeloToolFailure> {
  return (args: unknown) =>
    run(() => {
      const parsed = schema.safeParse(args ?? {});
      if (!parsed.success) {
        throw new ModeloToolError(
          "INVALID_ARGUMENTS",
          "The tool arguments did not match the input schema.",
          parsed.error.issues.map((issue) => ({
            message: issue.message,
            path: issue.path.join("."),
          }))
        );
      }
      return operation(parsed.data);
    });
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
    inputSchema: toInputSchema(emptySchema),
    name: "list_notebooks",
  });
  const workspaceOpen = useWebMCP<WorkspaceOpenArgs>({
    description: "Open an existing workspace notebook by id.",
    execute: checked(workspaceOpenSchema, (args) =>
      adapter.workspace.open(args)
    ),
    inputSchema: toInputSchema(workspaceOpenSchema),
    name: "open_notebook",
  });
  const workspaceCreate = useWebMCP<WorkspaceCreateArgs>({
    description:
      "Create and open an empty notebook with narrative-first composition guidance.",
    execute: checked(workspaceCreateSchema, (args) =>
      adapter.workspace.create(args)
    ),
    inputSchema: toInputSchema(workspaceCreateSchema),
    name: "create_notebook",
  });
  const workspaceDuplicate = useWebMCP<WorkspaceDuplicateArgs>({
    description: "Duplicate an existing workspace notebook.",
    execute: checked(workspaceDuplicateSchema, (args) =>
      adapter.workspace.duplicate(args)
    ),
    inputSchema: toInputSchema(workspaceDuplicateSchema),
    name: "duplicate_notebook",
  });
  const workspaceDelete = useWebMCP<WorkspaceDeleteArgs>({
    description: "Permanently delete a workspace notebook by id.",
    execute: checked(workspaceDeleteSchema, (args) =>
      adapter.workspace.delete(args)
    ),
    inputSchema: toInputSchema(workspaceDeleteSchema),
    name: "delete_notebook",
  });
  const workspaceRename = useWebMCP<WorkspaceRenameArgs>({
    description: "Rename a workspace notebook.",
    execute: checked(workspaceRenameSchema, (args) =>
      adapter.workspace.rename(args)
    ),
    inputSchema: toInputSchema(workspaceRenameSchema),
    name: "rename_notebook",
  });

  const notebookEnabled = adapter.notebook !== null;
  const callNotebook = (
    operation: (
      notebook: NonNullable<ModeloToolsAdapter["notebook"]>
    ) => unknown
  ) =>
    run(() => (adapter.notebook ? operation(adapter.notebook) : noNotebook()));

  /** Validates arguments, then dispatches to the open notebook's adapter. */
  const checkedNotebook = <Schema extends z.ZodType>(
    schema: Schema,
    operation: (
      notebook: NonNullable<ModeloToolsAdapter["notebook"]>,
      args: z.infer<Schema>
    ) => unknown
  ) =>
    checked(schema, (args) =>
      adapter.notebook ? operation(adapter.notebook, args) : noNotebook()
    );

  const notebookGetDocument = useWebMCP({
    annotations: readOnly,
    description:
      "Get ordered blocks and composition, so you can see whether the page reads like a story.",
    enabled: notebookEnabled,
    execute: () => callNotebook((notebook) => notebook.getDocument()),
    inputSchema: toInputSchema(emptySchema),
    name: "get_document",
  });
  const notebookGetModel = useWebMCP<NotebookGetModelArgs>({
    annotations: readOnly,
    description:
      "Get slim variables, formulas, computed values, and evaluation errors from the open notebook.",
    enabled: notebookEnabled,
    execute: checkedNotebook(getModelSchema, (notebook, args) =>
      notebook.getModel(args)
    ),
    inputSchema: toInputSchema(getModelSchema),
    name: "get_model",
  });
  const notebookFindReferences = useWebMCP<NotebookFindReferencesArgs>({
    annotations: readOnly,
    description:
      "Find formula and paragraph block ids that reference one variable by name or stable varId.",
    enabled: notebookEnabled,
    execute: checkedNotebook(variableSelectorSchema, (notebook, args) =>
      notebook.findReferences(args)
    ),
    inputSchema: toInputSchema(variableSelectorSchema),
    name: "find_references",
  });
  const notebookInsertBlocks = useWebMCP<NotebookInsertBlocksArgs>({
    description:
      "Low-level block insert for surgery. Prefer write_section when adding new content.",
    enabled: notebookEnabled,
    execute: checkedNotebook(insertBlocksSchema, (notebook, args) =>
      notebook.insertBlocks(args)
    ),
    inputSchema: toInputSchema(insertBlocksSchema),
    name: "insert_blocks",
  });
  const notebookWriteSection = useWebMCP<NotebookWriteSectionArgs>({
    description:
      "Add one prose-first section. Use format number for counts/loan terms; unit year means a duration. Supports dry_run.",
    enabled: notebookEnabled,
    execute: checkedNotebook(writeSectionSchema, (notebook, args) =>
      notebook.writeSection(args)
    ),
    inputSchema: toInputSchema(writeSectionSchema),
    name: "write_section",
  });
  const notebookWriteSections = useWebMCP<NotebookWriteSectionsArgs>({
    description:
      "Add sections atomically, or preview with dry_run. Examples: 1 + mortgage_rate; price * (1 + tax_rate); principal * rate / 12; 5 km + 500 m. Percent inputs are formula ratios. Use number for counts/loan terms; unit year is a duration.",
    enabled: notebookEnabled,
    execute: checkedNotebook(writeSectionsSchema, (notebook, args) =>
      notebook.writeSections(args)
    ),
    inputSchema: toInputSchema(writeSectionsSchema),
    name: "write_sections",
  });
  const notebookUpdateBlock = useWebMCP<NotebookUpdateBlockArgs>({
    description: "Apply a partial update to one block in the open notebook.",
    enabled: notebookEnabled,
    execute: checkedNotebook(updateBlockSchema, (notebook, args) =>
      notebook.updateBlock(args)
    ),
    inputSchema: toInputSchema(updateBlockSchema),
    name: "update_block",
  });
  const notebookUpdateBlocks = useWebMCP<NotebookUpdateBlocksArgs>({
    description: "Update multiple blocks atomically.",
    enabled: notebookEnabled,
    execute: checkedNotebook(updateBlocksSchema, (notebook, args) =>
      notebook.updateBlocks(args)
    ),
    inputSchema: toInputSchema(updateBlocksSchema),
    name: "update_blocks",
  });
  const notebookRemoveBlocks = useWebMCP<NotebookRemoveBlocksArgs>({
    description:
      "Remove one or more blocks from the open notebook in one operation.",
    enabled: notebookEnabled,
    execute: checkedNotebook(removeBlocksSchema, (notebook, args) =>
      notebook.removeBlocks(args)
    ),
    inputSchema: toInputSchema(removeBlocksSchema),
    name: "remove_blocks",
  });
  const notebookRemoveVariable = useWebMCP<NotebookRemoveVariableArgs>({
    description:
      "Remove an input variable. Refuses referenced variables unless force is true; never rewrites formulas or prose.",
    enabled: notebookEnabled,
    execute: checkedNotebook(removeVariableSchema, (notebook, args) =>
      notebook.removeVariable(args)
    ),
    inputSchema: toInputSchema(removeVariableSchema),
    name: "remove_variable",
  });
  const notebookReplaceParagraph = useWebMCP<NotebookReplaceParagraphArgs>({
    description:
      "Replace all plain text in a paragraph block while preserving the block id.",
    enabled: notebookEnabled,
    execute: checkedNotebook(replaceParagraphSchema, (notebook, args) =>
      notebook.replaceParagraph(args)
    ),
    inputSchema: toInputSchema(replaceParagraphSchema),
    name: "replace_paragraph",
  });
  const notebookInsertInlineRef = useWebMCP<NotebookInsertInlineRefArgs>({
    description:
      "Insert an inline reference to a notebook variable into a paragraph.",
    enabled: notebookEnabled,
    execute: checkedNotebook(insertInlineRefSchema, (notebook, args) =>
      notebook.insertInlineRef(args)
    ),
    inputSchema: toInputSchema(insertInlineRefSchema),
    name: "insert_inline_ref",
  });
  const notebookSetVariable = useWebMCP<NotebookSetVariableArgs>({
    description: "Set the value of an existing variable in the open notebook.",
    enabled: notebookEnabled,
    execute: checkedNotebook(setVariableSchema, (notebook, args) =>
      notebook.setVariable(args)
    ),
    inputSchema: toInputSchema(setVariableSchema),
    name: "set_variable",
  });
  const notebookListScenarios = useWebMCP({
    annotations: readOnly,
    description: "List saved input scenarios and the active one.",
    enabled: notebookEnabled,
    execute: () => callNotebook((notebook) => notebook.listScenarios()),
    inputSchema: toInputSchema(emptySchema),
    name: "list_scenarios",
  });
  const notebookSaveScenario = useWebMCP<NotebookSaveScenarioArgs>({
    description: "Save or overwrite a named input scenario.",
    enabled: notebookEnabled,
    execute: checkedNotebook(saveScenarioSchema, (notebook, args) =>
      notebook.saveScenario(args)
    ),
    inputSchema: toInputSchema(saveScenarioSchema),
    name: "save_scenario",
  });
  const notebookApplyScenario = useWebMCP<NotebookScenarioArgs>({
    description: "Apply a named input scenario.",
    enabled: notebookEnabled,
    execute: checkedNotebook(scenarioNameSchema, (notebook, args) =>
      notebook.applyScenario(args)
    ),
    inputSchema: toInputSchema(scenarioNameSchema),
    name: "apply_scenario",
  });
  const notebookDeleteScenario = useWebMCP<NotebookScenarioArgs>({
    description: "Delete a named input scenario.",
    enabled: notebookEnabled,
    execute: checkedNotebook(scenarioNameSchema, (notebook, args) =>
      notebook.deleteScenario(args)
    ),
    inputSchema: toInputSchema(scenarioNameSchema),
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
