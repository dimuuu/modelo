import { CopyIcon, PlusIcon, UploadIcon, XIcon } from "lucide-react";
import { useId } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

import { notebookTitle } from "./workspace";
import type { NotebookRecord, Workspace } from "./workspace";

function updatedLabel(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * What a new tab shows: every notebook in the workspace, plus the two ways to
 * add one. There is no export here on purpose — a notebook is exported from
 * the tab that has it open.
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
    <section className="mx-auto max-w-[760px] px-9 py-[9vh]">
      <p className="text-[11px] font-bold tracking-[0.12em] uppercase">
        Workspace
      </p>
      <h1 className="my-2 text-4xl font-semibold tracking-[-0.035em]">
        Notebook and model, together.
      </h1>
      <p className="text-muted-foreground leading-relaxed">
        Open a notebook in this tab, or start a new one. Your workspace stays in
        this browser.
      </p>

      <div className="mt-5 flex items-center gap-2">
        <Button onClick={onCreate} type="button">
          <PlusIcon />
          New notebook
        </Button>
        <Label
          className="hover:bg-accent flex h-9 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm font-medium"
          htmlFor={importId}
        >
          <UploadIcon className="size-4" />
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
        </Label>
      </div>

      <nav aria-label="Notebooks" className="mt-9 flex flex-col">
        {workspace.notebooks.map((notebook) => {
          const title = notebookTitle(notebook);
          return (
            <div
              className="group grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-2 border-b py-1"
              key={notebook.id}
            >
              <button
                className="min-w-0 truncate py-2 text-left text-[15px]"
                onClick={() => onOpen(notebook.id)}
                type="button"
              >
                {title}
              </button>
              <span className="text-muted-foreground text-[13px]">
                {updatedLabel(notebook.updatedAt, workspace.locale)}
              </span>
              <Button
                aria-label={`Duplicate ${title}`}
                className="text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                onClick={() => onDuplicate(notebook.id)}
                size="icon-sm"
                title="Duplicate"
                type="button"
                variant="ghost"
              >
                <CopyIcon />
              </Button>
              <Button
                aria-label={`Delete ${title}`}
                className="text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                onClick={() => onDelete(notebook)}
                size="icon-sm"
                title="Delete"
                type="button"
                variant="ghost"
              >
                <XIcon />
              </Button>
            </div>
          );
        })}
        {workspace.notebooks.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No notebooks yet. Create one, or import a notebook you exported
            before.
          </p>
        ) : null}
      </nav>
    </section>
  );
}
