import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BlockNoteView } from "@blocknote/mantine";
import { SuggestionMenuController, getDefaultReactSlashMenuItems, useCreateBlockNote } from "@blocknote/react";
import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import { buildSectionBlocks, evaluateModel, findReferences, getComposition, getModelSummary, inlineContentFromText, projectDocument, renameVariable } from "./engine";
import { ModelProvider, modeloSchema, newVariableProps, parseSelectOptions, type ModeloEditor } from "./editor";
import { DEFAULT_CURRENCY, DEFAULT_LOCALE, loadWorkspace, portableToEditorBlocks, saveWorkspace, STORAGE_KEY, type Notebook, type Workspace } from "./workspace";
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

function unknownReferences(text: string, idByName: Record<string, string>): string[] {
  return [...text.matchAll(/@([A-Za-z_][A-Za-z0-9_]*)/g)]
    .map((match) => match[1])
    .filter((name, index, names) => !Object.prototype.hasOwnProperty.call(idByName, name) && names.indexOf(name) === index)
    .map((name) => `Unknown @${name} left as literal text.`);
}

function slimBlock(block: any): any {
  const base: Record<string, unknown> = { id: block.id, type: block.type };
  if (["heading", "paragraph", "bulletListItem", "numberedListItem", "checkListItem"].includes(block.type)) {
    base.text = textContent(block);
    if (block.type === "heading") base.level = block.props?.level ?? 2;
  } else if (["number", "slider", "select", "boolean"].includes(block.type)) {
    const props = block.props ?? {};
    Object.assign(base, { name: props.name, label: props.label, value: props.value, format: props.format });
    if (props.format === "currency") base.currency = props.currency;
    if (props.format === "unit") base.unit = props.unit;
    if (props.decimals >= 0) base.decimals = props.decimals;
    if (block.type === "number" || block.type === "slider") {
      if (props.min !== undefined && props.min !== null) base.min = props.min;
      if (props.max !== undefined && props.max !== null) base.max = props.max;
      if (props.step !== undefined) base.step = props.step;
    }
    if (block.type === "select") base.options = typeof props.options === "string" ? parseSelectOptions(props.options) : props.options;
  } else if (block.type === "formula") {
    Object.assign(base, { name: block.props?.name, label: block.props?.label, formula: block.props?.formula });
  } else {
    base.text = textContent(block);
  }
  if (Array.isArray(block.children) && block.children.length) base.children = block.children.map(slimBlock);
  return base;
}

function mutationResult(before: any[], after: any[], workspace: Workspace, extra: Record<string, unknown> = {}) {
  const previous = evaluateModel(projectDocument(before), workspace);
  const evaluated = evaluateModel(projectDocument(after), workspace);
  const changed: Record<string, string> = Object.create(null);
  for (const variable of evaluated.variables) {
    const old = previous.byId[variable.varId];
    if (!old || variable.status !== "ok" || old.status !== variable.status || old.value !== variable.value || old.formatted !== variable.formatted || old.error !== variable.error) {
      changed[variable.name] = variable.formatted;
    }
  }
  return {
    composition: getComposition(after),
    errors: evaluated.variables.filter((variable) => variable.status !== "ok").map((variable) => ({ name: variable.name, status: variable.status, error: variable.error })),
    changed,
    ...extra,
  };
}

function NotebookEditor({ notebook, workspace, onSave, expose }: { notebook: Notebook; workspace: Workspace; onSave: (blocks: unknown[]) => void; expose: (editor: ModeloEditor | null) => void }) {
  const initial = useMemo(() => {
    const blocks = portableToEditorBlocks(notebook.blocks as any[]);
    return blocks.length ? blocks : [{ type: "paragraph", content: "" }];
  }, [notebook.id]);
  const editor = useCreateBlockNote({ schema: modeloSchema, initialContent: initial as any });
  const [documentBlocks, setDocumentBlocks] = useState<any[]>(() => editor.document as any[]);
  useEffect(() => { expose(editor); return () => expose(null); }, [editor, expose]);

  const model = useMemo(() => {
    try { return evaluateModel(projectDocument(documentBlocks), workspace); }
    catch (error) { console.warn("Model projection error", error); return { variables: [], byId: {}, byName: {} }; }
  }, [documentBlocks, workspace.currency, workspace.locale]);

  const slashItems = useCallback(async (query: string) => {
    const insert = (kind: "number"|"slider"|"select"|"boolean"|"formula") => ({
      title: kind === "boolean" ? "Toggle" : kind[0].toUpperCase() + kind.slice(1),
      subtext: kind === "formula" ? "Computed MathJS expression" : `Named ${kind} input`,
      group: "Modelo",
      onItemClick: () => {
        const block = editor.getTextCursorPosition().block;
        editor.transact(() => editor.updateBlock(block, { type: kind, props: newVariableProps(kind) } as any));
      },
    });
    const all = [...getDefaultReactSlashMenuItems(editor), insert("number"), insert("slider"), insert("select"), insert("boolean"), insert("formula")];
    const q = query.toLowerCase();
    return all.filter((item) => item.title.toLowerCase().includes(q) || item.subtext?.toLowerCase().includes(q));
  }, [editor]);

  const refItems = useCallback(async (query: string) => model.variables
    .filter((variable) => variable.name.toLowerCase().includes(query.toLowerCase()))
    .map((variable) => ({ title: variable.name, subtext: variable.formatted, onItemClick: () => editor.insertInlineContent([{ type: "variableRef", props: { varId: variable.varId, label: variable.name } }] as any) })), [editor, model]);

  return <ModelProvider value={model}>
    <div className="editor-shell">
      <BlockNoteView editor={editor} theme="light" slashMenu={false} onChange={() => {
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
        list: () => ok({ currency: workspaceRef.current.currency, locale: workspaceRef.current.locale, notebooks: workspaceRef.current.notebooks.map(({ id, title, updatedAt }) => ({ id, title, updatedAt })), openNotebookId: openIdRef.current }),
        open: ({ id }) => { if (!workspaceRef.current.notebooks.some((n) => n.id === id)) fault("NOT_FOUND", `Notebook '${id}' not found.`); setOpenId(id); return ok({ id }); },
        create: ({ name }) => { const notebook = { id: uid(), title: name.trim() || "Untitled", blocks: [], updatedAt: new Date().toISOString() }; updateWorkspace((w) => ({ ...w, notebooks: [...w.notebooks, notebook] })); setOpenId(notebook.id); return ok({ ...notebook, currency: workspaceRef.current.currency, locale: workspaceRef.current.locale, composition: getComposition([]) }); },
        duplicate: ({ id, name }) => { const source = workspaceRef.current.notebooks.find((n) => n.id === id) ?? fault("NOT_FOUND", `Notebook '${id}' not found.`); const copy = { ...JSON.parse(JSON.stringify(source)), id: uid(), title: name ?? `${source.title} copy`, updatedAt: new Date().toISOString() }; updateWorkspace((w) => ({ ...w, notebooks: [...w.notebooks, copy] })); return ok(copy); },
        delete: ({ id }) => { if (!workspaceRef.current.notebooks.some((n) => n.id === id)) fault("NOT_FOUND", `Notebook '${id}' not found.`); updateWorkspace((w) => ({ ...w, notebooks: w.notebooks.filter((n) => n.id !== id) })); if (openIdRef.current === id) setOpenId(null); return ok({ id }); },
        rename: ({ id, name }) => { updateWorkspace((w) => ({ ...w, notebooks: w.notebooks.map((n) => n.id === id ? { ...n, title: name.trim() || n.title, updatedAt: new Date().toISOString() } : n) })); return ok({ id, name }); },
      },
      notebook: openId ? {
        getDocument: () => { const blocks = currentEditor().document as any[]; return ok({ notebook: { id: currentNotebook().id, title: currentNotebook().title }, blocks: blocks.map((block, i) => ({ ...slimBlock(block), previousId: blocks[i-1]?.id ?? null, nextId: blocks[i+1]?.id ?? null })), composition: getComposition(blocks as any) }); },
        getModel: (args) => ok(getModelSummary(currentEditor().document as any, workspaceRef.current, args)),
        findReferences: (args) => { try { return ok(findReferences(currentEditor().document as any, args)); } catch { return fault("NOT_FOUND", `Variable '${args.name ?? args.varId}' not found.`); } },
        writeSection: (args) => {
          const editor = currentEditor();
          const before = JSON.parse(JSON.stringify(editor.document));
          const model = projectDocument(editor.document as any);
          const names = [...(args.inputs ?? []), ...(args.formulas ?? [])].map((item) => item.name);
          const seen = new Set<string>();
          for (const name of names) { ensureUniqueName(name); if (seen.has(name)) fault("DUPLICATE_VARIABLE_NAME", `Variable '${name}' already exists.`); seen.add(name); }
          const portable = buildSectionBlocks(args, model.idByName, uid);
          const finalNames = { ...model.idByName, ...Object.fromEntries(portable.filter((block) => block.props?.name).map((block) => [block.props.name, block.props.varId])) };
          const warnings = unknownReferences(args.body, finalNames);
          const converted = portableToEditorBlocks(portable, finalNames);
          editor.transact(() => { if (args.referenceBlockId) editor.insertBlocks(converted as any, args.referenceBlockId, args.placement ?? "after"); else if (editor.document.length === 1 && editor.document[0].type === "paragraph" && textContent(editor.document[0]) === "") editor.replaceBlocks(editor.document, converted as any); else editor.insertBlocks(converted as any, editor.document.at(-1)!, "after"); });
          return ok(mutationResult(before, editor.document as any[], workspaceRef.current, { insertedBlockIds: converted.map((block) => block.id), warnings }));
        },
        writeSections: ({ sections }) => {
          const editor = currentEditor();
          const before = JSON.parse(JSON.stringify(editor.document));
          const model = projectDocument(editor.document as any);
          const idByName = Object.assign(Object.create(null) as Record<string, string>, model.idByName);
          const seen = new Set<string>();
          const prepared = sections.map((section) => {
            if (section.referenceBlockId && !editor.getBlock(section.referenceBlockId)) fault("NOT_FOUND", `Block '${section.referenceBlockId}' not found.`);
            for (const item of [...(section.inputs ?? []), ...(section.formulas ?? [])]) {
              if (Object.prototype.hasOwnProperty.call(idByName, item.name) || seen.has(item.name)) fault("DUPLICATE_VARIABLE_NAME", `Variable '${item.name}' already exists.`);
              seen.add(item.name);
            }
            const portable = buildSectionBlocks(section, idByName, uid);
            for (const block of portable) if (block.props?.name) idByName[block.props.name] = block.props.varId;
            return { section, portable };
          });
          const warnings = prepared.flatMap(({ section }) => unknownReferences(section.body, idByName));
          const converted = prepared.map(({ section, portable }) => ({ section, blocks: portableToEditorBlocks(portable, idByName) }));
          editor.transact(() => {
            const afterAnchors = new Map<string, string>();
            for (const { section, blocks } of converted) {
              if (section.referenceBlockId) {
                const anchor = section.placement === "after" ? (afterAnchors.get(section.referenceBlockId) ?? section.referenceBlockId) : section.referenceBlockId;
                editor.insertBlocks(blocks as any, anchor, section.placement ?? "after");
                if ((section.placement ?? "after") === "after") afterAnchors.set(section.referenceBlockId, blocks.at(-1)!.id);
              } else if (editor.document.length === 1 && editor.document[0].type === "paragraph" && textContent(editor.document[0]) === "") editor.replaceBlocks(editor.document, blocks as any);
              else editor.insertBlocks(blocks as any, editor.document.at(-1)!, "after");
            }
          });
          const ids = converted.flatMap((entry) => entry.blocks.map((block) => block.id));
          return ok(mutationResult(before, editor.document as any[], workspaceRef.current, { insertedBlockIds: ids, warnings }));
        },
        insertBlocks: ({ blocks, referenceBlockId, placement }) => {
          const editor = currentEditor();
          const before = JSON.parse(JSON.stringify(editor.document));
          const model = projectDocument(editor.document as any);
          const idByName = Object.assign(Object.create(null) as Record<string, string>, model.idByName);
          const seen = new Set<string>();
          const portable = (blocks as any[]).map((block) => {
            const next = { ...block, id: block.id || uid() };
            if (["number", "slider", "select", "boolean", "formula"].includes(block.type)) {
              ensureUniqueName(block.name);
              if (seen.has(block.name)) fault("DUPLICATE_VARIABLE_NAME", `Variable '${block.name}' already exists.`);
              seen.add(block.name);
              const varId = block.varId || uid();
              idByName[block.name] = varId;
              next.varId = varId;
              if (block.type === "boolean") next.value = block.value ? 1 : 0;
              if (block.currency && !block.format) next.format = "currency";
              else if (block.unit && !block.format) next.format = "unit";
            }
            return next;
          });
          const warnings = portable.flatMap((block) => block.type === "paragraph" && typeof block.text === "string" ? unknownReferences(block.text, idByName) : []);
          const converted = portableToEditorBlocks(portable, idByName);
          editor.transact(() => { if (referenceBlockId) editor.insertBlocks(converted as any, referenceBlockId, placement ?? "after"); else if (editor.document.length === 1 && editor.document[0].type === "paragraph" && textContent(editor.document[0]) === "") editor.replaceBlocks(editor.document, converted as any); else editor.insertBlocks(converted as any, editor.document.at(-1)!, "after"); });
          return ok(mutationResult(before, editor.document as any[], workspaceRef.current, { insertedBlockIds: converted.map((block) => block.id), warnings }));
        },
        updateBlock: (args) => {
          const editor = currentEditor();
          const { id, ...fields } = args as any;
          const block = editor.getBlock(id) as any;
          if (!block) fault("NOT_FOUND", `Block '${id}' not found.`);
          const before = JSON.parse(JSON.stringify(editor.document));
          const keys = Object.keys(fields);
          const inputFields: Record<string, Set<string>> = {
            number: new Set(["name", "label", "value", "format", "currency", "unit", "decimals", "min", "max", "step"]),
            slider: new Set(["name", "label", "value", "format", "currency", "unit", "decimals", "min", "max", "step"]),
            select: new Set(["name", "label", "value", "options"]),
            boolean: new Set(["name", "label", "value"]),
          };
          if (block.type === "formula") {
            if (keys.length !== 1 || keys[0] !== "formula") fault("INVALID_UPDATE", "Formula updates require exactly { id, formula }.");
          } else if (["heading", "paragraph", "bulletListItem", "numberedListItem", "checkListItem"].includes(block.type)) {
            const allowed = block.type === "heading" ? new Set(["text", "level"]) : new Set(["text"]);
            if (!keys.length || keys.some((key) => !allowed.has(key))) fault("INVALID_UPDATE", `Fields are not valid for ${block.type}.`);
          } else if (inputFields[block.type]) {
            if (!keys.length || keys.some((key) => !inputFields[block.type].has(key))) fault("INVALID_UPDATE", `Fields are not valid for ${block.type}.`);
            for (const key of ["value", "min", "max", "step", "decimals"]) if (fields[key] !== undefined && !Number.isFinite(fields[key])) fault("INVALID_VALUE", `${key} must be finite.`);
            if (fields.step !== undefined && fields.step <= 0) fault("INVALID_VALUE", "step must be positive.");
            if (fields.decimals !== undefined && (!Number.isInteger(fields.decimals) || fields.decimals < 0 || fields.decimals > 8)) fault("INVALID_VALUE", "decimals must be an integer from 0 to 8.");
            const min = fields.min ?? block.props.min;
            const max = fields.max ?? block.props.max;
            if (min !== undefined && max !== undefined && min > max) fault("INVALID_VALUE", "min must not exceed max.");
            if (block.type === "slider") {
              const value = fields.value ?? block.props.value;
              fields.value = Math.min(max, Math.max(min, value));
            }
            const format = fields.format ?? block.props.format;
            if (format === "unit" && !(fields.unit ?? block.props.unit)) fault("INVALID_VALUE", "unit format requires a unit.");
          } else fault("INVALID_UPDATE", `Block type '${block.type}' is not supported by update_block.`);
          const nextName = fields.name;
          if (nextName && nextName !== block.props?.name) ensureUniqueName(nextName, block.props?.varId);
          const props = { ...fields };
          delete props.text; delete props.level;
          if (Array.isArray(props.options)) props.options = JSON.stringify(props.options);
          editor.transact(() => {
            if (nextName && nextName !== block.props?.name) editor.replaceBlocks(editor.document, renameVariable(editor.document as any, block.props.varId, nextName) as any);
            if ("text" in fields || "level" in fields) {
              const content = "text" in fields ? portableToEditorBlocks([{ type: "paragraph", text: fields.text }])[0].content : undefined;
              editor.updateBlock(id, { ...(content !== undefined ? { content } : {}), ...(fields.level !== undefined ? { props: { level: fields.level } } : {}) } as any);
            } else if (Object.keys(props).length) editor.updateBlock(id, { props } as any);
          });
          return ok(mutationResult(before, editor.document as any[], workspaceRef.current, { id }));
        },
        removeBlocks: ({ ids }) => {
          const editor = currentEditor();
          const missing = ids.filter((id) => !editor.getBlock(id));
          if (missing.length) fault("NOT_FOUND", "Some blocks do not exist.", { ids: missing });
          const before = JSON.parse(JSON.stringify(editor.document));
          editor.transact(() => editor.removeBlocks(ids));
          return ok(mutationResult(before, editor.document as any[], workspaceRef.current, { removed: ids }));
        },
        removeVariable: (args) => {
          const editor = currentEditor();
          let references;
          try { references = findReferences(editor.document as any, args); }
          catch { return fault("NOT_FOUND", `Variable '${args.name ?? args.varId}' not found.`); }
          const model = projectDocument(editor.document as any);
          const variable = model.byId[references.varId];
          if (!variable || variable.kind !== "input") fault("READ_ONLY", "Only input variables can be removed with remove_variable.");
          if (!args.force && (references.formulas.length || references.paragraphs.length)) fault("VARIABLE_REFERENCED", `Variable '${references.name}' is still referenced.`, references);
          const before = JSON.parse(JSON.stringify(editor.document));
          editor.transact(() => editor.removeBlocks([variable.blockId]));
          return ok(mutationResult(before, editor.document as any[], workspaceRef.current, {
            removed: { id: variable.blockId, varId: variable.varId, name: variable.name },
            affected: { formulaBlockIds: references.formulas, paragraphBlockIds: references.paragraphs },
          }));
        },
        replaceParagraph: ({ id, text }) => {
          const editor = currentEditor();
          if (!editor.getBlock(id)) fault("NOT_FOUND", `Block '${id}' not found.`);
          const before = JSON.parse(JSON.stringify(editor.document));
          const model = projectDocument(editor.document as any);
          const content = portableToEditorBlocks([{ type: "paragraph", inline: inlineContentFromText(text, model.idByName) }])[0].content;
          editor.transact(() => editor.updateBlock(id, { type: "paragraph", content } as any));
          return ok(mutationResult(before, editor.document as any[], workspaceRef.current, { id }));
        },
        insertInlineRef: ({ blockId, variable }) => {
          const editor = currentEditor();
          const model = projectDocument(editor.document as any);
          const varId = model.idByName[variable];
          if (!varId) fault("NOT_FOUND", `Variable '${variable}' not found.`);
          const block = editor.getBlock(blockId) as any;
          if (!block) fault("NOT_FOUND", `Block '${blockId}' not found.`);
          const before = JSON.parse(JSON.stringify(editor.document));
          const content = [...(block.content ?? []), { type: "variableRef", props: { varId, label: variable } }];
          editor.transact(() => editor.updateBlock(blockId, { content } as any));
          return ok(mutationResult(before, editor.document as any[], workspaceRef.current, { blockId, varId }));
        },
        setVariable: ({ name, value }) => {
          const editor = currentEditor();
          if (!Number.isFinite(value)) fault("INVALID_VALUE", "Value must be finite.");
          const model = projectDocument(editor.document as any);
          const variable = model.byId[model.idByName[name]];
          if (!variable) fault("NOT_FOUND", `Variable '${name}' not found.`);
          const block = editor.getBlock(variable.blockId) as any;
          if (!["number", "slider", "select", "boolean"].includes(block.type)) fault("READ_ONLY", "Formula values are computed and cannot be set.");
          const nextValue = block.type === "boolean" ? (value ? 1 : 0) : block.type === "slider" ? Math.min(block.props.max, Math.max(block.props.min, value)) : value;
          const before = JSON.parse(JSON.stringify(editor.document));
          editor.transact(() => editor.updateBlock(block, { props: { value: nextValue } }));
          return ok(mutationResult(before, editor.document as any[], workspaceRef.current));
        },
      } : null,
    };
  }, [openId, updateWorkspace]);
  const webmcp = useModeloTools(adapter);

  const createNotebook = () => adapter.workspace.create({ name: "Untitled notebook" });
  const deleteNotebook = (id: string) => { if (confirm("Delete this notebook?")) adapter.workspace.delete({ id }); };
  const importWorkspace = (file: File) => file.text().then((text) => { const parsed = JSON.parse(text); if (parsed.version !== 1 || !Array.isArray(parsed.notebooks)) throw new Error("Not a Modelo workspace export"); const normalized = { ...parsed, currency: parsed.currency || DEFAULT_CURRENCY, locale: parsed.locale || DEFAULT_LOCALE }; localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized)); setWorkspace(normalized); setOpenId(normalized.notebooks[0]?.id ?? null); }).catch((error) => alert(error.message));

  return <div className="app">
    <aside className="sidebar">
      <button className="wordmark" onClick={() => setOpenId(null)}>Modelo</button>
      <button className="new-button" onClick={createNotebook}>+ New notebook</button>
      <nav>{workspace.notebooks.map((notebook) => <div className={`notebook-row ${notebook.id === openId ? "active" : ""}`} key={notebook.id}><button className="notebook-link" onClick={() => setOpenId(notebook.id)}>{notebook.title}</button><button title="Duplicate" onClick={() => adapter.workspace.duplicate({ id: notebook.id })}>⧉</button><button title="Delete" onClick={() => deleteNotebook(notebook.id)}>×</button></div>)}</nav>
      <div className="sidebar-footer"><span className={`status ${webmcp.supported ? "on" : ""}`}>{webmcp.supported ? "WebMCP ready" : "WebMCP unavailable"}</span><button onClick={() => download("modelo-workspace.json", workspace)}>Export all</button><label className="import-label">Import<input type="file" accept="application/json" onChange={(e) => e.target.files?.[0] && importWorkspace(e.target.files[0])}/></label></div>
    </aside>
    <main>{openNotebook ? <><header className="notebook-header"><input aria-label="Notebook title" value={openNotebook.title} onChange={(e) => adapter.workspace.rename({ id: openNotebook.id, name: e.target.value })}/><button onClick={() => download(`${openNotebook.title}.json`, openNotebook)}>Export</button></header><NotebookEditor key={openNotebook.id} notebook={openNotebook} workspace={workspace} onSave={saveOpenDocument} expose={expose}/></> : <section className="workspace-home"><p className="eyebrow">Workspace</p><h1>Notebook and model, together.</h1><p>Open a notebook from the left, or create a blank one. Your workspace stays in this browser.</p><button className="primary" onClick={createNotebook}>New notebook</button></section>}</main>
  </div>;
}
