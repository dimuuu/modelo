import {
  CopyIcon,
  DownloadIcon,
  PlusIcon,
  UploadIcon,
  XIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Toaster } from "@/components/ui/sonner";

import "@blocknote/mantine/style.css";
import { toEditorBlocks } from "./engine/portable";
import type { PortableBlock } from "./engine/portable";
import { matchingScenarioName } from "./engine/scenarios";
import type { EditorPort } from "./notebook/port";
import { NotebookEditor } from "./NotebookEditor";
import { EMPTY_TOOLS_STATE, ModeloTools } from "./webmcp/ModeloTools";
import type { ModeloToolsState } from "./webmcp/ModeloTools";
import { findTool, runTool } from "./webmcp/tools";
import type { ToolRuntime } from "./webmcp/tools";
import {
  findNotebook,
  loadWorkspace,
  notebookTitle,
  parseWorkspace,
  replaceNotebookBlocks,
  saveWorkspace,
} from "./workspace";
import type { Workspace } from "./workspace";

import "./blocknote-theme.css";

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

type PendingDelete =
  | { kind: "notebook"; id: string; title: string }
  | { kind: "scenario"; name: string };

/**
 * The shell. It owns two pieces of state the tools cannot: the workspace
 * catalogue and which notebook is open. Everything the sidebar and the header
 * do goes through the same tool table the agent uses.
 */
export default function App() {
  const [workspace, setWorkspace] = useState<Workspace>(() => loadWorkspace());
  const [openId, setOpenId] = useState<string | null>(
    () => workspace.notebooks[0]?.id ?? null
  );
  const [webmcp, setWebmcp] = useState<ModeloToolsState>(EMPTY_TOOLS_STATE);
  const [scenarioDialogOpen, setScenarioDialogOpen] = useState(false);
  const [scenarioName, setScenarioName] = useState("");
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(
    null
  );

  const editorRef = useRef<EditorPort | null>(null);
  const workspaceRef = useRef(workspace);
  const openIdRef = useRef(openId);

  const openNotebook = findNotebook(workspace, openId) ?? null;

  // First run: the seeds are copied into storage once, so a deleted seed never
  // returns on the next load.
  useEffect(() => {
    saveWorkspace(workspaceRef.current);
  }, []);

  /** The one write path: state, ref, and localStorage move together. */
  const updateWorkspace = useCallback(
    (change: (current: Workspace) => Workspace) => {
      const next = change(workspaceRef.current);
      workspaceRef.current = next;
      setWorkspace(next);
      saveWorkspace(next);
      return next;
    },
    []
  );
  const open = useCallback((id: string | null) => {
    openIdRef.current = id;
    setOpenId(id);
  }, []);

  const runtime = useMemo<ToolRuntime>(
    () => ({
      editor: () => editorRef.current,
      workspace: {
        current: () => workspaceRef.current,
        open,
        openId: () => openIdRef.current,
        update: updateWorkspace,
      },
    }),
    [open, updateWorkspace]
  );

  /** Runs a tool from the UI. Failures surface as toasts instead of results. */
  const run = useCallback(
    async (name: string, args: unknown = {}) => {
      const result = await runTool(runtime, findTool(name), args);
      if (!result.ok) {
        toast.error(result.error.message);
      }
      return result;
    },
    [runtime]
  );

  const saveOpenDocument = useCallback(
    (blocks: PortableBlock[]) => {
      const id = openIdRef.current;
      if (id) {
        updateWorkspace((current) =>
          replaceNotebookBlocks(current, id, blocks)
        );
      }
    },
    [updateWorkspace]
  );
  const expose = useCallback((port: EditorPort | null) => {
    editorRef.current = port;
  }, []);

  const importWorkspace = async (file: File) => {
    let text: string;
    try {
      text = await file.text();
    } catch {
      toast.error("Could not read the file.");
      return;
    }
    const imported = parseWorkspace(text);
    if (!imported) {
      toast.error("Not a Modelo workspace export");
      return;
    }
    updateWorkspace(() => imported);
    open(imported.notebooks[0]?.id ?? null);
    toast.success(`Imported ${imported.notebooks.length} notebooks.`);
  };

  const defaults = useMemo(
    () => ({ currency: workspace.currency, locale: workspace.locale }),
    [workspace.currency, workspace.locale]
  );

  // Derived from the persisted snapshot, which changes on every edit, so the
  // chips follow the document without reading the editor during render.
  const activeScenario = useMemo(
    () =>
      openNotebook
        ? matchingScenarioName(
            toEditorBlocks(openNotebook.blocks),
            openNotebook.scenarios
          )
        : null,
    [openNotebook]
  );

  const saveCurrentScenario = async () => {
    const name = scenarioName.trim();
    if (!name) {
      return;
    }
    const result = await run("save_scenario", { name });
    if (result.ok) {
      setScenarioName("");
      setScenarioDialogOpen(false);
      toast.success(`Saved scenario '${name}'.`);
    }
  };

  const confirmDelete = () => {
    if (pendingDelete?.kind === "notebook") {
      run("delete_notebook", { id: pendingDelete.id });
    } else if (pendingDelete?.kind === "scenario") {
      run("delete_scenario", { name: pendingDelete.name });
    }
    setPendingDelete(null);
  };

  return (
    <div className="grid min-h-screen grid-cols-1 md:grid-cols-[250px_minmax(0,1fr)]">
      <ModeloTools
        notebookOpen={openId !== null}
        onChange={setWebmcp}
        runtime={runtime}
      />
      <aside className="bg-sidebar flex max-h-[42vh] flex-col gap-3 border-b p-3 md:sticky md:top-0 md:h-screen md:max-h-none md:border-r md:border-b-0">
        <Button
          className="justify-start px-2 text-[19px] font-bold tracking-tight"
          onClick={() => open(null)}
          size="lg"
          type="button"
          variant="ghost"
        >
          Modelo
        </Button>
        <Button
          className="justify-start"
          onClick={() => run("create_notebook", { name: "Untitled notebook" })}
          type="button"
        >
          <PlusIcon />
          New notebook
        </Button>
        <nav className="-mx-1 flex flex-col gap-0.5 overflow-y-auto px-1">
          {workspace.notebooks.map((notebook) => {
            const title = notebookTitle(notebook);
            return (
              <div
                className={`group grid grid-cols-[minmax(0,1fr)_auto_auto] items-center rounded-md ${
                  notebook.id === openId ? "bg-sidebar-accent" : ""
                }`}
                key={notebook.id}
              >
                <Button
                  className="justify-start truncate px-2 font-normal"
                  onClick={() => open(notebook.id)}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  <span className="truncate">{title}</span>
                </Button>
                <Button
                  aria-label={`Duplicate ${title}`}
                  className="text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                  onClick={() => run("duplicate_notebook", { id: notebook.id })}
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
                  onClick={() =>
                    setPendingDelete({
                      id: notebook.id,
                      kind: "notebook",
                      title,
                    })
                  }
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
        </nav>
        <div className="mt-auto hidden flex-col gap-1 md:flex">
          <Separator className="mb-2" />
          <Badge
            className="w-fit gap-1.5 font-normal"
            variant={webmcp.supported ? "default" : "secondary"}
          >
            <span
              className={`size-1.5 rounded-full ${
                webmcp.supported ? "bg-current" : "bg-muted-foreground"
              }`}
            />
            {webmcp.supported ? "WebMCP ready" : "WebMCP unavailable"}
          </Badge>
          <Button
            className="text-muted-foreground justify-start px-1 font-normal"
            onClick={() => download("modelo-workspace.json", workspace)}
            size="sm"
            type="button"
            variant="ghost"
          >
            <DownloadIcon />
            Export all
          </Button>
          <Label
            className="text-muted-foreground hover:bg-accent flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-1 text-sm font-normal"
            htmlFor="import-workspace"
          >
            <UploadIcon className="size-3.5" />
            Import
            <input
              accept="application/json"
              className="sr-only"
              id="import-workspace"
              onChange={(e) =>
                e.target.files?.[0] && importWorkspace(e.target.files[0])
              }
              type="file"
            />
          </Label>
        </div>
      </aside>
      <main className="min-w-0">
        {openNotebook ? (
          <>
            <header className="mx-auto flex max-w-[900px] justify-end px-6 pt-6 pb-2 md:px-[52px]">
              <Button
                onClick={() =>
                  download(`${notebookTitle(openNotebook)}.json`, openNotebook)
                }
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
              {openNotebook.scenarios.map((scenario) => {
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
                      onClick={() =>
                        run("apply_scenario", { name: scenario.name })
                      }
                      type="button"
                    >
                      {scenario.name}
                    </button>
                    <button
                      aria-label={`Delete scenario ${scenario.name}`}
                      className="text-muted-foreground py-1 pr-2.5 pl-1"
                      onClick={() =>
                        setPendingDelete({
                          kind: "scenario",
                          name: scenario.name,
                        })
                      }
                      type="button"
                    >
                      <XIcon className="size-3" />
                    </button>
                  </span>
                );
              })}
              <Button
                className="text-muted-foreground shrink-0"
                onClick={() => setScenarioDialogOpen(true)}
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
              key={openNotebook.id}
              notebook={openNotebook}
              onSave={saveOpenDocument}
            />
          </>
        ) : (
          <section className="mx-auto max-w-[680px] px-9 py-[17vh]">
            <p className="text-[11px] font-bold tracking-[0.12em] uppercase">
              Workspace
            </p>
            <h1 className="my-2 text-4xl font-semibold tracking-[-0.035em]">
              Notebook and model, together.
            </h1>
            <p className="text-muted-foreground leading-relaxed">
              Open a notebook from the left, or create a blank one. Your
              workspace stays in this browser.
            </p>
            <Button
              className="mt-4"
              onClick={() =>
                run("create_notebook", { name: "Untitled notebook" })
              }
              type="button"
            >
              New notebook
            </Button>
          </section>
        )}
      </main>

      <Dialog onOpenChange={setScenarioDialogOpen} open={scenarioDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save scenario</DialogTitle>
            <DialogDescription>
              Store the current input values under a name you can return to.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="scenario-name">Scenario name</Label>
            <Input
              autoFocus
              id="scenario-name"
              onChange={(e) => setScenarioName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveCurrentScenario()}
              placeholder="Best case"
              value={scenarioName}
            />
          </div>
          <DialogFooter>
            <Button
              onClick={() => setScenarioDialogOpen(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              disabled={!scenarioName.trim()}
              onClick={saveCurrentScenario}
              type="button"
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        onOpenChange={(isOpen) => !isOpen && setPendingDelete(null)}
        open={pendingDelete !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingDelete?.kind === "notebook"
                ? `Delete '${pendingDelete.title}'?`
                : `Delete scenario '${pendingDelete?.name}'?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. Export first if you want to keep a copy.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Toaster position="bottom-right" />
    </div>
  );
}
