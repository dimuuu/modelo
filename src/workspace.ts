import seeds from "./data/seeds.json";
import { inlineContentFromText } from "./engine/section";

export interface Notebook { id: string; title: string; description?: string; blocks: unknown[]; updatedAt: string }
export interface Workspace { version: 1; notebooks: Notebook[]; currency: string; locale: string }
export const STORAGE_KEY = "modelo.workspace.v1";
export const DEFAULT_CURRENCY = "EUR";
export const DEFAULT_LOCALE = "es-ES";

const now = () => new Date().toISOString();
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

export function seededWorkspace(): Workspace {
  return { version: 1, currency: DEFAULT_CURRENCY, locale: DEFAULT_LOCALE, notebooks: clone(seeds).map((seed) => ({ ...seed, updatedAt: now() })) };
}

export function loadWorkspace(storage: Pick<Storage, "getItem"> = localStorage): Workspace {
  const saved = storage.getItem(STORAGE_KEY);
  if (!saved) return seededWorkspace();
  try {
    const parsed = JSON.parse(saved) as Partial<Workspace>;
    if (parsed.version === 1 && Array.isArray(parsed.notebooks)) {
      return { ...parsed, version: 1, notebooks: parsed.notebooks, currency: parsed.currency || DEFAULT_CURRENCY, locale: parsed.locale || DEFAULT_LOCALE };
    }
  } catch { /* fall through to a recoverable fresh workspace */ }
  return seededWorkspace();
}

export function saveWorkspace(workspace: Workspace, storage: Pick<Storage, "setItem"> = localStorage) {
  storage.setItem(STORAGE_KEY, JSON.stringify(workspace));
}

const modelKeys = new Set(["name", "value", "label", "min", "max", "step", "unit", "currency", "options", "formula", "decimals", "format", "locale", "varId"]);

export function portableToEditorBlocks(blocks: any[], idByName: Record<string, string> = {}): any[] {
  return blocks.map((block) => {
    if (["number", "slider", "select", "boolean", "formula"].includes(block.type)) {
      const props = { ...(block.props ?? {}) };
      for (const key of modelKeys) if (block[key] !== undefined && props[key] === undefined) props[key] = block[key];
      if (Array.isArray(props.options)) props.options = JSON.stringify(props.options);
      return { id: block.id, type: block.type, props };
    }
    const type = block.type === "bullet" ? "bulletListItem" : block.type;
    const level = type === "heading" ? Number(block.level ?? 2) : undefined;
    let content: any = block.text ?? "";
    if (Array.isArray(block.inline)) {
      content = block.inline.map((item: any) => typeof item === "string"
        ? { type: "text", text: item, styles: {} }
        : { type: "variableRef", props: { varId: item.varId, label: item.label ?? "" } });
    } else if (type === "paragraph" && typeof block.text === "string") {
      content = inlineContentFromText(block.text, idByName).map((item) => typeof item === "string"
        ? { type: "text", text: item, styles: {} }
        : { type: "variableRef", props: { varId: item.varId, label: item.label } });
    }
    return { id: block.id, type, ...(level ? { props: { level } } : {}), content };
  });
}
