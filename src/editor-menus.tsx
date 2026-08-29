import { SideMenuExtension } from "@blocknote/core";
import {
  blockTypeSelectItems,
  DragHandleMenu,
  FormattingToolbar,
  getFormattingToolbarItems,
  RemoveBlockItem,
  SideMenu,
  TableColumnHeaderItem,
  TableRowHeaderItem,
  useBlockNoteEditor,
  useDictionary,
  useExtensionState,
} from "@blocknote/react";
import type { BlockTypeSelectItem, SideMenuProps } from "@blocknote/react";

import { modeloSchema, SelectOptions } from "./editor";
import { HEADING_LEVELS } from "./engine/document";

/**
 * The BlockNote menus, with the controls Modelo does not offer taken out.
 *
 * `editor.tsx` removes what the schema can remove. Three things it cannot:
 * every default block carries a text alignment and a colour prop, and nesting
 * is structural, not a block type. Those leave here instead.
 */

/** Toolbar buttons Modelo does not offer, by BlockNote's own key. */
const REMOVED_TOOLBAR_ITEMS = new Set([
  "nestBlockButton",
  "textAlignCenterButton",
  "textAlignLeftButton",
  "textAlignRightButton",
  "unnestBlockButton",
]);

const headingLevels = new Set<number>(HEADING_LEVELS);

/**
 * BlockNote's own block types, minus the ones this schema does not have.
 *
 * The schema decides which types survive, so removing a block spec in
 * `editor.tsx` empties its entry here too. Every heading entry asks for an
 * `isToggleable` prop. The select drops an entry whose props are not in the
 * schema, so leaving that prop in place would hide all headings and leave no
 * way to make one.
 */
export function modeloBlockTypeItems(
  items: BlockTypeSelectItem[]
): BlockTypeSelectItem[] {
  return items.flatMap((item) => {
    const { isToggleable, level, ...rest } = item.props ?? {};
    if (
      isToggleable === true ||
      !Object.hasOwn(modeloSchema.blockSchema, item.type)
    ) {
      return [];
    }
    if (typeof level === "number" && !headingLevels.has(level)) {
      return [];
    }
    const props = { ...rest, ...(level === undefined ? {} : { level }) };
    const kept: BlockTypeSelectItem = {
      icon: item.icon,
      name: item.name,
      type: item.type,
    };
    if (Object.keys(props).length > 0) {
      kept.props = props;
    }
    return [kept];
  });
}

export function modeloToolbarItems(items: BlockTypeSelectItem[]) {
  return getFormattingToolbarItems(modeloBlockTypeItems(items)).filter(
    (item) => !REMOVED_TOOLBAR_ITEMS.has(String(item.key))
  );
}

export function ModeloFormattingToolbar() {
  const dictionary = useDictionary();
  return (
    <FormattingToolbar>
      {modeloToolbarItems(blockTypeSelectItems(dictionary))}
    </FormattingToolbar>
  );
}

/**
 * The drag handle menu without its colour picker.
 *
 * A select block adds its option list here. The menu stays open while the
 * document changes, because BlockNote freezes the side menu for as long as
 * the dropdown is open.
 */
function ModeloDragHandleMenu() {
  const dictionary = useDictionary();
  const editor = useBlockNoteEditor();
  // The block the six dots belong to. The side menu freezes on the same block
  // while this menu is open, so the panel below cannot jump to another one.
  const block = useExtensionState(SideMenuExtension, {
    selector: (state) => state?.block,
  });
  return (
    <DragHandleMenu>
      <RemoveBlockItem>
        {dictionary.drag_handle.delete_menuitem}
      </RemoveBlockItem>
      <TableRowHeaderItem>
        {dictionary.drag_handle.header_row_menuitem}
      </TableRowHeaderItem>
      <TableColumnHeaderItem>
        {dictionary.drag_handle.header_column_menuitem}
      </TableColumnHeaderItem>
      {block?.type === "select" && (
        <>
          <div className="my-1 border-t" />
          <SelectOptions block={block as never} editor={editor} />
        </>
      )}
    </DragHandleMenu>
  );
}

export function ModeloSideMenu(props: SideMenuProps) {
  return <SideMenu {...props} dragHandleMenu={ModeloDragHandleMenu} />;
}
