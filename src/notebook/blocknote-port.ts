import type { ModeloBlock, ModeloDocument } from "../model";
import type { BlockPatch, EditorPort, Placement } from "./port";

type AnyEditor = any;

export function createBlockNotePort(editor: AnyEditor): EditorPort {
  return {
    get document(): ModeloDocument {
      return editor.document as ModeloDocument;
    },
    getBlock: (id: string) =>
      (editor.getBlock(id) ?? undefined) as ModeloBlock | undefined,
    insertBlocks(
      blocks: ModeloDocument,
      referenceId: string,
      placement: Placement
    ) {
      return editor.insertBlocks(
        blocks,
        referenceId,
        placement
      ) as ModeloDocument;
    },
    removeBlocks(ids: string[]) {
      editor.removeBlocks(ids);
    },
    replaceDocument(blocks: ModeloDocument) {
      const { insertedBlocks } = editor.replaceBlocks(editor.document, blocks);
      return insertedBlocks as ModeloDocument;
    },
    transact: <T>(fn: () => T): T => editor.transact(fn) as T,
    updateBlock(id: string, patch: BlockPatch) {
      editor.updateBlock(id, patch);
    },
  };
}
