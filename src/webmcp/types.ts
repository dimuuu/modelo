export type MaybePromise<T> = T | Promise<T>;

export interface WorkspaceOpenArgs {
  id: string;
}

export interface WorkspaceCreateArgs {
  name: string;
}

export interface WorkspaceDuplicateArgs {
  id: string;
  name?: string;
}

export interface WorkspaceDeleteArgs {
  id: string;
}

export interface WorkspaceRenameArgs {
  id: string;
  name: string;
}

interface PortableBase { id?: string }
export type NotebookBlock =
  | (PortableBase & { type: "heading"; text: string; level?: 1 | 2 | 3 })
  | (PortableBase & { type: "paragraph" | "bullet"; text: string })
  | (PortableBase & { type: "number" | "slider" | "select" | "boolean"; name: string; value: number; label?: string; format?: "number" | "currency" | "percent" | "unit"; min?: number; max?: number; step?: number; unit?: string; currency?: string; decimals?: number; options?: Array<{ label: string; value: number }> })
  | (PortableBase & { type: "formula"; name: string; formula: string; label?: string });

export interface NotebookInsertBlocksArgs {
  blocks: NotebookBlock[];
  referenceBlockId?: string;
  placement?: "before" | "after";
}

export interface NotebookWriteSectionArgs {
  heading: string;
  body: string;
  inputs?: Array<{
    kind: "number" | "slider" | "select" | "boolean";
    name: string;
    value: number;
    label?: string;
    min?: number;
    max?: number;
    step?: number;
    format?: "number" | "currency" | "percent" | "unit";
    unit?: string;
    currency?: string;
    options?: Array<{ label: string; value: number }>;
    decimals?: number;
  }>;
  formulas?: Array<{ name: string; formula: string; label?: string }>;
  referenceBlockId?: string;
  placement?: "before" | "after";
}

export interface NotebookUpdateBlockArgs {
  id: string;
  patch: Record<string, unknown>;
}

export interface NotebookRemoveBlocksArgs {
  ids: string[];
}

export interface NotebookReplaceParagraphArgs {
  id: string;
  text: string;
}

export interface NotebookInsertInlineRefArgs {
  blockId: string;
  variable: string;
  /** Optional display label; the variable name is used when omitted. */
  label?: string;
  /** Optional UTF-16 text offset at which to insert the reference. */
  offset?: number;
}

export interface NotebookSetVariableArgs {
  name: string;
  value: number;
}

/**
 * The application-facing boundary used by the WebMCP hook. `notebook` should
 * be null while the workspace screen is shown; that automatically removes all
 * document-scoped tools from the browser's model context.
 */
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
    getModel: () => MaybePromise<unknown>;
    writeSection: (args: NotebookWriteSectionArgs) => MaybePromise<unknown>;
    insertBlocks: (args: NotebookInsertBlocksArgs) => MaybePromise<unknown>;
    updateBlock: (args: NotebookUpdateBlockArgs) => MaybePromise<unknown>;
    removeBlocks: (args: NotebookRemoveBlocksArgs) => MaybePromise<unknown>;
    replaceParagraph: (args: NotebookReplaceParagraphArgs) => MaybePromise<unknown>;
    insertInlineRef: (args: NotebookInsertInlineRefArgs) => MaybePromise<unknown>;
    setVariable: (args: NotebookSetVariableArgs) => MaybePromise<unknown>;
  };
}

export interface ModeloToolFailure {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}
