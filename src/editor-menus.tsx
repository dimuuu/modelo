import { SideMenuExtension } from "@blocknote/core";
import { SuggestionMenu } from "@blocknote/core/extensions";
import {
  blockTypeSelectItems,
  FormattingToolbar,
  getFormattingToolbarItems,
  SideMenu,
  useBlockNoteEditor,
  useDictionary,
  useExtension,
  useExtensionState,
} from "@blocknote/react";
import type { BlockTypeSelectItem, SideMenuProps } from "@blocknote/react";
import { GripVerticalIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";

import { BlockConfig, hasBlockConfig } from "./block-config";
import { modeloSchema } from "./editor";
import { HEADING_LEVELS } from "./engine/document";

const REMOVED_TOOLBAR_ITEMS = new Set([
  "nestBlockButton",
  "textAlignCenterButton",
  "textAlignLeftButton",
  "textAlignRightButton",
  "unnestBlockButton",
]);

const headingLevels = new Set<number>(HEADING_LEVELS);

/** BlockNote's own block types, minus the ones this schema does not have. */
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

const SIDE_MENU_BUTTON = "text-muted-foreground size-6";

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

function ModeloDragHandleButton() {
  const editor = useBlockNoteEditor();
  const dictionary = useDictionary();
  const sideMenu = useExtension(SideMenuExtension);
  const block = useExtensionState(SideMenuExtension, {
    selector: (state) => state?.block,
  });
  const [open, setOpen] = useState(false);
  if (!block) {
    return null;
  }
  const setOpenAndFreeze = (next: boolean) => {
    setOpen(next);
    if (next) {
      sideMenu.freezeMenu();
    } else {
      sideMenu.unfreezeMenu();
    }
  };
  const remove = () => {
    editor.removeBlocks([block]);
    setOpenAndFreeze(false);
  };
  return (
    <Popover onOpenChange={setOpenAndFreeze} open={open}>
      <PopoverTrigger
        render={
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
        }
      />
      <PopoverContent align="start" className="w-64" side="left" sideOffset={8}>
        {hasBlockConfig(block.type) ? (
          <>
            <BlockConfig block={block as never} editor={editor} />
            <Separator />
          </>
        ) : null}
        <Button
          className="text-destructive hover:text-destructive w-full justify-start"
          onClick={remove}
          size="sm"
          type="button"
          variant="ghost"
        >
          <Trash2Icon />
          {dictionary.drag_handle.delete_menuitem}
        </Button>
      </PopoverContent>
    </Popover>
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
