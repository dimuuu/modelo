import { BlockNoteView } from "@blocknote/mantine";
import {
  SuggestionMenuController,
  getDefaultReactSlashMenuItems,
  useCreateBlockNote,
} from "@blocknote/react";
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

import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import {
  ModelProvider,
  modeloSchema,
  newVariableProps,
  parseSelectOptions,
} from "./editor";
import type { ModeloEditor } from "./editor";
import {
  applyScenarioValues,
  buildSectionBlocks,
  evaluateModel,
  findReferences,
  getComposition,
  getModelSummary,
  inlineContentFromText,
  matchingScenarioName,
  projectDocument,
  removeScenario,
  renameVariable,
  snapshotInputs,
  upsertScenario,
} from "./engine";
import type { Scenario } from "./engine";
import { useModeloTools } from "./webmcp/useModeloTools";
import type { ModeloToolsAdapter } from "./webmcp/useModeloTools";
import {
  DEFAULT_CURRENCY,
  DEFAULT_LOCALE,
  loadWorkspace,
  portableToEditorBlocks,
  saveWorkspace,
  STORAGE_KEY,
} from "./workspace";
import type { Notebook, Workspace } from "./workspace";

import "./blocknote-theme.css";

const uid = () => crypto.randomUUID();
const ok = (data: unknown = {}) => ({ data, ok: true });
/**
 * A WebMCP tool failure. `useModeloTools` serialises the public fields into
 * the `{ ok: false, error: { code, message, details? } }` contract.
 */
class ModeloToolError extends Error {
  readonly code: string;
  readonly details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ModeloToolError";
    this.code = code;
    this.details = details;
  }
}

const fault = (code: string, message: string, details?: unknown): never => {
  throw new ModeloToolError(code, message, details);
};

/** The block new content is appended after. A document always has one. */
function lastBlock(editor: ModeloEditor) {
  const block = editor.document.at(-1);
  if (!block) {
    throw new ModeloToolError(
      "EMPTY_DOCUMENT",
      "The notebook has no blocks to append after."
    );
  }
  return block;
}

/** The anchor id a following section inserts after. */
function lastId(blocks: { id: string }[]): string {
  const block = blocks.at(-1);
  if (!block) {
    throw new ModeloToolError(
      "EMPTY_SECTION",
      "The section produced no blocks."
    );
  }
  return block.id;
}

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

function textContent(block: any): string {
  if (!Array.isArray(block.content)) {
    return "";
  }
  return block.content
    .map((node: any) => {
      if (node.type === "text") {
        return node.text;
      }
      if (node.type === "variableRef") {
        return `@${node.props?.label || node.props?.varId}`;
      }
      return "";
    })
    .join("");
}

function unknownReferences(
  text: string,
  idByName: Record<string, string>
): string[] {
  return [...text.matchAll(/@(?<name>[A-Za-z_][A-Za-z0-9_]*)/gu)]
    .map((match) => match[1])
    .filter(
      (name, index, names) =>
        !Object.hasOwn(idByName, name) && names.indexOf(name) === index
    )
    .map((name) => `Unknown @${name} left as literal text.`);
}

function slimBlock(block: any): any {
  const base: Record<string, unknown> = { id: block.id, type: block.type };
  if (
    [
      "heading",
      "paragraph",
      "bulletListItem",
      "numberedListItem",
      "checkListItem",
    ].includes(block.type)
  ) {
    base.text = textContent(block);
    if (block.type === "heading") {
      base.level = block.props?.level ?? 2;
    }
  } else if (["number", "slider", "select", "boolean"].includes(block.type)) {
    const props = block.props ?? {};
    Object.assign(base, {
      format: props.format,
      label: props.label,
      name: props.name,
      value: props.value,
    });
    if (props.format === "currency") {
      base.currency = props.currency;
    }
    if (props.format === "unit") {
      base.unit = props.unit;
    }
    if (props.decimals >= 0) {
      base.decimals = props.decimals;
    }
    if (block.type === "number" || block.type === "slider") {
      if (props.min !== undefined && props.min !== null) {
        base.min = props.min;
      }
      if (props.max !== undefined && props.max !== null) {
        base.max = props.max;
      }
      if (props.step !== undefined) {
        base.step = props.step;
      }
    }
    if (block.type === "select") {
      base.options =
        typeof props.options === "string"
          ? parseSelectOptions(props.options)
          : props.options;
    }
  } else if (block.type === "formula") {
    Object.assign(base, {
      formula: block.props?.formula,
      label: block.props?.label,
      name: block.props?.name,
    });
  } else {
    base.text = textContent(block);
  }
  if (Array.isArray(block.children) && block.children.length) {
    base.children = block.children.map(slimBlock);
  }
  return base;
}

function mutationResult(
  before: any[],
  after: any[],
  workspace: Workspace,
  extra: Record<string, unknown> = {}
) {
  const previous = evaluateModel(projectDocument(before), workspace);
  const evaluated = evaluateModel(projectDocument(after), workspace);
  const changed: Record<string, string> = Object.create(null);
  for (const variable of evaluated.variables) {
    const old = previous.byId[variable.varId];
    if (
      !old ||
      variable.status !== "ok" ||
      old.status !== variable.status ||
      old.value !== variable.value ||
      old.formatted !== variable.formatted ||
      old.error !== variable.error
    ) {
      changed[variable.name] = variable.formatted;
    }
  }
  return {
    changed,
    composition: getComposition(after),
    errors: evaluated.variables
      .filter((variable) => variable.status !== "ok")
      .map((variable) => ({
        error: variable.error,
        name: variable.name,
        status: variable.status,
      })),
    ...extra,
  };
}

function previewInsert(
  document: any[],
  blocks: any[],
  referenceBlockId?: string,
  placement: "before" | "after" = "after"
): any[] {
  if (!referenceBlockId) {
    if (
      document.length === 1 &&
      document[0].type === "paragraph" &&
      textContent(document[0]) === ""
    ) {
      return [...blocks];
    }
    return [...document, ...blocks];
  }
  const index = document.findIndex((block) => block.id === referenceBlockId);
  if (index === -1) {
    fault("NOT_FOUND", `Block '${referenceBlockId}' not found.`);
  }
  const at = placement === "before" ? index : index + 1;
  return [...document.slice(0, at), ...blocks, ...document.slice(at)];
}

function NotebookEditor({
  notebook,
  workspace,
  onSave,
  expose,
}: {
  notebook: Notebook;
  workspace: Workspace;
  onSave: (blocks: unknown[]) => void;
  expose: (editor: ModeloEditor | null) => void;
}) {
  // BlockNote reads initialContent once, when it creates the editor, and owns
  // the document from then on. NotebookEditor is keyed by notebook id, so
  // switching notebooks remounts with fresh content.
  const converted = portableToEditorBlocks(notebook.blocks as any[]);
  const initial = converted.length
    ? converted
    : [{ content: "", type: "paragraph" }];
  const editor = useCreateBlockNote({
    initialContent: initial as any,
    schema: modeloSchema,
  });
  const [documentBlocks, setDocumentBlocks] = useState<any[]>(
    () => editor.document as any[]
  );
  useEffect(() => {
    expose(editor);
    return () => expose(null);
  }, [editor, expose]);

  const formatDefaults = useMemo(
    () => ({ currency: workspace.currency, locale: workspace.locale }),
    [workspace.currency, workspace.locale]
  );

  const model = useMemo(() => {
    try {
      return evaluateModel(projectDocument(documentBlocks), formatDefaults);
    } catch (error) {
      console.warn("Model projection error", error);
      return { byId: {}, byName: {}, variables: [] };
    }
  }, [documentBlocks, formatDefaults]);

  const slashItems = useCallback(
    (query: string) => {
      const insert = (
        kind: "number" | "slider" | "select" | "boolean" | "formula"
      ) => ({
        group: "Modelo",
        onItemClick: () => {
          const { block } = editor.getTextCursorPosition();
          editor.transact(() =>
            editor.updateBlock(block, {
              props: newVariableProps(kind),
              type: kind,
            } as any)
          );
        },
        subtext:
          kind === "formula"
            ? "Computed MathJS expression"
            : `Named ${kind} input`,
        title:
          kind === "boolean" ? "Toggle" : kind[0].toUpperCase() + kind.slice(1),
      });
      const all = [
        ...getDefaultReactSlashMenuItems(editor),
        insert("number"),
        insert("slider"),
        insert("select"),
        insert("boolean"),
        insert("formula"),
      ];
      const q = query.toLowerCase();
      return Promise.resolve(
        all.filter(
          (item) =>
            item.title.toLowerCase().includes(q) ||
            item.subtext?.toLowerCase().includes(q)
        )
      );
    },
    [editor]
  );

  const refItems = useCallback(
    (query: string) =>
      Promise.resolve(
        model.variables
          .filter((variable) =>
            variable.name.toLowerCase().includes(query.toLowerCase())
          )
          .map((variable) => ({
            onItemClick: () =>
              editor.insertInlineContent([
                {
                  props: { label: variable.name, varId: variable.varId },
                  type: "variableRef",
                },
              ] as any),
            subtext: variable.formatted,
            title: variable.name,
          }))
      ),
    [editor, model]
  );

  return (
    <ModelProvider value={model}>
      <div className="mx-auto max-w-[900px] pb-24">
        <BlockNoteView
          editor={editor}
          theme="light"
          slashMenu={false}
          onChange={() => {
            const next = editor.document as any[];
            setDocumentBlocks([...next]);
            onSave(JSON.parse(JSON.stringify(next)));
          }}
        >
          <SuggestionMenuController
            triggerCharacter="/"
            getItems={slashItems}
          />
          <SuggestionMenuController triggerCharacter="@" getItems={refItems} />
        </BlockNoteView>
      </div>
    </ModelProvider>
  );
}

export default function App() {
  const [workspace, setWorkspace] = useState<Workspace>(() => loadWorkspace());
  const [openId, setOpenId] = useState<string | null>(
    () => loadWorkspace().notebooks[0]?.id ?? null
  );
  const [scenarioDialogOpen, setScenarioDialogOpen] = useState(false);
  const [scenarioName, setScenarioName] = useState("");
  const [pendingDelete, setPendingDelete] = useState<
    | { kind: "notebook"; id: string; title: string }
    | { kind: "scenario"; name: string }
    | null
  >(null);
  const editorRef = useRef<ModeloEditor | null>(null);
  const workspaceRef = useRef(workspace);
  const openIdRef = useRef(openId);
  useEffect(() => {
    workspaceRef.current = workspace;
    saveWorkspace(workspace);
  }, [workspace]);
  useEffect(() => {
    openIdRef.current = openId;
  }, [openId]);
  const openNotebook =
    workspace.notebooks.find((item) => item.id === openId) ?? null;

  const updateWorkspace = useCallback(
    (fn: (current: Workspace) => Workspace) => {
      const next = fn(workspaceRef.current);
      workspaceRef.current = next;
      setWorkspace(next);
      saveWorkspace(next);
      return next;
    },
    []
  );
  const saveOpenDocument = useCallback(
    (blocks: unknown[]) =>
      updateWorkspace((current) => ({
        ...current,
        notebooks: current.notebooks.map((n) =>
          n.id === openIdRef.current
            ? { ...n, blocks, updatedAt: new Date().toISOString() }
            : n
        ),
      })),
    [updateWorkspace]
  );
  const expose = useCallback((editor: ModeloEditor | null) => {
    editorRef.current = editor;
  }, []);

  const adapter = useMemo<ModeloToolsAdapter>(() => {
    const currentEditor = () =>
      editorRef.current ?? fault("NO_NOTEBOOK_OPEN", "Open a notebook first.");
    const currentNotebook = () =>
      workspaceRef.current.notebooks.find((n) => n.id === openIdRef.current) ??
      fault("NO_NOTEBOOK_OPEN", "Open a notebook first.");
    const ensureUniqueName = (name: string, exceptId?: string) => {
      const model = projectDocument(currentEditor().document as any);
      const found = model.idByName[name];
      if (found && found !== exceptId) {
        fault("DUPLICATE_VARIABLE_NAME", `Variable '${name}' already exists.`);
      }
    };
    const prepareUpdate = (editor: ModeloEditor, args: any) => {
      const { id, ...fields } = args;
      const block = editor.getBlock(id) as any;
      if (!block) {
        fault("NOT_FOUND", `Block '${id}' not found.`);
      }
      const keys = Object.keys(fields);
      const inputFields: Record<string, Set<string>> = {
        boolean: new Set(["name", "label", "value"]),
        number: new Set([
          "name",
          "label",
          "value",
          "format",
          "currency",
          "unit",
          "decimals",
          "min",
          "max",
          "step",
        ]),
        select: new Set(["name", "label", "value", "options"]),
        slider: new Set([
          "name",
          "label",
          "value",
          "format",
          "currency",
          "unit",
          "decimals",
          "min",
          "max",
          "step",
        ]),
      };
      if (block.type === "formula") {
        if (keys.length !== 1 || keys[0] !== "formula") {
          fault(
            "INVALID_UPDATE",
            "Formula updates require exactly { id, formula }."
          );
        }
      } else if (
        [
          "heading",
          "paragraph",
          "bulletListItem",
          "numberedListItem",
          "checkListItem",
        ].includes(block.type)
      ) {
        const allowed =
          block.type === "heading"
            ? new Set(["text", "level"])
            : new Set(["text"]);
        if (!keys.length || keys.some((key) => !allowed.has(key))) {
          fault("INVALID_UPDATE", `Fields are not valid for ${block.type}.`);
        }
      } else if (inputFields[block.type]) {
        if (
          !keys.length ||
          keys.some((key) => !inputFields[block.type].has(key))
        ) {
          fault("INVALID_UPDATE", `Fields are not valid for ${block.type}.`);
        }
        for (const key of ["value", "min", "max", "step", "decimals"]) {
          if (fields[key] !== undefined && !Number.isFinite(fields[key])) {
            fault("INVALID_VALUE", `${key} must be finite.`);
          }
        }
        if (fields.step !== undefined && fields.step <= 0) {
          fault("INVALID_VALUE", "step must be positive.");
        }
        if (
          fields.decimals !== undefined &&
          (!Number.isInteger(fields.decimals) ||
            fields.decimals < 0 ||
            fields.decimals > 8)
        ) {
          fault("INVALID_VALUE", "decimals must be an integer from 0 to 8.");
        }
        const min = fields.min ?? block.props.min;
        const max = fields.max ?? block.props.max;
        if (min !== undefined && max !== undefined && min > max) {
          fault("INVALID_VALUE", "min must not exceed max.");
        }
        if (block.type === "slider") {
          const value = fields.value ?? block.props.value;
          fields.value = Math.min(max, Math.max(min, value));
        }
        const format = fields.format ?? block.props.format;
        if (format === "unit" && !(fields.unit ?? block.props.unit)) {
          fault("INVALID_VALUE", "unit format requires a unit.");
        }
      } else {
        fault(
          "INVALID_UPDATE",
          `Block type '${block.type}' is not supported by update_block.`
        );
      }
      const nextName = fields.name;
      if (nextName && nextName !== block.props?.name) {
        ensureUniqueName(nextName, block.props?.varId);
      }
      const props = { ...fields };
      delete props.text;
      delete props.level;
      if (Array.isArray(props.options)) {
        props.options = JSON.stringify(props.options);
      }
      return { block, fields, id, nextName, props };
    };
    const applyUpdate = (
      editor: ModeloEditor,
      update: ReturnType<typeof prepareUpdate>
    ) => {
      const { id, fields, block, nextName, props } = update;
      if (nextName && nextName !== block.props?.name) {
        editor.replaceBlocks(
          editor.document,
          renameVariable(
            editor.document as any,
            block.props.varId,
            nextName
          ) as any
        );
      }
      if ("text" in fields || "level" in fields) {
        const content =
          "text" in fields
            ? portableToEditorBlocks([
                { text: fields.text, type: "paragraph" },
              ])[0].content
            : undefined;
        editor.updateBlock(id, {
          ...(content === undefined ? {} : { content }),
          ...(fields.level === undefined
            ? {}
            : { props: { level: fields.level } }),
        } as any);
      } else if (Object.keys(props).length) {
        editor.updateBlock(id, { props } as any);
      }
    };
    return {
      notebook: openId
        ? {
            applyScenario: ({ name }) => {
              const editor = currentEditor();
              const scenario = (currentNotebook().scenarios ?? []).find(
                (item) => item.name === name
              );
              if (!scenario) {
                return fault("NOT_FOUND", `Scenario '${name}' not found.`);
              }
              const before = JSON.parse(JSON.stringify(editor.document));
              const model = projectDocument(before);
              const inputIds = new Set(
                model.variables
                  .filter((variable) => variable.kind === "input")
                  .map((variable) => variable.varId)
              );
              const warnings = Object.keys(scenario.values)
                .filter((varId) => !inputIds.has(varId))
                .map((varId) => `Unknown input id '${varId}' skipped.`);
              const next = applyScenarioValues(before, scenario.values);
              editor.transact(() =>
                editor.replaceBlocks(editor.document, next as any)
              );
              const { errors, changed } = mutationResult(
                before,
                editor.document as any[],
                workspaceRef.current
              );
              return ok({ changed, errors, warnings });
            },
            deleteScenario: ({ name }) => {
              const notebook = currentNotebook();
              if (
                !(notebook.scenarios ?? []).some(
                  (scenario) => scenario.name === name
                )
              ) {
                fault("NOT_FOUND", `Scenario '${name}' not found.`);
              }
              updateWorkspace((current) => ({
                ...current,
                notebooks: current.notebooks.map((item) =>
                  item.id === notebook.id
                    ? {
                        ...item,
                        scenarios: removeScenario(item.scenarios ?? [], name),
                        updatedAt: new Date().toISOString(),
                      }
                    : item
                ),
              }));
              return ok({ name });
            },
            findReferences: (args) => {
              try {
                return ok(
                  findReferences(currentEditor().document as any, args)
                );
              } catch {
                return fault(
                  "NOT_FOUND",
                  `Variable '${args.name ?? args.varId}' not found.`
                );
              }
            },
            getDocument: () => {
              const blocks = currentEditor().document as any[];
              return ok({
                blocks: blocks.map((block, i) => ({
                  ...slimBlock(block),
                  nextId: blocks[i + 1]?.id ?? null,
                  previousId: blocks[i - 1]?.id ?? null,
                })),
                composition: getComposition(blocks as any),
                notebook: {
                  id: currentNotebook().id,
                  title: currentNotebook().title,
                },
              });
            },
            getModel: (args) =>
              ok(
                getModelSummary(
                  currentEditor().document as any,
                  workspaceRef.current,
                  args
                )
              ),
            insertBlocks: ({ blocks, referenceBlockId, placement }) => {
              const editor = currentEditor();
              const before = JSON.parse(JSON.stringify(editor.document));
              const model = projectDocument(editor.document as any);
              const idByName = Object.assign(
                Object.create(null) as Record<string, string>,
                model.idByName
              );
              const seen = new Set<string>();
              const portable = (blocks as any[]).map((block) => {
                const next = { ...block, id: block.id || uid() };
                if (
                  ["number", "slider", "select", "boolean", "formula"].includes(
                    block.type
                  )
                ) {
                  ensureUniqueName(block.name);
                  if (seen.has(block.name)) {
                    fault(
                      "DUPLICATE_VARIABLE_NAME",
                      `Variable '${block.name}' already exists.`
                    );
                  }
                  seen.add(block.name);
                  const varId = block.varId || uid();
                  idByName[block.name] = varId;
                  next.varId = varId;
                  if (block.type === "boolean") {
                    next.value = block.value ? 1 : 0;
                  }
                  if (block.currency && !block.format) {
                    next.format = "currency";
                  } else if (block.unit && !block.format) {
                    next.format = "unit";
                  }
                }
                return next;
              });
              const warnings = portable.flatMap((block) =>
                block.type === "paragraph" && typeof block.text === "string"
                  ? unknownReferences(block.text, idByName)
                  : []
              );
              const converted = portableToEditorBlocks(portable, idByName);
              editor.transact(() => {
                if (referenceBlockId) {
                  editor.insertBlocks(
                    converted as any,
                    referenceBlockId,
                    placement ?? "after"
                  );
                } else if (
                  editor.document.length === 1 &&
                  editor.document[0].type === "paragraph" &&
                  textContent(editor.document[0]) === ""
                ) {
                  editor.replaceBlocks(editor.document, converted as any);
                } else {
                  editor.insertBlocks(
                    converted as any,
                    lastBlock(editor),
                    "after"
                  );
                }
              });
              return ok(
                mutationResult(
                  before,
                  editor.document as any[],
                  workspaceRef.current,
                  {
                    insertedBlockIds: converted.map((block) => block.id),
                    warnings,
                  }
                )
              );
            },
            insertInlineRef: ({ blockId, variable }) => {
              const editor = currentEditor();
              const model = projectDocument(editor.document as any);
              const varId = model.idByName[variable];
              if (!varId) {
                fault("NOT_FOUND", `Variable '${variable}' not found.`);
              }
              const block = editor.getBlock(blockId) as any;
              if (!block) {
                fault("NOT_FOUND", `Block '${blockId}' not found.`);
              }
              const before = JSON.parse(JSON.stringify(editor.document));
              const content = [
                ...(block.content ?? []),
                { props: { label: variable, varId }, type: "variableRef" },
              ];
              editor.transact(() =>
                editor.updateBlock(blockId, { content } as any)
              );
              return ok(
                mutationResult(
                  before,
                  editor.document as any[],
                  workspaceRef.current,
                  { blockId, varId }
                )
              );
            },
            listScenarios: () => {
              const notebook = currentNotebook();
              const scenarios = notebook.scenarios ?? [];
              return ok({
                active: matchingScenarioName(
                  currentEditor().document as any,
                  scenarios
                ),
                scenarios: scenarios.map(({ id, name }) => ({ id, name })),
              });
            },
            removeBlocks: ({ ids }) => {
              const editor = currentEditor();
              const missing = ids.filter((id) => !editor.getBlock(id));
              if (missing.length) {
                fault("NOT_FOUND", "Some blocks do not exist.", {
                  ids: missing,
                });
              }
              const before = JSON.parse(JSON.stringify(editor.document));
              editor.transact(() => editor.removeBlocks(ids));
              return ok(
                mutationResult(
                  before,
                  editor.document as any[],
                  workspaceRef.current,
                  { removed: ids }
                )
              );
            },
            removeVariable: (args) => {
              const editor = currentEditor();
              let references;
              try {
                references = findReferences(editor.document as any, args);
              } catch {
                return fault(
                  "NOT_FOUND",
                  `Variable '${args.name ?? args.varId}' not found.`
                );
              }
              const model = projectDocument(editor.document as any);
              const variable = model.byId[references.varId];
              if (!variable || variable.kind !== "input") {
                fault(
                  "READ_ONLY",
                  "Only input variables can be removed with remove_variable."
                );
              }
              if (
                !args.force &&
                (references.formulas.length || references.paragraphs.length)
              ) {
                fault(
                  "VARIABLE_REFERENCED",
                  `Variable '${references.name}' is still referenced.`,
                  references
                );
              }
              const before = JSON.parse(JSON.stringify(editor.document));
              editor.transact(() => editor.removeBlocks([variable.blockId]));
              return ok(
                mutationResult(
                  before,
                  editor.document as any[],
                  workspaceRef.current,
                  {
                    affected: {
                      formulaBlockIds: references.formulas,
                      paragraphBlockIds: references.paragraphs,
                    },
                    removed: {
                      id: variable.blockId,
                      name: variable.name,
                      varId: variable.varId,
                    },
                  }
                )
              );
            },
            replaceParagraph: ({ id, text }) => {
              const editor = currentEditor();
              if (!editor.getBlock(id)) {
                fault("NOT_FOUND", `Block '${id}' not found.`);
              }
              const before = JSON.parse(JSON.stringify(editor.document));
              const model = projectDocument(editor.document as any);
              const [{ content }] = portableToEditorBlocks([
                {
                  inline: inlineContentFromText(text, model.idByName),
                  type: "paragraph",
                },
              ]);
              editor.transact(() =>
                editor.updateBlock(id, { content, type: "paragraph" } as any)
              );
              return ok(
                mutationResult(
                  before,
                  editor.document as any[],
                  workspaceRef.current,
                  { id }
                )
              );
            },
            saveScenario: ({ name, values }) => {
              const trimmedName = name.trim();
              if (!trimmedName) {
                fault("INVALID_NAME", "Scenario name cannot be empty.");
              }
              const editor = currentEditor();
              const notebook = currentNotebook();
              const warnings: string[] = [];
              let savedValues: Record<string, number>;
              if (values === undefined) {
                savedValues = snapshotInputs(editor.document as any);
              } else {
                savedValues = Object.create(null);
                const model = projectDocument(editor.document as any);
                for (const [variableName, value] of Object.entries(values)) {
                  if (!Number.isFinite(value)) {
                    fault(
                      "INVALID_VALUE",
                      `Value for '${variableName}' must be finite.`
                    );
                  }
                  const variable = model.byId[model.idByName[variableName]];
                  if (!variable || variable.kind !== "input") {
                    warnings.push(`Unknown input '${variableName}' skipped.`);
                  } else {
                    savedValues[variable.varId] = value;
                  }
                }
              }
              const existing = (notebook.scenarios ?? []).find(
                (scenario) => scenario.name === trimmedName
              );
              const scenario = {
                id: existing?.id ?? uid(),
                name: trimmedName,
                values: savedValues,
              };
              let scenarios: Scenario[];
              try {
                scenarios = upsertScenario(notebook.scenarios ?? [], scenario);
              } catch (error) {
                fault("SCENARIO_LIMIT", (error as Error).message);
              }
              updateWorkspace((current) => ({
                ...current,
                notebooks: current.notebooks.map((item) =>
                  item.id === notebook.id
                    ? {
                        ...item,
                        scenarios,
                        updatedAt: new Date().toISOString(),
                      }
                    : item
                ),
              }));
              return ok({
                scenario: { id: scenario.id, name: scenario.name },
                warnings,
              });
            },
            setVariable: ({ name, value }) => {
              const editor = currentEditor();
              if (!Number.isFinite(value)) {
                fault("INVALID_VALUE", "Value must be finite.");
              }
              const model = projectDocument(editor.document as any);
              const variable = model.byId[model.idByName[name]];
              if (!variable) {
                fault("NOT_FOUND", `Variable '${name}' not found.`);
              }
              const block = editor.getBlock(variable.blockId) as any;
              if (
                !["number", "slider", "select", "boolean"].includes(block.type)
              ) {
                fault(
                  "READ_ONLY",
                  "Formula values are computed and cannot be set."
                );
              }
              const nextValue = (() => {
                if (block.type === "boolean") {
                  return value ? 1 : 0;
                }
                if (block.type === "slider") {
                  return Math.min(
                    block.props.max,
                    Math.max(block.props.min, value)
                  );
                }
                return value;
              })();
              const before = JSON.parse(JSON.stringify(editor.document));
              editor.transact(() =>
                editor.updateBlock(block, { props: { value: nextValue } })
              );
              return ok(
                mutationResult(
                  before,
                  editor.document as any[],
                  workspaceRef.current
                )
              );
            },
            updateBlock: (args) => {
              const editor = currentEditor();
              const before = JSON.parse(JSON.stringify(editor.document));
              const update = prepareUpdate(editor, args);
              editor.transact(() => applyUpdate(editor, update));
              return ok(
                mutationResult(
                  before,
                  editor.document as any[],
                  workspaceRef.current,
                  { id: args.id }
                )
              );
            },
            updateBlocks: ({ blocks }) => {
              const editor = currentEditor();
              const before = JSON.parse(JSON.stringify(editor.document));
              const ids = blocks.map(({ id }) => id);
              if (new Set(ids).size !== ids.length) {
                fault(
                  "INVALID_UPDATE",
                  "Each block may appear only once in update_blocks."
                );
              }
              const updates = blocks.map((args) => prepareUpdate(editor, args));
              const renamed = new Set<string>();
              for (const update of updates) {
                if (
                  update.nextName &&
                  update.nextName !== update.block.props?.name
                ) {
                  if (renamed.has(update.nextName)) {
                    fault(
                      "DUPLICATE_VARIABLE_NAME",
                      `Variable '${update.nextName}' already exists.`
                    );
                  }
                  renamed.add(update.nextName);
                }
              }
              editor.transact(() => {
                for (const update of updates) {
                  applyUpdate(editor, update);
                }
              });
              const { errors, changed } = mutationResult(
                before,
                editor.document as any[],
                workspaceRef.current
              );
              return ok({ changed, errors });
            },
            writeSection: (args) => {
              const editor = currentEditor();
              const before = JSON.parse(JSON.stringify(editor.document));
              const model = projectDocument(editor.document as any);
              const names = [
                ...(args.inputs ?? []),
                ...(args.formulas ?? []),
              ].map((item) => item.name);
              const seen = new Set<string>();
              for (const name of names) {
                ensureUniqueName(name);
                if (seen.has(name)) {
                  fault(
                    "DUPLICATE_VARIABLE_NAME",
                    `Variable '${name}' already exists.`
                  );
                }
                seen.add(name);
              }
              const portable = buildSectionBlocks(args, model.idByName, uid);
              const finalNames = {
                ...model.idByName,
                ...Object.fromEntries(
                  portable
                    .filter((block) => block.props?.name)
                    .map((block) => [block.props.name, block.props.varId])
                ),
              };
              const warnings = unknownReferences(args.body, finalNames);
              const converted = portableToEditorBlocks(portable, finalNames);
              const preview = previewInsert(
                before,
                converted,
                args.referenceBlockId,
                args.placement
              );
              if (args.dry_run) {
                return ok(
                  mutationResult(before, preview, workspaceRef.current, {
                    dry_run: true,
                    insertedBlockIds: converted.map((block) => block.id),
                    warnings,
                  })
                );
              }
              editor.transact(() => {
                if (args.referenceBlockId) {
                  editor.insertBlocks(
                    converted as any,
                    args.referenceBlockId,
                    args.placement ?? "after"
                  );
                } else if (
                  editor.document.length === 1 &&
                  editor.document[0].type === "paragraph" &&
                  textContent(editor.document[0]) === ""
                ) {
                  editor.replaceBlocks(editor.document, converted as any);
                } else {
                  editor.insertBlocks(
                    converted as any,
                    lastBlock(editor),
                    "after"
                  );
                }
              });
              return ok(
                mutationResult(
                  before,
                  editor.document as any[],
                  workspaceRef.current,
                  {
                    insertedBlockIds: converted.map((block) => block.id),
                    warnings,
                  }
                )
              );
            },
            writeSections: ({ sections, dry_run }) => {
              const editor = currentEditor();
              const before = JSON.parse(JSON.stringify(editor.document));
              const model = projectDocument(editor.document as any);
              const idByName = Object.assign(
                Object.create(null) as Record<string, string>,
                model.idByName
              );
              const seen = new Set<string>();
              const prepared = sections.map((section) => {
                if (
                  section.referenceBlockId &&
                  !editor.getBlock(section.referenceBlockId)
                ) {
                  fault(
                    "NOT_FOUND",
                    `Block '${section.referenceBlockId}' not found.`
                  );
                }
                for (const item of [
                  ...(section.inputs ?? []),
                  ...(section.formulas ?? []),
                ]) {
                  if (
                    Object.hasOwn(idByName, item.name) ||
                    seen.has(item.name)
                  ) {
                    fault(
                      "DUPLICATE_VARIABLE_NAME",
                      `Variable '${item.name}' already exists.`
                    );
                  }
                  seen.add(item.name);
                }
                const portable = buildSectionBlocks(section, idByName, uid);
                for (const block of portable) {
                  if (block.props?.name) {
                    idByName[block.props.name] = block.props.varId;
                  }
                }
                return { portable, section };
              });
              const warnings = prepared.flatMap(({ section }) =>
                unknownReferences(section.body, idByName)
              );
              const converted = prepared.map(({ section, portable }) => ({
                blocks: portableToEditorBlocks(portable, idByName),
                section,
              }));
              if (dry_run) {
                let preview = before;
                const afterAnchors = new Map<string, string>();
                for (const { section, blocks } of converted) {
                  const reference =
                    section.referenceBlockId &&
                    (section.placement ?? "after") === "after"
                      ? (afterAnchors.get(section.referenceBlockId) ??
                        section.referenceBlockId)
                      : section.referenceBlockId;
                  preview = previewInsert(
                    preview,
                    blocks,
                    reference,
                    section.placement
                  );
                  if (
                    section.referenceBlockId &&
                    (section.placement ?? "after") === "after"
                  ) {
                    afterAnchors.set(section.referenceBlockId, lastId(blocks));
                  }
                }
                const ids = converted.flatMap((entry) =>
                  entry.blocks.map((block) => block.id)
                );
                return ok(
                  mutationResult(before, preview, workspaceRef.current, {
                    dry_run: true,
                    insertedBlockIds: ids,
                    warnings,
                  })
                );
              }
              editor.transact(() => {
                const afterAnchors = new Map<string, string>();
                for (const { section, blocks } of converted) {
                  if (section.referenceBlockId) {
                    const anchor =
                      (section.placement ?? "after") === "after"
                        ? (afterAnchors.get(section.referenceBlockId) ??
                          section.referenceBlockId)
                        : section.referenceBlockId;
                    editor.insertBlocks(
                      blocks as any,
                      anchor,
                      section.placement ?? "after"
                    );
                    if ((section.placement ?? "after") === "after") {
                      afterAnchors.set(
                        section.referenceBlockId,
                        lastId(blocks)
                      );
                    }
                  } else if (
                    editor.document.length === 1 &&
                    editor.document[0].type === "paragraph" &&
                    textContent(editor.document[0]) === ""
                  ) {
                    editor.replaceBlocks(editor.document, blocks as any);
                  } else {
                    editor.insertBlocks(
                      blocks as any,
                      lastBlock(editor),
                      "after"
                    );
                  }
                }
              });
              const ids = converted.flatMap((entry) =>
                entry.blocks.map((block) => block.id)
              );
              return ok(
                mutationResult(
                  before,
                  editor.document as any[],
                  workspaceRef.current,
                  { insertedBlockIds: ids, warnings }
                )
              );
            },
          }
        : null,
      workspace: {
        create: ({ name }) => {
          const notebook = {
            blocks: [],
            id: uid(),
            scenarios: [],
            title: name.trim() || "Untitled",
            updatedAt: new Date().toISOString(),
          };
          updateWorkspace((w) => ({
            ...w,
            notebooks: [...w.notebooks, notebook],
          }));
          setOpenId(notebook.id);
          return ok({
            ...notebook,
            composition: getComposition([]),
            currency: workspaceRef.current.currency,
            locale: workspaceRef.current.locale,
          });
        },
        delete: ({ id }) => {
          if (!workspaceRef.current.notebooks.some((n) => n.id === id)) {
            fault("NOT_FOUND", `Notebook '${id}' not found.`);
          }
          updateWorkspace((w) => ({
            ...w,
            notebooks: w.notebooks.filter((n) => n.id !== id),
          }));
          if (openIdRef.current === id) {
            setOpenId(null);
          }
          return ok({ id });
        },
        duplicate: ({ id, name }) => {
          const source =
            workspaceRef.current.notebooks.find((n) => n.id === id) ??
            fault("NOT_FOUND", `Notebook '${id}' not found.`);
          const copy = {
            ...JSON.parse(JSON.stringify(source)),
            id: uid(),
            title: name ?? `${source.title} copy`,
            updatedAt: new Date().toISOString(),
          };
          updateWorkspace((w) => ({ ...w, notebooks: [...w.notebooks, copy] }));
          return ok(copy);
        },
        list: () =>
          ok({
            currency: workspaceRef.current.currency,
            locale: workspaceRef.current.locale,
            notebooks: workspaceRef.current.notebooks.map(
              ({ id, title, updatedAt }) => ({ id, title, updatedAt })
            ),
            openNotebookId: openIdRef.current,
          }),
        open: ({ id }) => {
          if (!workspaceRef.current.notebooks.some((n) => n.id === id)) {
            fault("NOT_FOUND", `Notebook '${id}' not found.`);
          }
          setOpenId(id);
          return ok({ id });
        },
        rename: ({ id, name }) => {
          updateWorkspace((w) => ({
            ...w,
            notebooks: w.notebooks.map((n) =>
              n.id === id
                ? {
                    ...n,
                    title: name.trim() || n.title,
                    updatedAt: new Date().toISOString(),
                  }
                : n
            ),
          }));
          return ok({ id, name });
        },
      },
    };
  }, [openId, updateWorkspace]);
  const webmcp = useModeloTools(adapter);

  const createNotebook = () =>
    adapter.workspace.create({ name: "Untitled notebook" });

  const importWorkspace = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text());
      if (parsed.version !== 1 || !Array.isArray(parsed.notebooks)) {
        throw new Error("Not a Modelo workspace export");
      }
      const normalized = {
        ...parsed,
        currency: parsed.currency || DEFAULT_CURRENCY,
        locale: parsed.locale || DEFAULT_LOCALE,
        notebooks: parsed.notebooks.map((notebook: Notebook) => ({
          ...notebook,
          scenarios: Array.isArray(notebook.scenarios)
            ? notebook.scenarios
            : [],
        })),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
      setWorkspace(normalized);
      setOpenId(normalized.notebooks[0]?.id ?? null);
      toast.success(`Imported ${normalized.notebooks.length} notebooks.`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not import workspace."
      );
    }
  };

  // Derived from the persisted snapshot rather than editorRef, because a ref
  // read during render does not re-run when the document changes.
  const activeScenario = openNotebook
    ? matchingScenarioName(
        portableToEditorBlocks(openNotebook.blocks as any[]) as any,
        openNotebook.scenarios ?? []
      )
    : null;

  const saveCurrentScenario = () => {
    const name = scenarioName.trim();
    if (!name) {
      return;
    }
    try {
      adapter.notebook?.saveScenario({ name });
      setScenarioName("");
      setScenarioDialogOpen(false);
      toast.success(`Saved scenario '${name}'.`);
    } catch (error) {
      toast.error(
        (error as { message?: string }).message ?? "Could not save scenario."
      );
    }
  };

  return (
    <div className="grid min-h-screen grid-cols-1 md:grid-cols-[250px_minmax(0,1fr)]">
      <aside className="bg-sidebar flex max-h-[42vh] flex-col gap-3 border-b p-3 md:sticky md:top-0 md:h-screen md:max-h-none md:border-r md:border-b-0">
        <Button
          className="justify-start px-2 text-[19px] font-bold tracking-tight"
          onClick={() => setOpenId(null)}
          size="lg"
          type="button"
          variant="ghost"
        >
          Modelo
        </Button>
        <Button
          className="justify-start"
          onClick={createNotebook}
          type="button"
        >
          <PlusIcon />
          New notebook
        </Button>
        <nav className="-mx-1 flex flex-col gap-0.5 overflow-y-auto px-1">
          {workspace.notebooks.map((notebook) => (
            <div
              className={`group grid grid-cols-[minmax(0,1fr)_auto_auto] items-center rounded-md ${
                notebook.id === openId ? "bg-sidebar-accent" : ""
              }`}
              key={notebook.id}
            >
              <Button
                className="justify-start truncate px-2 font-normal"
                onClick={() => setOpenId(notebook.id)}
                size="sm"
                type="button"
                variant="ghost"
              >
                <span className="truncate">{notebook.title}</span>
              </Button>
              <Button
                aria-label={`Duplicate ${notebook.title}`}
                className="text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                onClick={() => adapter.workspace.duplicate({ id: notebook.id })}
                size="icon-sm"
                title="Duplicate"
                type="button"
                variant="ghost"
              >
                <CopyIcon />
              </Button>
              <Button
                aria-label={`Delete ${notebook.title}`}
                className="text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                onClick={() =>
                  setPendingDelete({
                    id: notebook.id,
                    kind: "notebook",
                    title: notebook.title,
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
          ))}
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
            <header className="mx-auto flex max-w-[900px] items-center gap-3 px-6 pt-6 pb-2 md:px-[52px]">
              <Input
                aria-label="Notebook title"
                className="h-8 flex-1 border-transparent bg-transparent px-1 font-semibold shadow-none"
                onChange={(e) =>
                  adapter.workspace.rename({
                    id: openNotebook.id,
                    name: e.target.value,
                  })
                }
                value={openNotebook.title}
              />
              <Button
                onClick={() =>
                  download(`${openNotebook.title}.json`, openNotebook)
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
              {(openNotebook.scenarios ?? []).map((scenario) => {
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
                        adapter.notebook?.applyScenario({ name: scenario.name })
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
              expose={expose}
              key={openNotebook.id}
              notebook={openNotebook}
              onSave={saveOpenDocument}
              workspace={workspace}
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
            <Button className="mt-4" onClick={createNotebook} type="button">
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
        onOpenChange={(open) => !open && setPendingDelete(null)}
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
            <AlertDialogAction
              onClick={() => {
                if (pendingDelete?.kind === "notebook") {
                  adapter.workspace.delete({ id: pendingDelete.id });
                } else if (pendingDelete?.kind === "scenario") {
                  adapter.notebook?.deleteScenario({
                    name: pendingDelete.name,
                  });
                }
                setPendingDelete(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Toaster position="bottom-right" />
    </div>
  );
}
