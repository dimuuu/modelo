import { BlockNoteView } from "@blocknote/mantine";
import {
  SuggestionMenuController,
  getDefaultReactSlashMenuItems,
  useCreateBlockNote,
} from "@blocknote/react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ModelProvider, modeloSchema } from "./editor";
import type { VariableBlockType } from "./engine/document";
import type { FormatDefaults } from "./engine/format";
import { describeNotebook } from "./engine/notebook";
import { fromEditorBlocks, toEditorBlocks } from "./engine/portable";
import type { PortableBlock } from "./engine/portable";
import { withTitleBlock } from "./engine/title";
import { newVariableProps } from "./engine/variable";
import type { ModeloDocument } from "./model";
import { createBlockNotePort } from "./notebook/blocknote-port";
import { ensureTitleBlock } from "./notebook/mutations";
import type { EditorPort } from "./notebook/port";
import type { NotebookRecord } from "./workspace";

const MODEL_BLOCKS: {
  kind: VariableBlockType;
  title: string;
  subtext: string;
}[] = [
  { kind: "number", subtext: "Named number input", title: "Number" },
  { kind: "slider", subtext: "Named slider input", title: "Slider" },
  { kind: "select", subtext: "Named select input", title: "Select" },
  { kind: "boolean", subtext: "Named boolean input", title: "Toggle" },
  { kind: "formula", subtext: "Computed MathJS expression", title: "Formula" },
];

/**
 * The BlockNote surface for one notebook. `editor.document` is the source of
 * truth; this component mirrors it into state so the evaluated model repaints,
 * and hands the portable form to `onSave` on every change.
 */
export function NotebookEditor({
  notebook,
  defaults,
  onSave,
  expose,
}: {
  notebook: NotebookRecord;
  defaults: FormatDefaults;
  onSave: (blocks: PortableBlock[]) => void;
  expose: (port: EditorPort | null) => void;
}) {
  // BlockNote reads initialContent once, when it creates the editor, and owns
  // the document from then on. The parent keys this component by notebook id,
  // so switching notebooks remounts with fresh content.
  const editor = useCreateBlockNote({
    initialContent: toEditorBlocks(withTitleBlock(notebook.blocks)) as never,
    schema: modeloSchema,
  });
  const port = useMemo(() => createBlockNotePort(editor), [editor]);
  const [document, setDocument] = useState<ModeloDocument>(() => port.document);
  useEffect(() => {
    expose(port);
    return () => expose(null);
  }, [port, expose]);

  const model = useMemo(
    () => describeNotebook(document, defaults).evaluated,
    [document, defaults]
  );

  const slashItems = useCallback(
    (query: string) => {
      const modelItems = MODEL_BLOCKS.map(({ kind, title, subtext }) => ({
        group: "Modelo",
        onItemClick: () => {
          const { block } = editor.getTextCursorPosition();
          port.transact(() =>
            port.updateBlock(block.id, {
              props: newVariableProps(kind),
              type: kind,
            })
          );
        },
        subtext,
        title,
      }));
      const all = [...getDefaultReactSlashMenuItems(editor), ...modelItems];
      const q = query.toLowerCase();
      return Promise.resolve(
        all.filter(
          (item) =>
            item.title.toLowerCase().includes(q) ||
            item.subtext?.toLowerCase().includes(q)
        )
      );
    },
    [editor, port]
  );

  const refItems = useCallback(
    (query: string) =>
      Promise.resolve(
        model.variables
          .filter((variable) =>
            variable.name.toLowerCase().includes(query.toLowerCase())
          )
          .map((variable) => ({
            onItemClick: () =>
              editor.insertInlineContent([
                {
                  props: { name: variable.name, varId: variable.varId },
                  type: "variableRef",
                },
              ] as never),
            subtext: variable.formatted,
            title: variable.name,
          }))
      ),
    [editor, model]
  );

  return (
    <ModelProvider value={model}>
      <div className="mx-auto max-w-[900px] pb-24">
        <BlockNoteView
          editor={editor}
          theme="light"
          slashMenu={false}
          onChange={() => {
            // Typing can delete the title heading; put it back before anyone
            // reads the document.
            ensureTitleBlock(port);
            // A fresh array, so React sees a new document version.
            const next = [...port.document];
            setDocument(next);
            onSave(fromEditorBlocks(next));
          }}
        >
          <SuggestionMenuController
            triggerCharacter="/"
            getItems={slashItems}
          />
          <SuggestionMenuController triggerCharacter="@" getItems={refItems} />
        </BlockNoteView>
      </div>
    </ModelProvider>
  );
}
