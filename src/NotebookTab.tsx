import { DownloadIcon, XIcon } from "lucide-react";
import { useCallback, useMemo } from "react";

import { Button } from "@/components/ui/button";

import type { FormatDefaults } from "./engine/format";
import { toEditorBlocks } from "./engine/portable";
import type { PortableBlock } from "./engine/portable";
import { matchingScenarioName } from "./engine/scenarios";
import type { EditorPort } from "./notebook/port";
import { NotebookEditor } from "./NotebookEditor";
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
 * One notebook inside one tab: its export button, its scenario chips, and its
 * editor. The tab binds every callback to this notebook's id, because several
 * notebooks are mounted at once and only the tab in front is visible.
 */
export function NotebookTab({
  notebook,
  defaults,
  onSave,
  registerPort,
  onApplyScenario,
  onDeleteScenario,
  onSaveScenario,
}: {
  notebook: NotebookRecord;
  defaults: FormatDefaults;
  onSave: (notebookId: string, blocks: PortableBlock[]) => void;
  registerPort: (notebookId: string, port: EditorPort | null) => void;
  onApplyScenario: (name: string) => void;
  onDeleteScenario: (name: string) => void;
  onSaveScenario: () => void;
}) {
  const { id } = notebook;
  const save = useCallback(
    (blocks: PortableBlock[]) => onSave(id, blocks),
    [id, onSave]
  );
  const expose = useCallback(
    (port: EditorPort | null) => registerPort(id, port),
    [id, registerPort]
  );

  // Derived from the persisted snapshot, which changes on every edit, so the
  // chips follow the document without reading the editor during render.
  const activeScenario = useMemo(
    () =>
      matchingScenarioName(toEditorBlocks(notebook.blocks), notebook.scenarios),
    [notebook]
  );

  return (
    <>
      <header className="mx-auto flex max-w-[900px] justify-end px-6 pt-6 pb-2 md:px-[52px]">
        <Button
          onClick={() => download(`${notebookTitle(notebook)}.json`, notebook)}
          size="sm"
          type="button"
          variant="outline"
        >
          <DownloadIcon />
          Export
        </Button>
      </header>
      <div
        aria-label="Scenarios"
        className="mx-auto flex max-w-[900px] items-center gap-2 overflow-x-auto px-6 pb-3 md:px-[52px]"
      >
        {notebook.scenarios.map((scenario) => {
          const active = activeScenario === scenario.name;
          return (
            <span
              className={`inline-flex shrink-0 items-center rounded-full border ${
                active ? "border-primary bg-accent" : "bg-muted/60"
              }`}
              key={scenario.id}
            >
              <button
                aria-pressed={active}
                className="py-1 pr-1 pl-3 text-[13px]"
                onClick={() => onApplyScenario(scenario.name)}
                type="button"
              >
                {scenario.name}
              </button>
              <button
                aria-label={`Delete scenario ${scenario.name}`}
                className="text-muted-foreground py-1 pr-2.5 pl-1"
                onClick={() => onDeleteScenario(scenario.name)}
                type="button"
              >
                <XIcon className="size-3" />
              </button>
            </span>
          );
        })}
        <Button
          className="text-muted-foreground shrink-0"
          onClick={onSaveScenario}
          size="sm"
          type="button"
          variant="ghost"
        >
          + Save current as…
        </Button>
      </div>
      <NotebookEditor
        defaults={defaults}
        expose={expose}
        key={id}
        notebook={notebook}
        onSave={save}
      />
    </>
  );
}
