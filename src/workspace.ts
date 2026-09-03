import { z } from "zod";

import seeds from "./data/seeds.json";
import { portableBlockSchema } from "./engine/portable";
import type { PortableBlock } from "./engine/portable";
import { scenarioSchema } from "./engine/scenarios";
import type { Scenario } from "./engine/scenarios";
import { readTitle, setTitleIn, titleBlock } from "./engine/title";

/** The workspace catalogue: which notebooks exist, and how they persist. */

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

function now(): string {
  return new Date().toISOString();
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function seededWorkspace(): Workspace {
  return {
    currency: DEFAULT_CURRENCY,
    locale: DEFAULT_LOCALE,
    notebooks: (clone(seeds) as Omit<NotebookRecord, "updatedAt">[]).map(
      (seed) => ({ ...seed, updatedAt: now() })
    ),
    version: 1,
  };
}

/**
 * Parses a stored or imported workspace document. Returns null when the JSON is
 * unreadable or does not describe a v1 workspace, so the caller can fall back
 * rather than crash on someone else's file.
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

/**
 * Parses one exported notebook. Returns null when the JSON is unreadable or
 * does not describe a notebook, so an unrelated file becomes a message rather
 * than a crash.
 */
export function parseNotebook(source: string | unknown): NotebookRecord | null {
  let value: unknown = source;
  if (typeof source === "string") {
    try {
      value = JSON.parse(source);
    } catch {
      return null;
    }
  }
  const result = notebookRecordSchema.safeParse(value);
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
    blocks: [titleBlock(title), { inline: [], type: "paragraph" }],
    id,
    scenarios: [],
    updatedAt: now(),
  };
  return {
    notebook,
    workspace: { ...workspace, notebooks: [...workspace.notebooks, notebook] },
  };
}

/** Adds an imported notebook under a fresh id, so it cannot collide. */
export function importNotebook(
  workspace: Workspace,
  record: NotebookRecord,
  id: string
): { workspace: Workspace; notebook: NotebookRecord } {
  const notebook: NotebookRecord = { ...clone(record), id, updatedAt: now() };
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
