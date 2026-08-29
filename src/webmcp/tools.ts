import type { z } from "zod";

import { planBlockUpdate } from "../engine/block-update";
import type { UpdateBlockArgs, UpdatePlan } from "../engine/block-update";
import { getComposition } from "../engine/composition";
import {
  blockText,
  isProseBlockType,
  isVariableBlockType,
} from "../engine/document";
import type { FormulaEngine } from "../engine/evaluate";
import { getModelSummary } from "../engine/model-summary";
import {
  fromEditorBlocks,
  inlineContentFromText,
  toEditorBlocks,
  unresolvedReferences,
} from "../engine/portable";
import type { PortableBlock } from "../engine/portable";
import { findReferences } from "../engine/references";
import {
  applyScenarioValues,
  matchingScenarioName,
  removeScenario,
  snapshotInputs,
  upsertScenario,
} from "../engine/scenarios";
import type { Scenario } from "../engine/scenarios";
import { buildSectionBlocks, sectionVariableNames } from "../engine/section";
import type { Section } from "../engine/section";
import { isTitleBlock, readTitle, TITLE_HEADING_LEVEL } from "../engine/title";
import { coerceInputValue, impliedFormat } from "../engine/variable";
import type { ModeloDocument } from "../model";
import { fault, ModeloToolError } from "../notebook/errors";
import {
  insertReference,
  renameVariableIn,
  replaceProse,
  setInputValue,
  setNotebookTitle,
} from "../notebook/mutations";
import type { EditorPort } from "../notebook/port";
import { NotebookSession } from "../notebook/session";
import {
  createNotebook,
  deleteNotebook,
  duplicateNotebook,
  findNotebook,
  notebookTitle,
  renameNotebook,
  setNotebookScenarios,
} from "../workspace";
import type { NotebookRecord, Workspace } from "../workspace";
import {
  emptySchema,
  getModelSchema,
  insertBlocksSchema,
  insertInlineRefSchema,
  removeBlocksSchema,
  removeVariableSchema,
  replaceParagraphSchema,
  saveScenarioSchema,
  scenarioNameSchema,
  setVariableSchema,
  updateBlockSchema,
  updateBlocksSchema,
  variableSelectorSchema,
  workspaceCreateSchema,
  workspaceDeleteSchema,
  workspaceDuplicateSchema,
  workspaceOpenSchema,
  workspaceRenameSchema,
  writeSectionSchema,
  writeSectionsSchema,
} from "./schemas";

/**
 * The WebMCP tool table.
 *
 * One row per tool: its published name, its argument schema, its description,
 * and `run`. Registration loops over the table; tests call `runTool` against
 * an in-memory editor. Nothing about a tool lives anywhere else.
 */

// --- Runtime ---------------------------------------------------------------

/** What the app hands the tools: the catalogue, and the open notebook's editor. */
export interface WorkspaceStore {
  current: () => Workspace;
  update: (change: (workspace: Workspace) => Workspace) => Workspace;
  openId: () => string | null;
  open: (id: string | null) => void;
}

export interface ToolRuntime {
  workspace: WorkspaceStore;
  /** The editor port of the open notebook, or null while none is open. */
  editor: () => EditorPort | null;
  makeId?: () => string;
  engine?: FormulaEngine;
}

export class ToolContext {
  readonly workspace: WorkspaceStore;
  readonly makeId: () => string;
  private readonly runtime: ToolRuntime;

  constructor(runtime: ToolRuntime) {
    this.runtime = runtime;
    this.workspace = runtime.workspace;
    this.makeId = runtime.makeId ?? (() => crypto.randomUUID());
  }

  /** The open notebook's catalogue record. */
  record(): NotebookRecord {
    return (
      findNotebook(this.workspace.current(), this.workspace.openId()) ??
      fault("NO_NOTEBOOK_OPEN", "Open a notebook first.")
    );
  }

  /** The open notebook's editor port, or null while none is open. */
  editor(): EditorPort | null {
    return this.runtime.editor();
  }

  /** The open notebook's document, through its editor. */
  session(): NotebookSession {
    const editor = this.runtime.editor();
    if (!editor) {
      fault("NO_NOTEBOOK_OPEN", "Open a notebook first.");
    }
    const { currency, locale } = this.workspace.current();
    return new NotebookSession(editor, {
      defaults: { currency, locale },
      engine: this.runtime.engine,
      makeId: this.makeId,
    });
  }

  requireRecord(id: string): NotebookRecord {
    return (
      findNotebook(this.workspace.current(), id) ??
      fault("NOT_FOUND", `Notebook '${id}' not found.`)
    );
  }
}

// --- Table shape -----------------------------------------------------------

export interface ToolDefinition<Schema extends z.ZodType = z.ZodType> {
  name: string;
  scope: "workspace" | "notebook";
  description: string;
  readOnly?: boolean;
  schema: Schema;
  run: (context: ToolContext, args: z.infer<Schema>) => unknown;
}

function tool<Schema extends z.ZodType>(
  definition: ToolDefinition<Schema>
): ToolDefinition {
  return definition as unknown as ToolDefinition;
}

// --- Helpers ---------------------------------------------------------------

type ReportExtra = Record<string, unknown>;

const scenarioSummary = ({ id, name }: Scenario) => ({ id, name });

/** A notebook record as the agent sees it: the stored fields plus the title. */
const recordView = (record: NotebookRecord) => ({
  ...record,
  title: notebookTitle(record),
});

/** The title heading of the open document, when it has one. */
function titleBlockOf(session: NotebookSession) {
  const [first] = session.document;
  return isTitleBlock(first) ? first : undefined;
}

/** The `get_document` view: portable blocks, with prose flattened to text. */
function agentBlock(portable: PortableBlock): Record<string, unknown> {
  const block = portable as Record<string, unknown> & { type: string };
  if (isVariableBlockType(block.type)) {
    return block;
  }
  const { inline: _inline, ...rest } = block;
  const view: Record<string, unknown> = { ...rest };
  if (isProseBlockType(block.type) || Array.isArray(block.inline)) {
    view.text = blockText(block as never);
  }
  if (Array.isArray(block.children)) {
    view.children = (block.children as PortableBlock[]).map(agentBlock);
  }
  return view;
}

/** Applies one planned update through the session's editor. */
function applyPlan(session: NotebookSession, plan: UpdatePlan): void {
  const { editor } = session;
  if (plan.rename) {
    renameVariableIn(editor, plan.rename.varId, plan.rename.name);
  }
  if (plan.text !== undefined || plan.level !== undefined) {
    const inline =
      plan.text === undefined
        ? undefined
        : inlineContentFromText(
            plan.text,
            session.current().projected.idByName
          );
    replaceProse(editor, plan.block.id, inline, plan.level);
    return;
  }
  if (plan.props && Object.keys(plan.props).length > 0) {
    editor.updateBlock(plan.block.id, { props: plan.props });
  }
}

function planOrFault(
  session: NotebookSession,
  args: UpdateBlockArgs
): UpdatePlan {
  const { level } = args as { level?: number };
  if (
    level !== undefined &&
    level !== TITLE_HEADING_LEVEL &&
    titleBlockOf(session)?.id === args.id
  ) {
    fault("TITLE_BLOCK", "The notebook title stays a level 1 heading.");
  }
  const plan = planBlockUpdate(
    session.current().projected,
    session.editor.getBlock(args.id),
    args
  );
  if (!plan.ok) {
    fault(plan.code, plan.message);
  }
  return plan;
}

/** Portable blocks for one section, with fresh ids, plus the warnings they raise. */
function prepareSection(
  section: Section,
  idByName: Record<string, string>,
  makeId: () => string
): { editorBlocks: ModeloDocument; warnings: string[] } {
  const portable = buildSectionBlocks(section, idByName, makeId);
  for (const block of portable) {
    const { name, varId } = block as { name?: unknown; varId?: unknown };
    if (typeof name === "string" && typeof varId === "string") {
      idByName[name] = varId;
    }
  }
  const warnings = unresolvedReferences(section.body, idByName).map(
    (name) => `Unknown @${name} left as literal text.`
  );
  return { editorBlocks: toEditorBlocks(portable, idByName), warnings };
}

function lastId(blocks: ModeloDocument): string {
  const block = blocks.at(-1);
  if (!block) {
    fault("EMPTY_SECTION", "The section produced no blocks.");
  }
  return block.id;
}

/**
 * Inserts sections in order. A section anchored `after` a block that an
 * earlier section also anchored to lands after that section, so the reading
 * order matches the call order.
 */
function insertSections(
  session: NotebookSession,
  sections: { section: Section; editorBlocks: ModeloDocument }[]
): string[] {
  const afterAnchors = new Map<string, string>();
  let tail: string | undefined;
  const inserted: string[] = [];
  for (const { section, editorBlocks } of sections) {
    const placement = section.placement ?? "after";
    let { referenceBlockId } = section;
    if (referenceBlockId && placement === "after") {
      referenceBlockId = afterAnchors.get(referenceBlockId) ?? referenceBlockId;
    }
    if (!referenceBlockId && tail) {
      referenceBlockId = tail;
    }
    const blocks = session.insert(editorBlocks, {
      placement,
      referenceBlockId,
    });
    inserted.push(...blocks.map((block) => block.id));
    if (section.referenceBlockId && placement === "after") {
      afterAnchors.set(section.referenceBlockId, lastId(blocks));
    } else if (!section.referenceBlockId) {
      tail = lastId(blocks);
    }
  }
  return inserted;
}

// --- Workspace tools -------------------------------------------------------

const workspaceTools: ToolDefinition[] = [
  tool({
    description:
      "List the notebooks in the Modelo workspace and identify the currently open notebook.",
    name: "list_notebooks",
    readOnly: true,
    run: ({ workspace }) => {
      const { currency, locale, notebooks } = workspace.current();
      return {
        currency,
        locale,
        notebooks: notebooks.map((notebook) => ({
          id: notebook.id,
          title: notebookTitle(notebook),
          updatedAt: notebook.updatedAt,
        })),
        openNotebookId: workspace.openId(),
      };
    },
    schema: emptySchema,
    scope: "workspace",
  }),
  tool({
    description: "Open an existing workspace notebook by id.",
    name: "open_notebook",
    run: (context, { id }) => {
      context.requireRecord(id);
      context.workspace.open(id);
      return { id };
    },
    schema: workspaceOpenSchema,
    scope: "workspace",
  }),
  tool({
    description:
      "Create and open an empty notebook with narrative-first composition guidance.",
    name: "create_notebook",
    run: (context, { name }) => {
      const { workspace } = context;
      let created: NotebookRecord | undefined;
      workspace.update((current) => {
        const result = createNotebook(current, name, context.makeId());
        created = result.notebook;
        return result.workspace;
      });
      const notebook = created as NotebookRecord;
      workspace.open(notebook.id);
      const { currency, locale } = workspace.current();
      return {
        ...recordView(notebook),
        composition: getComposition([]),
        currency,
        locale,
      };
    },
    schema: workspaceCreateSchema,
    scope: "workspace",
  }),
  tool({
    description: "Duplicate an existing workspace notebook.",
    name: "duplicate_notebook",
    run: (context, { id, name }) => {
      const source = context.requireRecord(id);
      let copy: NotebookRecord | undefined;
      context.workspace.update((current) => {
        const result = duplicateNotebook(
          current,
          source,
          context.makeId(),
          name
        );
        copy = result.notebook;
        return result.workspace;
      });
      return recordView(copy as NotebookRecord);
    },
    schema: workspaceDuplicateSchema,
    scope: "workspace",
  }),
  tool({
    description: "Permanently delete a workspace notebook by id.",
    name: "delete_notebook",
    run: (context, { id }) => {
      context.requireRecord(id);
      context.workspace.update((current) => deleteNotebook(current, id));
      if (context.workspace.openId() === id) {
        context.workspace.open(null);
      }
      return { id };
    },
    schema: workspaceDeleteSchema,
    scope: "workspace",
  }),
  tool({
    description:
      "Rename a workspace notebook by rewriting the title heading it opens with.",
    name: "rename_notebook",
    run: (context, { id, name }) => {
      context.requireRecord(id);
      // The open notebook is owned by the editor, so it is retitled there.
      const editor =
        context.workspace.openId() === id ? context.editor() : null;
      if (editor) {
        setNotebookTitle(editor, name);
      }
      context.workspace.update((current) => renameNotebook(current, id, name));
      return { id, name };
    },
    schema: workspaceRenameSchema,
    scope: "workspace",
  }),
];

// --- Notebook tools --------------------------------------------------------

const notebookTools: ToolDefinition[] = [
  tool({
    description:
      "Get ordered blocks and composition, so you can see whether the page reads like a story.",
    name: "get_document",
    readOnly: true,
    run: (context) => {
      const session = context.session();
      const record = context.record();
      const blocks = fromEditorBlocks(session.document).map(agentBlock);
      return {
        blocks: blocks.map((block, index) => ({
          ...block,
          nextId: blocks[index + 1]?.id ?? null,
          previousId: blocks[index - 1]?.id ?? null,
        })),
        composition: getComposition(session.document),
        notebook: { id: record.id, title: readTitle(session.document) },
      };
    },
    schema: emptySchema,
    scope: "notebook",
  }),
  tool({
    description:
      "Get slim variables, formulas, computed values, and evaluation errors from the open notebook.",
    name: "get_model",
    readOnly: true,
    run: (context, args) => {
      const session = context.session();
      return getModelSummary(
        session.document,
        session.defaults,
        args,
        session.current()
      );
    },
    schema: getModelSchema,
    scope: "notebook",
  }),
  tool({
    description:
      "Find formula and paragraph block ids that reference one variable by name or stable varId.",
    name: "find_references",
    readOnly: true,
    run: (context, args) => {
      const session = context.session();
      session.requireVariable(args);
      return findReferences(
        session.document,
        args,
        session.current().projected
      );
    },
    schema: variableSelectorSchema,
    scope: "notebook",
  }),
  tool({
    description:
      "Low-level block insert for surgery. Prefer write_section when adding new content.",
    name: "insert_blocks",
    run: (context, { blocks, referenceBlockId, placement }) => {
      const session = context.session();
      const idByName = { ...session.current().projected.idByName };
      const declared = blocks.flatMap((block) =>
        "name" in block ? [block.name] : []
      );
      session.ensureUniqueNames(declared);
      const portable = blocks.map((block): PortableBlock => {
        const next: Record<string, unknown> = {
          ...block,
          id: block.id || context.makeId(),
        };
        if ("name" in block) {
          const varId = context.makeId();
          idByName[block.name] = varId;
          next.varId = varId;
          if ("value" in block) {
            next.value = coerceInputValue(block.type, block.value);
            next.format = impliedFormat(block);
          }
        }
        return next as PortableBlock;
      });
      const warnings = blocks.flatMap((block) =>
        "text" in block
          ? unresolvedReferences(block.text, idByName).map(
              (name) => `Unknown @${name} left as literal text.`
            )
          : []
      );
      const editorBlocks = toEditorBlocks(portable, idByName);
      return session.mutate((current) => ({
        insertedBlockIds: current
          .insert(editorBlocks, { placement, referenceBlockId })
          .map((block) => block.id),
        warnings,
      }));
    },
    schema: insertBlocksSchema,
    scope: "notebook",
  }),
  tool({
    description:
      "Add one prose-first section. Use format number for counts/loan terms; unit year means a duration. Supports dry_run.",
    name: "write_section",
    run: (context, { dry_run, ...section }) => {
      const session = context.session();
      session.ensureUniqueNames(sectionVariableNames(section));
      if (section.referenceBlockId) {
        session.requireBlock(section.referenceBlockId);
      }
      const idByName = { ...session.current().projected.idByName };
      const prepared = prepareSection(section, idByName, context.makeId);
      const change = (current: NotebookSession): ReportExtra => ({
        insertedBlockIds: insertSections(current, [
          { editorBlocks: prepared.editorBlocks, section },
        ]),
        warnings: prepared.warnings,
      });
      return dry_run
        ? { dry_run: true, ...session.preview(change) }
        : session.mutate(change);
    },
    schema: writeSectionSchema,
    scope: "notebook",
  }),
  tool({
    description:
      "Add sections atomically, or preview with dry_run. Examples: 1 + mortgage_rate; price * (1 + tax_rate); principal * rate / 12; 5 km + 500 m. Percent inputs are formula ratios. Use number for counts/loan terms; unit year is a duration.",
    name: "write_sections",
    run: (context, { sections, dry_run }) => {
      const session = context.session();
      session.ensureUniqueNames(sections.flatMap(sectionVariableNames));
      for (const section of sections) {
        if (section.referenceBlockId) {
          session.requireBlock(section.referenceBlockId);
        }
      }
      const idByName = { ...session.current().projected.idByName };
      const prepared = sections.map((section) => ({
        section,
        ...prepareSection(section, idByName, context.makeId),
      }));
      const warnings = prepared.flatMap((entry) => entry.warnings);
      const change = (current: NotebookSession): ReportExtra => ({
        insertedBlockIds: insertSections(current, prepared),
        warnings,
      });
      return dry_run
        ? { dry_run: true, ...session.preview(change) }
        : session.mutate(change);
    },
    schema: writeSectionsSchema,
    scope: "notebook",
  }),
  tool({
    description: "Apply a partial update to one block in the open notebook.",
    name: "update_block",
    run: (context, args) => {
      const session = context.session();
      const plan = planOrFault(session, args);
      return session.mutate((current) => {
        applyPlan(current, plan);
        return { id: args.id };
      });
    },
    schema: updateBlockSchema,
    scope: "notebook",
  }),
  tool({
    description: "Update multiple blocks atomically.",
    name: "update_blocks",
    run: (context, { blocks }) => {
      const session = context.session();
      const ids = blocks.map(({ id }) => id);
      if (new Set(ids).size !== ids.length) {
        fault(
          "INVALID_UPDATE",
          "Each block may appear only once in update_blocks."
        );
      }
      const plans = blocks.map((args) => planOrFault(session, args));
      const renamed = new Set<string>();
      for (const plan of plans) {
        if (plan.rename) {
          if (renamed.has(plan.rename.name)) {
            fault(
              "DUPLICATE_VARIABLE_NAME",
              `Variable '${plan.rename.name}' already exists.`
            );
          }
          renamed.add(plan.rename.name);
        }
      }
      return session.mutate((current) => {
        for (const plan of plans) {
          applyPlan(current, plan);
        }
        return { ids };
      });
    },
    schema: updateBlocksSchema,
    scope: "notebook",
  }),
  tool({
    description:
      "Remove one or more blocks from the open notebook in one operation.",
    name: "remove_blocks",
    run: (context, { ids }) => {
      const session = context.session();
      const missing = ids.filter((id) => !session.editor.getBlock(id));
      if (missing.length) {
        fault("NOT_FOUND", "Some blocks do not exist.", { ids: missing });
      }
      const title = titleBlockOf(session);
      if (title && ids.includes(title.id)) {
        fault(
          "TITLE_BLOCK",
          "The notebook title cannot be removed. Rename it instead."
        );
      }
      return session.mutate((current) => {
        current.editor.removeBlocks(ids);
        return { removed: ids };
      });
    },
    schema: removeBlocksSchema,
    scope: "notebook",
  }),
  tool({
    description:
      "Remove an input variable. Refuses referenced variables unless force is true; never rewrites formulas or prose.",
    name: "remove_variable",
    run: (context, args) => {
      const session = context.session();
      const variable = session.requireVariable(args);
      if (variable.kind !== "input") {
        fault(
          "READ_ONLY",
          "Only input variables can be removed with remove_variable."
        );
      }
      const references = findReferences(
        session.document,
        { varId: variable.varId },
        session.current().projected
      );
      const referenced =
        references.formulas.length || references.paragraphs.length;
      if (!args.force && referenced) {
        fault(
          "VARIABLE_REFERENCED",
          `Variable '${references.name}' is still referenced.`,
          references
        );
      }
      return session.mutate((current) => {
        current.editor.removeBlocks([variable.blockId]);
        return {
          affected: {
            formulaBlockIds: references.formulas,
            paragraphBlockIds: references.paragraphs,
          },
          removed: {
            id: variable.blockId,
            name: variable.name,
            varId: variable.varId,
          },
        };
      });
    },
    schema: removeVariableSchema,
    scope: "notebook",
  }),
  tool({
    description:
      "Replace all plain text in a paragraph block while preserving the block id.",
    name: "replace_paragraph",
    run: (context, { id, text }) => {
      const session = context.session();
      session.requireBlock(id);
      const inline = inlineContentFromText(
        text,
        session.current().projected.idByName
      );
      return session.mutate((current) => {
        replaceProse(current.editor, id, inline);
        return { id };
      });
    },
    schema: replaceParagraphSchema,
    scope: "notebook",
  }),
  tool({
    description:
      "Insert an inline reference to a notebook variable into a paragraph.",
    name: "insert_inline_ref",
    run: (context, { blockId, variable, offset }) => {
      const session = context.session();
      const target = session.requireVariable(variable);
      const block = session.requireBlock(blockId);
      return session.mutate((current) => {
        insertReference(
          current.editor,
          block,
          { name: target.name, varId: target.varId },
          offset
        );
        return { blockId, varId: target.varId };
      });
    },
    schema: insertInlineRefSchema,
    scope: "notebook",
  }),
  tool({
    description: "Set the value of an existing variable in the open notebook.",
    name: "set_variable",
    run: (context, { name, value }) => {
      const session = context.session();
      const variable = session.requireVariable({ name });
      if (variable.kind !== "input") {
        fault("READ_ONLY", "Formula values are computed and cannot be set.");
      }
      const block = session.requireBlock(variable.blockId);
      return session.mutate((current) => ({
        value: setInputValue(current.editor, block, value),
      }));
    },
    schema: setVariableSchema,
    scope: "notebook",
  }),
  tool({
    description: "List saved input scenarios and the active one.",
    name: "list_scenarios",
    readOnly: true,
    run: (context) => {
      const { scenarios } = context.record();
      return {
        active: matchingScenarioName(context.session().document, scenarios),
        scenarios: scenarios.map(scenarioSummary),
      };
    },
    schema: emptySchema,
    scope: "notebook",
  }),
  tool({
    description: "Save or overwrite a named input scenario.",
    name: "save_scenario",
    run: (context, { name, values }) => {
      const trimmedName = name.trim();
      if (!trimmedName) {
        fault("INVALID_NAME", "Scenario name cannot be empty.");
      }
      const session = context.session();
      const record = context.record();
      const warnings: string[] = [];
      let saved: Record<string, number>;
      if (values === undefined) {
        saved = snapshotInputs(session.document);
      } else {
        saved = Object.create(null);
        const { projected } = session.current();
        for (const [variableName, value] of Object.entries(values)) {
          if (!Number.isFinite(value)) {
            fault(
              "INVALID_VALUE",
              `Value for '${variableName}' must be finite.`
            );
          }
          const variable = projected.byId[projected.idByName[variableName]];
          if (variable?.kind === "input") {
            saved[variable.varId] = value;
          } else {
            warnings.push(`Unknown input '${variableName}' skipped.`);
          }
        }
      }
      const existing = record.scenarios.find(
        (item) => item.name === trimmedName
      );
      const scenario: Scenario = {
        id: existing?.id ?? context.makeId(),
        name: trimmedName,
        values: saved,
      };
      let scenarios: Scenario[];
      try {
        scenarios = upsertScenario(record.scenarios, scenario);
      } catch (error) {
        return fault("SCENARIO_LIMIT", (error as Error).message);
      }
      context.workspace.update((current) =>
        setNotebookScenarios(current, record.id, scenarios)
      );
      return { scenario: scenarioSummary(scenario), warnings };
    },
    schema: saveScenarioSchema,
    scope: "notebook",
  }),
  tool({
    description: "Apply a named input scenario.",
    name: "apply_scenario",
    run: (context, { name }) => {
      const session = context.session();
      const scenario =
        context.record().scenarios.find((item) => item.name === name) ??
        fault("NOT_FOUND", `Scenario '${name}' not found.`);
      const { projected } = session.current();
      const warnings = Object.keys(scenario.values)
        .filter((varId) => projected.byId[varId]?.kind !== "input")
        .map((varId) => `Unknown input id '${varId}' skipped.`);
      return session.mutate((current) => {
        current.editor.replaceDocument(
          applyScenarioValues(current.document, scenario.values)
        );
        return { warnings };
      });
    },
    schema: scenarioNameSchema,
    scope: "notebook",
  }),
  tool({
    description: "Delete a named input scenario.",
    name: "delete_scenario",
    run: (context, { name }) => {
      const record = context.record();
      if (!record.scenarios.some((scenario) => scenario.name === name)) {
        fault("NOT_FOUND", `Scenario '${name}' not found.`);
      }
      context.workspace.update((current) =>
        setNotebookScenarios(
          current,
          record.id,
          removeScenario(record.scenarios, name)
        )
      );
      return { name };
    },
    schema: scenarioNameSchema,
    scope: "notebook",
  }),
];

export const TOOLS: readonly ToolDefinition[] = [
  ...workspaceTools,
  ...notebookTools,
];

// --- The failure contract --------------------------------------------------

export interface ToolFailure {
  ok: false;
  error: { code: string; message: string; details?: unknown };
}

export interface ToolSuccess {
  ok: true;
  data: unknown;
}

export type ToolResult = ToolSuccess | ToolFailure;

function withoutStacks(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (seen.has(value)) {
    return "[circular]";
  }
  seen.add(value);
  if (Array.isArray(value)) {
    return value.map((item) => withoutStacks(item, seen));
  }
  const clean: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (key.toLowerCase() !== "stack") {
      clean[key] = withoutStacks(item, seen);
    }
  }
  return clean;
}

function messageOf(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return typeof error === "string" ? error : "";
}

/** Any thrown value becomes the structured failure the agent is promised. */
export function toFailure(error: unknown): ToolFailure {
  if (error instanceof ModeloToolError) {
    return {
      error: {
        code: error.code,
        message: error.message,
        ...(error.details === undefined
          ? {}
          : { details: withoutStacks(error.details) }),
      },
      ok: false,
    };
  }
  const message = messageOf(error);
  return {
    error: {
      code: "INTERNAL_ERROR",
      message: message || "The operation could not be completed.",
    },
    ok: false,
  };
}

/**
 * Runs one tool by name against a runtime: checks the notebook is open when
 * the tool needs one, validates the arguments, executes, and wraps the result.
 * This is the interface the WebMCP hook registers and the tests call.
 */
export async function runTool(
  runtime: ToolRuntime,
  definition: ToolDefinition,
  rawArgs: unknown
): Promise<ToolResult> {
  try {
    if (definition.scope === "notebook" && !runtime.editor()) {
      fault("NO_NOTEBOOK_OPEN", "Open a notebook before using document tools.");
    }
    const parsed = definition.schema.safeParse(rawArgs ?? {});
    if (!parsed.success) {
      fault(
        "INVALID_ARGUMENTS",
        "The tool arguments did not match the input schema.",
        parsed.error.issues.map((issue) => ({
          message: issue.message,
          path: issue.path.join("."),
        }))
      );
    }
    const data = await definition.run(new ToolContext(runtime), parsed.data);
    return { data: data ?? {}, ok: true };
  } catch (error) {
    return toFailure(error);
  }
}

export function findTool(name: string): ToolDefinition {
  const definition = TOOLS.find((candidate) => candidate.name === name);
  if (!definition) {
    throw new Error(`Unknown tool: ${name}`);
  }
  return definition;
}
