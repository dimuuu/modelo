import type { ModeloBlock, ModeloDocument } from "../model";

/**
 * The block vocabulary and the document walk, in one place.
 *
 * Every other engine module asks this one "is this block an input?", "is it
 * prose?", "what text does it hold?". A new block type is added here and
 * nowhere else in the engine.
 */

export const INPUT_BLOCK_TYPES = [
  "number",
  "slider",
  "select",
  "boolean",
] as const;
export type InputBlockType = (typeof INPUT_BLOCK_TYPES)[number];

export const FORMULA_BLOCK_TYPE = "formula";
export type VariableBlockType = InputBlockType | typeof FORMULA_BLOCK_TYPE;

export const PROSE_BLOCK_TYPES = [
  "heading",
  "paragraph",
  "bulletListItem",
  "numberedListItem",
  "checkListItem",
] as const;
export type ProseBlockType = (typeof PROSE_BLOCK_TYPES)[number];

const inputTypes = new Set<string>(INPUT_BLOCK_TYPES);
const proseTypes = new Set<string>(PROSE_BLOCK_TYPES);

export function isInputBlockType(type: string): boolean {
  return inputTypes.has(type);
}

export function isFormulaBlockType(type: string): boolean {
  return type === FORMULA_BLOCK_TYPE;
}

export function isVariableBlockType(type: string): boolean {
  return isInputBlockType(type) || isFormulaBlockType(type);
}

export function isProseBlockType(type: string): boolean {
  return proseTypes.has(type);
}

/** The narrowed input kind a block type names, if it is an input. */
export function inputTypeOf(type: string): InputBlockType | undefined {
  return inputTypes.has(type) ? (type as InputBlockType) : undefined;
}

/** Depth-first visit of every block, parents before children. */
export function walkBlocks(
  document: ModeloDocument,
  visit: (block: ModeloBlock, parent: ModeloBlock | undefined) => void,
  parent?: ModeloBlock
): void {
  for (const block of document) {
    visit(block, parent);
    if (Array.isArray(block.children)) {
      walkBlocks(block.children as ModeloDocument, visit, block);
    }
  }
}

/**
 * Immutable map over every block. Children are mapped before the block that
 * holds them, so `fn` sees an already-transformed subtree.
 */
export function mapBlocks(
  document: ModeloDocument,
  fn: (block: ModeloBlock) => ModeloBlock
): ModeloDocument {
  return document.map((block) => {
    const withChildren = Array.isArray(block.children)
      ? { ...block, children: mapBlocks(block.children as ModeloDocument, fn) }
      : block;
    return fn(withChildren as ModeloBlock);
  });
}

export function findBlock(
  document: ModeloDocument,
  id: string
): ModeloBlock | undefined {
  let found: ModeloBlock | undefined;
  walkBlocks(document, (block) => {
    if (!found && block.id === id) {
      found = block;
    }
  });
  return found;
}

interface InlineNode {
  type?: unknown;
  text?: unknown;
  name?: unknown;
  varId?: unknown;
  props?: { name?: unknown; varId?: unknown };
  content?: unknown;
}

/** True for both inline reference dialects: editor `variableRef` and portable `ref`. */
export function isInlineRef(node: unknown): boolean {
  if (!node || typeof node !== "object") {
    return false;
  }
  const { type } = node as InlineNode;
  return type === "variableRef" || type === "ref";
}

export function inlineRefVarId(node: unknown): string | undefined {
  const ref = node as InlineNode;
  const varId = ref.props?.varId ?? ref.varId;
  return typeof varId === "string" ? varId : undefined;
}

/** The variable name a reference displays. Kept in step with the variable by `renameVariable`. */
export function inlineRefName(node: unknown): string | undefined {
  const ref = node as InlineNode;
  const name = ref.props?.name ?? ref.name;
  return typeof name === "string" ? name : undefined;
}

/** Every inline reference inside one block's own content, not its children. */
export function inlineRefs(block: ModeloBlock): InlineNode[] {
  const refs: InlineNode[] = [];
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) {
        visit(item);
      }
      return;
    }
    if (!value || typeof value !== "object") {
      return;
    }
    if (isInlineRef(value)) {
      refs.push(value as InlineNode);
      return;
    }
    // Links and other wrappers carry their own inline content.
    visit((value as InlineNode).content);
  };
  const source = block as Record<string, unknown>;
  visit(source.content);
  visit(source.inline);
  return refs;
}

/** The plain text of a block's inline content. A reference reads as `@name`. */
export function blockText(block: ModeloBlock): string {
  const source = block as Record<string, unknown>;
  const content = source.content ?? source.inline;
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }
  const render = (node: unknown): string => {
    if (typeof node === "string") {
      return node;
    }
    if (!node || typeof node !== "object") {
      return "";
    }
    const inline = node as InlineNode;
    if (isInlineRef(inline)) {
      return `@${inlineRefName(inline) || inlineRefVarId(inline) || ""}`;
    }
    if (typeof inline.text === "string") {
      return inline.text;
    }
    if (Array.isArray(inline.content)) {
      return inline.content.map(render).join("");
    }
    return "";
  };
  return content.map(render).join("");
}

/** The empty paragraph BlockNote leaves behind: no text, no references. */
export function isBlankParagraph(block: ModeloBlock): boolean {
  return (
    block.type === "paragraph" &&
    blockText(block) === "" &&
    inlineRefs(block).length === 0
  );
}
