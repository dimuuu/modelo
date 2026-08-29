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
import { Toaster } from "@/components/ui/sonner";

import "@blocknote/mantine/style.css";
import type { PortableBlock } from "./engine/portable";
import { HomeTab } from "./HomeTab";
import type { EditorPort } from "./notebook/port";
import { NotebookTab } from "./NotebookTab";
import {
  activateTab,
  closeTab,
  goHome,
  newTab,
  openInTab,
  openNotebookId,
  pruneTabs,
} from "./tabs";
import { TabStrip } from "./TabStrip";
import { useTabState } from "./use-tab-state";
import { ModeloTools } from "./webmcp/ModeloTools";
import { findTool, runTool } from "./webmcp/tools";
import type { ToolRuntime } from "./webmcp/tools";
import {
  findNotebook,
  importNotebook,
  loadWorkspace,
  notebookTitle,
  parseNotebook,
  replaceNotebookBlocks,
  saveWorkspace,
} from "./workspace";
import type { NotebookRecord, Workspace } from "./workspace";

import "./blocknote-theme.css";

type PendingDelete =
  | { kind: "notebook"; id: string; title: string }
  | { kind: "scenario"; name: string };

/**
 * The shell. It owns two pieces of state the tools cannot: the workspace
 * catalogue and the tab strip. Everything the tabs and the home page do goes
 * through the same tool table the agent uses.
 *
 * Every open notebook stays mounted, hidden until its tab comes forward, so
 * switching tabs keeps the cursor and the scroll position. `ports` holds one
 * editor per notebook; the tools always get the one in front.
 */
export default function App() {
  const [workspace, setWorkspace] = useState<Workspace>(() => loadWorkspace());
  const [tabState, updateTabs] = useTabState();
  const [scenarioDialogOpen, setScenarioDialogOpen] = useState(false);
  const [scenarioName, setScenarioName] = useState("");
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(
    null
  );

  const ports = useRef(new Map<string, EditorPort>());
  const workspaceRef = useRef(workspace);
  const tabsRef = useRef(tabState);

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

  // The tools reach the tabs from outside React, so the state is mirrored.
  useEffect(() => {
    tabsRef.current = tabState;
  }, [tabState]);

  const open = useCallback(
    (id: string | null) => {
      updateTabs((current) =>
        id === null ? goHome(current) : openInTab(current, id)
      );
    },
    [updateTabs]
  );

  // A deleted notebook takes its tab with it, whoever deleted it. The guard
  // keeps an edit, which touches the catalogue on every keystroke, out of the
  // query string.
  const { notebooks } = workspace;
  useEffect(() => {
    const ids = new Set(notebooks.map(({ id }) => id));
    if (pruneTabs(tabsRef.current, ids) !== tabsRef.current) {
      updateTabs((current) => pruneTabs(current, ids));
    }
  }, [notebooks, updateTabs]);

  const runtime = useMemo<ToolRuntime>(
    () => ({
      editor: () => {
        const id = openNotebookId(tabsRef.current);
        return (id ? ports.current.get(id) : undefined) ?? null;
      },
      workspace: {
        current: () => workspaceRef.current,
        open,
        openId: () => openNotebookId(tabsRef.current),
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

  const saveNotebook = useCallback(
    (id: string, blocks: PortableBlock[]) => {
      updateWorkspace((current) => replaceNotebookBlocks(current, id, blocks));
    },
    [updateWorkspace]
  );

  const registerPort = useCallback((id: string, port: EditorPort | null) => {
    if (port) {
      ports.current.set(id, port);
    } else {
      ports.current.delete(id);
    }
  }, []);

  /** Imports one exported notebook and opens it. */
  const importFile = async (file: File) => {
    let text: string;
    try {
      text = await file.text();
    } catch {
      toast.error("Could not read the file.");
      return;
    }
    const record = parseNotebook(text);
    if (!record) {
      toast.error("Not a Modelo notebook export");
      return;
    }
    let added: NotebookRecord | undefined;
    updateWorkspace((current) => {
      const result = importNotebook(current, record, crypto.randomUUID());
      added = result.notebook;
      return result.workspace;
    });
    const notebook = added as NotebookRecord;
    open(notebook.id);
    toast.success(`Imported '${notebookTitle(notebook)}'.`);
  };

  const defaults = useMemo(
    () => ({ currency: workspace.currency, locale: workspace.locale }),
    [workspace.currency, workspace.locale]
  );

  const titleOf = useCallback(
    (notebookId: string | null) => {
      const notebook = findNotebook(workspace, notebookId);
      return notebook ? notebookTitle(notebook) : "Home";
    },
    [workspace]
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

  const openId = openNotebookId(tabState);
  const openNotebooks = tabState.tabs.flatMap((notebookId) => {
    const notebook = findNotebook(workspace, notebookId);
    return notebook ? [notebook] : [];
  });

  const confirmDelete = () => {
    if (pendingDelete?.kind === "notebook") {
      run("delete_notebook", { id: pendingDelete.id });
    } else if (pendingDelete?.kind === "scenario") {
      run("delete_scenario", { name: pendingDelete.name });
    }
    setPendingDelete(null);
  };

  return (
    <div className="flex h-dvh flex-col">
      <ModeloTools notebookOpen={openId !== null} runtime={runtime} />
      <TabStrip
        onActivate={(index) => updateTabs((c) => activateTab(c, index))}
        onClose={(index) => updateTabs((c) => closeTab(c, index))}
        onNewTab={() => updateTabs(newTab)}
        state={tabState}
        titleOf={titleOf}
      />
      <main className="min-h-0 flex-1">
        {/*
         * Home is stateless, so every home tab shares one panel. A notebook
         * panel is keyed by its notebook, so closing another tab cannot
         * remount it and lose the cursor.
         */}
        <div className="h-full overflow-y-auto" hidden={openId !== null}>
          <HomeTab
            onCreate={() =>
              run("create_notebook", { name: "Untitled notebook" })
            }
            onDelete={(record) =>
              setPendingDelete({
                id: record.id,
                kind: "notebook",
                title: notebookTitle(record),
              })
            }
            onDuplicate={(id) => run("duplicate_notebook", { id })}
            onImport={importFile}
            onOpen={(id) => run("open_notebook", { id })}
            workspace={workspace}
          />
        </div>
        {openNotebooks.map((notebook) => (
          <div
            className="h-full overflow-y-auto"
            hidden={notebook.id !== openId}
            key={notebook.id}
          >
            <NotebookTab
              defaults={defaults}
              notebook={notebook}
              onApplyScenario={(name) => run("apply_scenario", { name })}
              onDelete={() =>
                setPendingDelete({
                  id: notebook.id,
                  kind: "notebook",
                  title: notebookTitle(notebook),
                })
              }
              onDeleteScenario={(name) =>
                setPendingDelete({ kind: "scenario", name })
              }
              onDuplicate={() => run("duplicate_notebook", { id: notebook.id })}
              onSave={saveNotebook}
              onSaveScenario={() => setScenarioDialogOpen(true)}
              registerPort={registerPort}
            />
          </div>
        ))}
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
