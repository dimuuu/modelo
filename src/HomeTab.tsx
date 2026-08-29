import { PlusIcon, UploadIcon } from "lucide-react";
import { useId } from "react";

import { Button } from "@/components/ui/button";

import { NotebookMenu } from "./NotebookMenu";
import { notebookTitle } from "./workspace";
import type { NotebookRecord, Workspace } from "./workspace";

/**
 * The app reads as American English, whatever the model formats its numbers
 * in, so this date does not follow the workspace locale.
 */
function updatedLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * What a new tab shows: every notebook in the workspace, plus the two ways to
 * add one. The list sits in a card that runs to the bottom of the viewport and
 * scrolls on its own, so the two buttons stay in reach.
 */
export function HomeTab({
  workspace,
  onOpen,
  onCreate,
  onImport,
  onDuplicate,
  onDelete,
}: {
  workspace: Workspace;
  onOpen: (id: string) => void;
  onCreate: () => void;
  onImport: (file: File) => void;
  onDuplicate: (id: string) => void;
  onDelete: (notebook: NotebookRecord) => void;
}) {
  const importId = useId();
  return (
    <div className="bg-muted/40 flex h-full flex-col">
      <div className="mx-auto flex w-full max-w-[860px] shrink-0 items-center gap-2 px-6 py-5">
        <Button onClick={onCreate} type="button">
          <PlusIcon />
          New notebook
        </Button>
        {/*
         * A label, not a button, because only a label can open a file picker.
         * It renders through Button so it matches New notebook exactly.
         */}
        <Button
          className="cursor-pointer"
          render={<label aria-label="Import" htmlFor={importId} />}
          variant="outline"
        >
          <UploadIcon />
          Import
          <input
            accept="application/json"
            className="sr-only"
            id={importId}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                onImport(file);
              }
              // Clear it, so importing the same file twice still fires.
              event.target.value = "";
            }}
            type="file"
          />
        </Button>
      </div>

      <nav
        aria-label="Notebooks"
        className="bg-background mx-auto w-full max-w-[860px] flex-1 overflow-y-auto rounded-t-2xl border border-b-0 px-2 py-2"
      >
        {workspace.notebooks.map((notebook) => (
          <div
            className="hover:bg-muted/50 grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 rounded-lg px-3"
            key={notebook.id}
          >
            <button
              className="min-w-0 truncate py-2.5 text-left text-[15px]"
              onClick={() => onOpen(notebook.id)}
              type="button"
            >
              {notebookTitle(notebook)}
            </button>
            <span className="text-muted-foreground text-[13px]">
              {updatedLabel(notebook.updatedAt)}
            </span>
            <NotebookMenu
              notebook={notebook}
              onDelete={() => onDelete(notebook)}
              onDuplicate={() => onDuplicate(notebook.id)}
            />
          </div>
        ))}
        {workspace.notebooks.length === 0 ? (
          <p className="text-muted-foreground px-3 py-6 text-sm">
            No notebooks yet. Create one, or import a notebook you exported
            before.
          </p>
        ) : null}
      </nav>
    </div>
  );
}
