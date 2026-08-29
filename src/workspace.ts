import { z } from "zod";

import seeds from "./data/seeds.json";
import { scenarioSchema } from "./engine/scenarios";
import { inlineContentFromText } from "./engine/section";

export const STORAGE_KEY = "modelo.workspace.v1";
export const DEFAULT_CURRENCY = "EUR";
export const DEFAULT_LOCALE = "es-ES";

export const notebookSchema = z.object({
  blocks: z.array(z.unknown()),
  description: z.string().optional(),
  id: z.string(),
  scenarios: z.array(scenarioSchema).optional(),
  title: z.string(),
  updatedAt: z.string(),
});

/**
 * The persisted workspace. Display defaults are optional here and filled in by
 * parseWorkspace, so an older v1 snapshot loads without a storage-key
 * migration.
 */
export const workspaceSchema = z.object({
  currency: z.string().min(1).optional(),
  locale: z.string().min(1).optional(),
  notebooks: z.array(notebookSchema),
  version: z.literal(1),
});

export type Notebook = z.infer<typeof notebookSchema>;
export type Workspace = Omit<
  z.infer<typeof workspaceSchema>,
  "currency" | "locale"
> & { currency: string; locale: string };

const now = () => new Date().toISOString();
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

export function seededWorkspace(): Workspace {
  return {
    currency: DEFAULT_CURRENCY,
    locale: DEFAULT_LOCALE,
    notebooks: clone(seeds).map((seed) => ({
      ...seed,
      scenarios: [],
      updatedAt: now(),
    })),
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
  if (!result.success) {
    return null;
  }
  return {
    ...result.data,
    currency: result.data.currency ?? DEFAULT_CURRENCY,
    locale: result.data.locale ?? DEFAULT_LOCALE,
    notebooks: result.data.notebooks.map((notebook) => ({
      ...notebook,
      scenarios: notebook.scenarios ?? [],
    })),
  };
}

export function loadWorkspace(
  storage: Pick<Storage, "getItem"> = localStorage
): Workspace {
  const saved = storage.getItem(STORAGE_KEY);
  if (!saved) {
    return seededWorkspace();
  }
  const parsed = parseWorkspace(saved);
  return parsed ?? seededWorkspace();
}

export function saveWorkspace(
  workspace: Workspace,
  storage: Pick<Storage, "setItem"> = localStorage
) {
  storage.setItem(STORAGE_KEY, JSON.stringify(workspace));
}

const modelKeys = new Set([
  "name",
  "value",
  "label",
  "min",
  "max",
  "step",
  "unit",
  "currency",
  "options",
  "formula",
  "decimals",
  "format",
  "locale",
  "varId",
]);

export function portableToEditorBlocks(
  blocks: any[],
  idByName: Record<string, string> = {}
): any[] {
  return blocks.map((block) => {
    if (
      ["number", "slider", "select", "boolean", "formula"].includes(block.type)
    ) {
      const props = { ...block.props };
      for (const key of modelKeys) {
        if (block[key] !== undefined && props[key] === undefined) {
          props[key] = block[key];
        }
      }
      if (Array.isArray(props.options)) {
        props.options = JSON.stringify(props.options);
      }
      return { id: block.id, props, type: block.type };
    }
    const type = block.type === "bullet" ? "bulletListItem" : block.type;
    const level = type === "heading" ? Number(block.level ?? 2) : undefined;
    let content: any = block.text ?? "";
    if (Array.isArray(block.inline)) {
      content = block.inline.map((item: any) =>
        typeof item === "string"
          ? { styles: {}, text: item, type: "text" }
          : {
              props: { label: item.label ?? "", varId: item.varId },
              type: "variableRef",
            }
      );
    } else if (type === "paragraph" && typeof block.text === "string") {
      content = inlineContentFromText(block.text, idByName).map((item) =>
        typeof item === "string"
          ? { styles: {}, text: item, type: "text" }
          : {
              props: { label: item.label, varId: item.varId },
              type: "variableRef",
            }
      );
    }
    return {
      id: block.id,
      type,
      ...(level ? { props: { level } } : {}),
      content,
    };
  });
}
