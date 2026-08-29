import { z } from "zod";

import seeds from "./data/seeds.json";
import { portableBlockSchema } from "./engine/portable";
import type { PortableBlock } from "./engine/portable";
import { scenarioSchema } from "./engine/scenarios";
import type { Scenario } from "./engine/scenarios";
import { readTitle, setTitleIn, titleBlock } from "./engine/title";

/**
 * The workspace catalogue: which notebooks exist, and how they persist.
 *
 * Every catalogue change is a pure function from one `Workspace` to the next.
 * React state holds the current value and the id of the open notebook, and
 * nothing else.
 */

export const STORAGE_KEY = "modelo.workspace.v1";
export const DEFAULT_CURRENCY = "EUR";
export const DEFAULT_LOCALE = "es-ES";

export const notebookRecordSchema = z.object({
  blocks: z.array(portableBlockSchema),
  description: z.string().optional(),
  id: z.string(),
  scenarios: z.array(scenarioSchema),
  updatedAt: z.string(),
});

export const workspaceSchema = z.object({
  currency: z.string().min(1),
  locale: z.string().min(1),
  notebooks: z.array(notebookRecordSchema),
  version: z.literal(1),
});

export type NotebookRecord = z.infer<typeof notebookRecordSchema>;
export type Workspace = z.infer<typeof workspaceSchema>;

const now = () => new Date().toISOString();
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

export function seededWorkspace(): Workspace {
  return {
    currency: DEFAULT_CURRENCY,
    locale: DEFAULT_LOCALE,
    notebooks: (
      clone(seeds) as Omit<NotebookRecord, "scenarios" | "updatedAt">[]
    ).map((seed) => ({ ...seed, scenarios: [], updatedAt: now() })),
    version: 1,
  };
}

/**
 * Parses a stored or imported workspace document. Returns null when the JSON
 * is unreadable or does not describe a v1 workspace, so the caller can fall
 * back rather than crash on someone else's file.
 */
export function parseWorkspace(source: string | unknown): Workspace | null {
  let value: unknown = source;
  if (typeof source === "string") {
    try {
      value = JSON.parse(source);
    } catch {
      return null;
    }
  }
  const result = workspaceSchema.safeParse(value);
  return result.success ? result.data : null;
}

export function loadWorkspace(
  storage: Pick<Storage, "getItem"> = localStorage
): Workspace {
  const saved = storage.getItem(STORAGE_KEY);
  if (!saved) {
    return seededWorkspace();
  }
  return parseWorkspace(saved) ?? seededWorkspace();
}

export function saveWorkspace(
  workspace: Workspace,
  storage: Pick<Storage, "setItem"> = localStorage
): void {
  storage.setItem(STORAGE_KEY, JSON.stringify(workspace));
}

// --- Catalogue reducers ------------------------------------------------------

/** A notebook's title, which is the text of its first block. */
export function notebookTitle(notebook: NotebookRecord): string {
  return readTitle(notebook.blocks);
}

export function findNotebook(
  workspace: Workspace,
  id: string | null
): NotebookRecord | undefined {
  return workspace.notebooks.find((notebook) => notebook.id === id);
}

function replaceNotebook(
  workspace: Workspace,
  id: string,
  change: (notebook: NotebookRecord) => Partial<NotebookRecord>
): Workspace {
  return {
    ...workspace,
    notebooks: workspace.notebooks.map((notebook) =>
      notebook.id === id
        ? { ...notebook, ...change(notebook), updatedAt: now() }
        : notebook
    ),
  };
}

export function createNotebook(
  workspace: Workspace,
  title: string,
  id: string
): { workspace: Workspace; notebook: NotebookRecord } {
  const notebook: NotebookRecord = {
    blocks: [titleBlock(title)],
    id,
    scenarios: [],
    updatedAt: now(),
  };
  return {
    notebook,
    workspace: { ...workspace, notebooks: [...workspace.notebooks, notebook] },
  };
}

export function deleteNotebook(workspace: Workspace, id: string): Workspace {
  return {
    ...workspace,
    notebooks: workspace.notebooks.filter((notebook) => notebook.id !== id),
  };
}

export function duplicateNotebook(
  workspace: Workspace,
  source: NotebookRecord,
  id: string,
  title?: string
): { workspace: Workspace; notebook: NotebookRecord } {
  const copied = clone(source);
  const notebook: NotebookRecord = {
    ...copied,
    blocks: setTitleIn(copied.blocks, title ?? `${notebookTitle(source)} copy`),
    id,
    updatedAt: now(),
  };
  return {
    notebook,
    workspace: { ...workspace, notebooks: [...workspace.notebooks, notebook] },
  };
}

/** Rewrites the title heading. A blank name leaves the notebook as it was. */
export function renameNotebook(
  workspace: Workspace,
  id: string,
  title: string
): Workspace {
  if (!title.trim()) {
    return workspace;
  }
  return replaceNotebook(workspace, id, (notebook) => ({
    blocks: setTitleIn(notebook.blocks, title),
  }));
}

export function replaceNotebookBlocks(
  workspace: Workspace,
  id: string,
  blocks: PortableBlock[]
): Workspace {
  return replaceNotebook(workspace, id, () => ({ blocks }));
}

export function setNotebookScenarios(
  workspace: Workspace,
  id: string,
  scenarios: Scenario[]
): Workspace {
  return replaceNotebook(workspace, id, () => ({ scenarios }));
}
