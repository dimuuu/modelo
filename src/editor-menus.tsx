import { SideMenuExtension } from "@blocknote/core";
import { SuggestionMenu } from "@blocknote/core/extensions";
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
  useComponentsContext,
  useDictionary,
  useExtension,
  useExtensionState,
} from "@blocknote/react";
import type { BlockTypeSelectItem, SideMenuProps } from "@blocknote/react";
import { GripVerticalIcon, PlusIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

import { BlockConfig } from "./block-config";
import { modeloSchema } from "./editor";
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
      {block ? <BlockConfig block={block as never} editor={editor} /> : null}
    </DragHandleMenu>
  );
}

/** The one look both side menu buttons share: a small ghost icon button. */
const SIDE_MENU_BUTTON = "text-muted-foreground size-6";

/**
 * The button that adds a block below the one under the cursor.
 *
 * BlockNote's own version paints a Mantine icon button with a react-icons
 * glyph. This one is the app's button with the app's icon set, and it keeps
 * BlockNote's behaviour: an empty block takes the cursor, a filled one gets a
 * new paragraph after it, and either way the slash menu opens.
 */
function ModeloAddBlockButton() {
  const editor = useBlockNoteEditor();
  const dictionary = useDictionary();
  const suggestions = useExtension(SuggestionMenu);
  const block = useExtensionState(SideMenuExtension, {
    selector: (state) => state?.block,
  });
  if (!block) {
    return null;
  }
  const addBlock = () => {
    const empty = Array.isArray(block.content) && block.content.length === 0;
    const target = empty
      ? block
      : editor.insertBlocks([{ type: "paragraph" }], block, "after")[0];
    editor.setTextCursorPosition(target);
    suggestions.openSuggestionMenu("/");
  };
  return (
    <Button
      aria-label={dictionary.side_menu.add_block_label}
      className={SIDE_MENU_BUTTON}
      onClick={addBlock}
      size="icon-sm"
      type="button"
      variant="ghost"
    >
      <PlusIcon className="size-4" />
    </Button>
  );
}

/**
 * The six dots: drag a block, or open its menu.
 *
 * The menu root has to come from BlockNote's own component context, because
 * the drag handle menu renders into it. The trigger inside it is the app's
 * button.
 */
function ModeloDragHandleButton() {
  const components = useComponentsContext();
  const dictionary = useDictionary();
  const sideMenu = useExtension(SideMenuExtension);
  const block = useExtensionState(SideMenuExtension, {
    selector: (state) => state?.block,
  });
  if (!(components && block)) {
    return null;
  }
  const { Menu } = components.Generic;
  return (
    <Menu.Root
      onOpenChange={(open: boolean) =>
        open ? sideMenu.freezeMenu() : sideMenu.unfreezeMenu()
      }
      position="left"
    >
      <Menu.Trigger>
        <Button
          aria-label={dictionary.side_menu.drag_handle_label}
          className={`${SIDE_MENU_BUTTON} cursor-grab active:cursor-grabbing`}
          draggable
          onDragEnd={() => sideMenu.blockDragEnd()}
          onDragStart={(event: React.DragEvent) =>
            sideMenu.blockDragStart(event, block)
          }
          type="button"
          variant="ghost"
        >
          <GripVerticalIcon className="size-4" />
        </Button>
      </Menu.Trigger>
      <ModeloDragHandleMenu />
    </Menu.Root>
  );
}

export function ModeloSideMenu(props: SideMenuProps) {
  return (
    <SideMenu {...props}>
      <ModeloAddBlockButton />
      <ModeloDragHandleButton />
    </SideMenu>
  );
}
