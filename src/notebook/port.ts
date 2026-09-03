import { findBlock } from "../engine/document";
import type { ModeloBlock, ModeloDocument } from "../model";

/** The seam between notebook logic and the editor that holds the document. */

export type Placement = "before" | "after";

export interface BlockPatch {
  type?: string;
  props?: Record<string, unknown>;
  content?: unknown;
}

export interface EditorPort {
  readonly document: ModeloDocument;
  getBlock: (id: string) => ModeloBlock | undefined;
  insertBlocks: (
    blocks: ModeloDocument,
    referenceId: string,
    placement: Placement
  ) => ModeloDocument;
  replaceDocument: (blocks: ModeloDocument) => ModeloDocument;
  updateBlock: (id: string, patch: BlockPatch) => void;
  removeBlocks: (ids: string[]) => void;
  transact: <T>(fn: () => T) => T;
}

const defaultMakeId = () => crypto.randomUUID();

function withIds(blocks: ModeloDocument, makeId: () => string): ModeloDocument {
  return blocks.map((block) => ({
    ...block,
    id: block.id || makeId(),
    ...(Array.isArray(block.children)
      ? { children: withIds(block.children as ModeloDocument, makeId) }
      : {}),
  })) as ModeloDocument;
}

function insertAt(
  document: ModeloDocument,
  referenceId: string,
  blocks: ModeloDocument,
  placement: Placement
): ModeloDocument | null {
  const index = document.findIndex((block) => block.id === referenceId);
  if (index !== -1) {
    const at = placement === "before" ? index : index + 1;
    return [...document.slice(0, at), ...blocks, ...document.slice(at)];
  }
  for (const [position, block] of document.entries()) {
    if (!Array.isArray(block.children)) {
      continue;
    }
    const children = insertAt(
      block.children as ModeloDocument,
      referenceId,
      blocks,
      placement
    );
    if (children) {
      const next = [...document];
      next[position] = { ...block, children } as ModeloBlock;
      return next;
    }
  }
  return null;
}

function removeFrom(
  document: ModeloDocument,
  ids: Set<string>
): ModeloDocument {
  return document
    .filter((block) => !ids.has(block.id))
    .map((block) =>
      Array.isArray(block.children)
        ? ({
            ...block,
            children: removeFrom(block.children as ModeloDocument, ids),
          } as ModeloBlock)
        : block
    );
}

function patchIn(
  document: ModeloDocument,
  id: string,
  patch: BlockPatch
): ModeloDocument {
  return document.map((block) => {
    const children = Array.isArray(block.children)
      ? patchIn(block.children as ModeloDocument, id, patch)
      : block.children;
    if (block.id !== id) {
      return children === block.children
        ? block
        : ({ ...block, children } as ModeloBlock);
    }
    return {
      ...block,
      ...(patch.type ? { type: patch.type } : {}),
      ...(patch.props ? { props: { ...block.props, ...patch.props } } : {}),
      ...("content" in patch ? { content: patch.content } : {}),
      ...(children === undefined ? {} : { children }),
    } as ModeloBlock;
  });
}

/**
 * An editor that is only an array. It applies the same operations BlockNote
 * does, immutably, so a session can run against plain data.
 */
export function createMemoryPort(
  initial: ModeloDocument,
  makeId: () => string = defaultMakeId
): EditorPort {
  let document = withIds(initial, makeId);
  return {
    get document() {
      return document;
    },
    getBlock: (id) => findBlock(document, id),
    insertBlocks(blocks, referenceId, placement) {
      const inserted = withIds(blocks, makeId);
      const next = insertAt(document, referenceId, inserted, placement);
      if (!next) {
        throw new Error(`Block '${referenceId}' not found.`);
      }
      document = next;
      return inserted;
    },
    removeBlocks(ids) {
      document = removeFrom(document, new Set(ids));
    },
    replaceDocument(blocks) {
      document = withIds(blocks, makeId);
      return document;
    },
    transact: (fn) => fn(),
    updateBlock(id, patch) {
      document = patchIn(document, id, patch);
    },
  };
}
