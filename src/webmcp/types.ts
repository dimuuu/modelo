import type {
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
} from "./schemas";

export type {
  NotebookBlock,
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
  NotebookVariableSelector,
  NotebookWriteSectionArgs,
  NotebookWriteSectionsArgs,
  WorkspaceCreateArgs,
  WorkspaceDeleteArgs,
  WorkspaceDuplicateArgs,
  WorkspaceOpenArgs,
  WorkspaceRenameArgs,
} from "./schemas";

export type MaybePromise<T> = T | Promise<T>;

/**
 * A WebMCP tool failure. `useModeloTools` serialises the public fields into the
 * `{ ok: false, error: { code, message, details? } }` contract the agent sees.
 */
export class ModeloToolError extends Error {
  readonly code: string;
  readonly details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ModeloToolError";
    this.code = code;
    this.details = details;
  }
}

export interface ModeloToolsAdapter {
  workspace: {
    list: () => MaybePromise<unknown>;
    open: (args: WorkspaceOpenArgs) => MaybePromise<unknown>;
    create: (args: WorkspaceCreateArgs) => MaybePromise<unknown>;
    duplicate: (args: WorkspaceDuplicateArgs) => MaybePromise<unknown>;
    delete: (args: WorkspaceDeleteArgs) => MaybePromise<unknown>;
    rename: (args: WorkspaceRenameArgs) => MaybePromise<unknown>;
  };
  notebook: null | {
    getDocument: () => MaybePromise<unknown>;
    getModel: (args: NotebookGetModelArgs) => MaybePromise<unknown>;
    findReferences: (args: NotebookFindReferencesArgs) => MaybePromise<unknown>;
    writeSection: (args: NotebookWriteSectionArgs) => MaybePromise<unknown>;
    writeSections: (args: NotebookWriteSectionsArgs) => MaybePromise<unknown>;
    insertBlocks: (args: NotebookInsertBlocksArgs) => MaybePromise<unknown>;
    updateBlock: (args: NotebookUpdateBlockArgs) => MaybePromise<unknown>;
    updateBlocks: (args: NotebookUpdateBlocksArgs) => MaybePromise<unknown>;
    removeBlocks: (args: NotebookRemoveBlocksArgs) => MaybePromise<unknown>;
    removeVariable: (args: NotebookRemoveVariableArgs) => MaybePromise<unknown>;
    replaceParagraph: (
      args: NotebookReplaceParagraphArgs
    ) => MaybePromise<unknown>;
    insertInlineRef: (
      args: NotebookInsertInlineRefArgs
    ) => MaybePromise<unknown>;
    setVariable: (args: NotebookSetVariableArgs) => MaybePromise<unknown>;
    listScenarios: () => MaybePromise<unknown>;
    saveScenario: (args: NotebookSaveScenarioArgs) => MaybePromise<unknown>;
    applyScenario: (args: NotebookScenarioArgs) => MaybePromise<unknown>;
    deleteScenario: (args: NotebookScenarioArgs) => MaybePromise<unknown>;
  };
}

export interface ModeloToolFailure {
  ok: false;
  error: { code: string; message: string; details?: unknown };
}
