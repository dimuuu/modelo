import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BlockNoteView } from "@blocknote/mantine";
import { SuggestionMenuController, getDefaultReactSlashMenuItems, useCreateBlockNote } from "@blocknote/react";
import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import { evaluateModel, projectDocument, renameVariable } from "./engine";
import { ModelProvider, modeloSchema, newVariableProps, type ModeloEditor } from "./editor";
import { loadWorkspace, portableToEditorBlocks, saveWorkspace, STORAGE_KEY, type Notebook, type Workspace } from "./workspace";
import { useModeloTools, type ModeloToolsAdapter } from "./webmcp/useModeloTools";
import "./styles.css";

const uid = () => crypto.randomUUID();
const ok = (data: unknown = {}) => ({ ok: true, data });
const fault = (code: string, message: string, details?: unknown) => { throw { code, message, details }; };

function download(filename: string, value: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }));
  const anchor = Object.assign(document.createElement("a"), { href: url, download: filename });
  anchor.click(); URL.revokeObjectURL(url);
}

function textContent(block: any): string {
  if (!Array.isArray(block.content)) return "";
  return block.content.map((node: any) => node.type === "text" ? node.text : node.type === "variableRef" ? `@${node.props?.label || node.props?.varId}` : "").join("");
}

function NotebookEditor({ notebook, onSave, expose }: { notebook: Notebook; onSave: (blocks: unknown[]) => void; expose: (editor: ModeloEditor | null) => void }) {
  const initial = useMemo(() => portableToEditorBlocks(notebook.blocks as any[]), [notebook.id]);
  const editor = useCreateBlockNote({ schema: modeloSchema, initialContent: initial as any });
  const [documentBlocks, setDocumentBlocks] = useState<any[]>(() => editor.document as any[]);
  useEffect(() => { expose(editor); return () => expose(null); }, [editor, expose]);

  const model = useMemo(() => {
    try { return evaluateModel(projectDocument(documentBlocks)); }
    catch (error) { console.warn("Model projection error", error); return { variables: [], byId: {}, byName: {} }; }
  }, [documentBlocks]);

  const slashItems = useCallback(async (query: string) => {
    const insert = (kind: "number"|"slider"|"select"|"formula") => ({
      title: kind[0].toUpperCase() + kind.slice(1),
      subtext: kind === "formula" ? "Computed MathJS expression" : `Named ${kind} input`,
      group: "Modelo",
      onItemClick: () => {
        const block = editor.getTextCursorPosition().block;
        editor.transact(() => editor.updateBlock(block, { type: kind, props: newVariableProps(kind) } as any));
      },
    });
    const all = [...getDefaultReactSlashMenuItems(editor), insert("number"), insert("slider"), insert("select"), insert("formula")];
    const q = query.toLowerCase();
    return all.filter((item) => item.title.toLowerCase().includes(q) || item.subtext?.toLowerCase().includes(q));
  }, [editor]);

  const refItems = useCallback(async (query: string) => model.variables
    .filter((variable) => variable.name.toLowerCase().includes(query.toLowerCase()))
    .map((variable) => ({ title: variable.name, subtext: variable.formatted, onItemClick: () => editor.insertInlineContent([{ type: "variableRef", props: { varId: variable.varId, label: variable.name } }] as any) })), [editor, model]);

  return <ModelProvider value={model}>
    <div className="editor-shell">
      <BlockNoteView editor={editor} slashMenu={false} onChange={() => {
        const next = editor.document as any[];
        setDocumentBlocks([...next]);
        onSave(JSON.parse(JSON.stringify(next)));
      }}>
        <SuggestionMenuController triggerCharacter="/" getItems={slashItems}/>
        <SuggestionMenuController triggerCharacter="@" getItems={refItems}/>
      </BlockNoteView>
    </div>
  </ModelProvider>;
}

export default function App() {
  const [workspace, setWorkspace] = useState<Workspace>(() => loadWorkspace());
  const [openId, setOpenId] = useState<string | null>(() => loadWorkspace().notebooks[0]?.id ?? null);
  const editorRef = useRef<ModeloEditor | null>(null);
  const workspaceRef = useRef(workspace);
  const openIdRef = useRef(openId);
  useEffect(() => { workspaceRef.current = workspace; saveWorkspace(workspace); }, [workspace]);
  useEffect(() => { openIdRef.current = openId; }, [openId]);
  const openNotebook = workspace.notebooks.find((item) => item.id === openId) ?? null;

  const updateWorkspace = useCallback((fn: (current: Workspace) => Workspace) => {
    const next = fn(workspaceRef.current); workspaceRef.current = next; setWorkspace(next); saveWorkspace(next); return next;
  }, []);
  const saveOpenDocument = useCallback((blocks: unknown[]) => updateWorkspace((current) => ({ ...current, notebooks: current.notebooks.map((n) => n.id === openIdRef.current ? { ...n, blocks, updatedAt: new Date().toISOString() } : n) })), [updateWorkspace]);
  const expose = useCallback((editor: ModeloEditor | null) => { editorRef.current = editor; }, []);

  const adapter = useMemo<ModeloToolsAdapter>(() => {
    const currentEditor = () => editorRef.current ?? fault("NO_NOTEBOOK_OPEN", "Open a notebook first.");
    const currentNotebook = () => workspaceRef.current.notebooks.find((n) => n.id === openIdRef.current) ?? fault("NO_NOTEBOOK_OPEN", "Open a notebook first.");
    const ensureUniqueName = (name: string, exceptId?: string) => {
      const model = projectDocument(currentEditor().document as any);
      const found = model.idByName[name];
      if (found && found !== exceptId) fault("DUPLICATE_VARIABLE_NAME", `Variable '${name}' already exists.`);
    };
    return {
      workspace: {
        list: () => ok({ notebooks: workspaceRef.current.notebooks.map(({ id, title, updatedAt }) => ({ id, title, updatedAt })), openNotebookId: openIdRef.current }),
        open: ({ id }) => { if (!workspaceRef.current.notebooks.some((n) => n.id === id)) fault("NOT_FOUND", `Notebook '${id}' not found.`); setOpenId(id); return ok({ id }); },
        create: ({ name }) => { const notebook = { id: uid(), title: name.trim() || "Untitled", blocks: [{ id: uid(), type: "heading", text: name.trim() || "Untitled" }, { id: uid(), type: "paragraph", text: "Start writing, or type / to add a model variable." }], updatedAt: new Date().toISOString() }; updateWorkspace((w) => ({ ...w, notebooks: [...w.notebooks, notebook] })); setOpenId(notebook.id); return ok(notebook); },
        duplicate: ({ id, name }) => { const source = workspaceRef.current.notebooks.find((n) => n.id === id) ?? fault("NOT_FOUND", `Notebook '${id}' not found.`); const copy = { ...JSON.parse(JSON.stringify(source)), id: uid(), title: name ?? `${source.title} copy`, updatedAt: new Date().toISOString() }; updateWorkspace((w) => ({ ...w, notebooks: [...w.notebooks, copy] })); return ok(copy); },
        delete: ({ id }) => { if (!workspaceRef.current.notebooks.some((n) => n.id === id)) fault("NOT_FOUND", `Notebook '${id}' not found.`); updateWorkspace((w) => ({ ...w, notebooks: w.notebooks.filter((n) => n.id !== id) })); if (openIdRef.current === id) setOpenId(null); return ok({ id }); },
        rename: ({ id, name }) => { updateWorkspace((w) => ({ ...w, notebooks: w.notebooks.map((n) => n.id === id ? { ...n, title: name.trim() || n.title, updatedAt: new Date().toISOString() } : n) })); return ok({ id, name }); },
      },
      notebook: openId ? {
        getDocument: () => { const blocks = currentEditor().document as any[]; return ok({ notebook: { id: currentNotebook().id, title: currentNotebook().title }, blocks: blocks.map((block, i) => ({ id: block.id, type: block.type, ...(block.props?.varId ? { props: block.props } : { text: textContent(block) }), previousId: blocks[i-1]?.id ?? null, nextId: blocks[i+1]?.id ?? null })) }); },
        getModel: () => { const editor = currentEditor(); const projected = projectDocument(editor.document as any); const evaluated = evaluateModel(projected); return ok(evaluated.variables.map((variable) => ({ id: variable.varId, name: variable.name, kind: variable.kind, value: variable.value, unit: variable.unit || variable.currency, error: variable.error ?? null, usedBy: (editor.document as any[]).filter((b) => (b.type === "formula" && String(b.props?.formula).includes(variable.name)) || JSON.stringify(b.content).includes(variable.varId)).map((b) => b.id) }))); },
        insertBlocks: ({ blocks, referenceBlockId, placement }) => { const editor = currentEditor(); const converted = portableToEditorBlocks(blocks as any[]); for (const block of converted as any[]) if (block.props?.name) ensureUniqueName(block.props.name); editor.transact(() => { if (referenceBlockId) editor.insertBlocks(converted as any, referenceBlockId, placement ?? "after"); else editor.insertBlocks(converted as any, editor.document.at(-1)!, "after"); }); return ok({ inserted: converted.length }); },
        updateBlock: ({ id, patch }) => { const editor = currentEditor(); const block = editor.getBlock(id) as any; if (!block) fault("NOT_FOUND", `Block '${id}' not found.`); const nextName = (patch.props as any)?.name; if (nextName && block.props?.varId && nextName !== block.props.name) { ensureUniqueName(nextName, block.props.varId); const renamed = renameVariable(editor.document as any, block.props.varId, nextName); editor.transact(() => editor.replaceBlocks(editor.document, renamed as any)); const rest = { ...patch, props: { ...(patch.props as any) } }; delete (rest.props as any).name; if (Object.keys(rest.props as any).length) editor.transact(() => editor.updateBlock(id, rest as any)); } else editor.transact(() => editor.updateBlock(id, patch as any)); return ok({ id }); },
        removeBlocks: ({ ids }) => { const editor = currentEditor(); const missing = ids.filter((id) => !editor.getBlock(id)); if (missing.length) fault("NOT_FOUND", "Some blocks do not exist.", { ids: missing }); editor.transact(() => editor.removeBlocks(ids)); return ok({ removed: ids }); },
        replaceParagraph: ({ id, text }) => { const editor = currentEditor(); if (!editor.getBlock(id)) fault("NOT_FOUND", `Block '${id}' not found.`); const model = projectDocument(editor.document as any); const content: any[] = []; const pattern = /@([A-Za-z_][A-Za-z0-9_]*)/g; let start = 0, match: RegExpExecArray | null; while ((match = pattern.exec(text))) { if (match.index > start) content.push({ type: "text", text: text.slice(start, match.index), styles: {} }); const varId = model.idByName[match[1]]; content.push(varId ? { type: "variableRef", props: { varId, label: match[1] } } : { type: "text", text: match[0], styles: {} }); start = match.index + match[0].length; } if (start < text.length) content.push({ type: "text", text: text.slice(start), styles: {} }); editor.transact(() => editor.updateBlock(id, { type: "paragraph", content } as any)); return ok({ id }); },
        insertInlineRef: ({ blockId, variable }) => { const editor = currentEditor(); const model = projectDocument(editor.document as any); const varId = model.idByName[variable]; if (!varId) fault("NOT_FOUND", `Variable '${variable}' not found.`); const block = editor.getBlock(blockId) as any; if (!block) fault("NOT_FOUND", `Block '${blockId}' not found.`); const content = [...(block.content ?? []), { type: "variableRef", props: { varId, label: variable } }]; editor.transact(() => editor.updateBlock(blockId, { content } as any)); return ok({ blockId, varId }); },
        setVariable: ({ name, value }) => { const editor = currentEditor(); if (!Number.isFinite(value)) fault("INVALID_VALUE", "Value must be finite."); const model = projectDocument(editor.document as any); const variable = model.byId[model.idByName[name]]; if (!variable) fault("NOT_FOUND", `Variable '${name}' not found.`); const block = editor.getBlock(variable.blockId) as any; if (!["number", "slider", "select"].includes(block.type)) fault("READ_ONLY", "Formula values are computed and cannot be set."); editor.transact(() => editor.updateBlock(block, { props: { value } })); return ok({ name, value }); },
      } : null,
    };
  }, [openId, updateWorkspace]);
  const webmcp = useModeloTools(adapter);

  const createNotebook = () => adapter.workspace.create({ name: "Untitled notebook" });
  const deleteNotebook = (id: string) => { if (confirm("Delete this notebook?")) adapter.workspace.delete({ id }); };
  const importWorkspace = (file: File) => file.text().then((text) => { const parsed = JSON.parse(text); if (parsed.version !== 1 || !Array.isArray(parsed.notebooks)) throw new Error("Not a Modelo workspace export"); localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed)); setWorkspace(parsed); setOpenId(parsed.notebooks[0]?.id ?? null); }).catch((error) => alert(error.message));

  return <div className="app">
    <aside className="sidebar">
      <button className="wordmark" onClick={() => setOpenId(null)}>Modelo</button>
      <button className="new-button" onClick={createNotebook}>+ New notebook</button>
      <nav>{workspace.notebooks.map((notebook) => <div className={`notebook-row ${notebook.id === openId ? "active" : ""}`} key={notebook.id}><button className="notebook-link" onClick={() => setOpenId(notebook.id)}>{notebook.title}</button><button title="Duplicate" onClick={() => adapter.workspace.duplicate({ id: notebook.id })}>⧉</button><button title="Delete" onClick={() => deleteNotebook(notebook.id)}>×</button></div>)}</nav>
      <div className="sidebar-footer"><span className={`status ${webmcp.supported ? "on" : ""}`}>{webmcp.supported ? "WebMCP ready" : "WebMCP unavailable"}</span><button onClick={() => download("modelo-workspace.json", workspace)}>Export all</button><label className="import-label">Import<input type="file" accept="application/json" onChange={(e) => e.target.files?.[0] && importWorkspace(e.target.files[0])}/></label></div>
    </aside>
    <main>{openNotebook ? <><header className="notebook-header"><input aria-label="Notebook title" value={openNotebook.title} onChange={(e) => adapter.workspace.rename({ id: openNotebook.id, name: e.target.value })}/><button onClick={() => download(`${openNotebook.title}.json`, openNotebook)}>Export</button></header><NotebookEditor key={openNotebook.id} notebook={openNotebook} onSave={saveOpenDocument} expose={expose}/></> : <section className="workspace-home"><p className="eyebrow">Workspace</p><h1>Notebook and model, together.</h1><p>Open a notebook from the left, or create a blank one. Your workspace stays in this browser.</p><button className="primary" onClick={createNotebook}>New notebook</button></section>}</main>
  </div>;
}
