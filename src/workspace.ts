import seeds from "./data/seeds.json";

export interface Notebook { id: string; title: string; description?: string; blocks: unknown[]; updatedAt: string }
export interface Workspace { version: 1; notebooks: Notebook[] }
export const STORAGE_KEY = "modelo.workspace.v1";

const now = () => new Date().toISOString();
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

export function seededWorkspace(): Workspace {
  return { version: 1, notebooks: clone(seeds).map((seed) => ({ ...seed, updatedAt: now() })) };
}

export function loadWorkspace(storage: Pick<Storage, "getItem"> = localStorage): Workspace {
  const saved = storage.getItem(STORAGE_KEY);
  if (!saved) return seededWorkspace();
  try {
    const parsed = JSON.parse(saved) as Workspace;
    if (parsed.version === 1 && Array.isArray(parsed.notebooks)) return parsed;
  } catch { /* fall through to a recoverable fresh workspace */ }
  return seededWorkspace();
}

export function saveWorkspace(workspace: Workspace, storage: Pick<Storage, "setItem"> = localStorage) {
  storage.setItem(STORAGE_KEY, JSON.stringify(workspace));
}

export function portableToEditorBlocks(blocks: any[]): any[] {
  return blocks.map((block) => {
    if (["number", "slider", "select", "formula"].includes(block.type)) {
      const props = { ...block.props };
      if (Array.isArray(props.options)) props.options = JSON.stringify(props.options);
      return { id: block.id, type: block.type, props };
    }
    const type = block.type === "bullet" ? "bulletListItem" : block.type;
    const level = type === "heading" ? Number(block.level ?? 1) : undefined;
    let content: any = block.text ?? "";
    if (Array.isArray(block.inline)) {
      content = block.inline.map((item: any) => typeof item === "string"
        ? { type: "text", text: item, styles: {} }
        : { type: "variableRef", props: { varId: item.varId, label: item.label ?? "" } });
    }
    return { id: block.id, type, ...(level ? { props: { level } } : {}), content };
  });
}
