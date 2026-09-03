import {
  CopyIcon,
  DownloadIcon,
  EllipsisVerticalIcon,
  Trash2Icon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { notebookTitle } from "./workspace";
import type { NotebookRecord } from "./workspace";

function download(filename: string, value: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" })
  );
  const anchor = Object.assign(document.createElement("a"), {
    download: filename,
    href: url,
  });
  anchor.click();
  URL.revokeObjectURL(url);
}

/**
 * What you can do to one notebook, behind an ellipsis. The home list and the
 * open tab show the same three actions, so the menu is written once.
 */
export function NotebookMenu({
  notebook,
  onDuplicate,
  onDelete,
}: {
  notebook: NotebookRecord;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const title = notebookTitle(notebook);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label={`Actions for ${title}`}
            size="icon-sm"
            title="Actions"
            type="button"
            variant="ghost"
          >
            <EllipsisVerticalIcon />
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => download(`${title}.json`, notebook)}>
          <DownloadIcon />
          Export
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onDuplicate}>
          <CopyIcon />
          Duplicate
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onDelete} variant="destructive">
          <Trash2Icon />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
