import { PlusIcon, XIcon } from "lucide-react";
import { useCallback, useMemo } from "react";

import type { FormatDefaults } from "./engine/format";
import { toEditorBlocks } from "./engine/portable";
import type { PortableBlock } from "./engine/portable";
import { matchingScenarioName } from "./engine/scenarios";
import type { EditorPort } from "./notebook/port";
import { NotebookEditor } from "./NotebookEditor";
import { NotebookMenu } from "./NotebookMenu";
import type { NotebookRecord } from "./workspace";

/**
 * One notebook inside one tab: its scenario pills, its actions menu, and its
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
  onDuplicate,
  onDelete,
}: {
  notebook: NotebookRecord;
  defaults: FormatDefaults;
  onSave: (notebookId: string, blocks: PortableBlock[]) => void;
  registerPort: (notebookId: string, port: EditorPort | null) => void;
  onApplyScenario: (name: string) => void;
  onDeleteScenario: (name: string) => void;
  onSaveScenario: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
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
  // pills follow the document without reading the editor during render.
  const activeScenario = useMemo(
    () =>
      matchingScenarioName(toEditorBlocks(notebook.blocks), notebook.scenarios),
    [notebook]
  );

  return (
    <>
      <header className="mx-auto flex max-w-[900px] items-center gap-3 px-6 pt-6 pb-3 md:px-[52px]">
        <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
          {notebook.scenarios.map((scenario) => {
            const active = activeScenario === scenario.name;
            return (
              <span
                className={`inline-flex shrink-0 items-center rounded-full border text-[13px] ${
                  active ? "border-primary bg-accent" : "bg-muted/60"
                }`}
                key={scenario.id}
              >
                <button
                  aria-pressed={active}
                  className="py-1 pr-1 pl-3"
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
          <button
            className="text-muted-foreground hover:bg-muted/60 inline-flex shrink-0 items-center gap-1 rounded-full border border-dashed py-1 pr-3 pl-2.5 text-[13px]"
            onClick={onSaveScenario}
            type="button"
          >
            <PlusIcon className="size-3" />
            Save scenario
          </button>
        </div>

        <NotebookMenu
          notebook={notebook}
          onDelete={onDelete}
          onDuplicate={onDuplicate}
        />
      </header>
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
