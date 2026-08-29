import { isBlankParagraph } from "../engine/document";
import type { FormulaEngine } from "../engine/evaluate";
import type { FormatDefaults } from "../engine/format";
import { describeNotebook, diffNotebooks } from "../engine/notebook";
import type { MutationReport, Notebook } from "../engine/notebook";
import { resolveVariable } from "../engine/references";
import type { ReferenceQuery } from "../engine/references";
import { isTitleBlock } from "../engine/title";
import type { ModeloBlock, ModeloDocument, ProjectedVariable } from "../model";
import { fault } from "./errors";
import { createMemoryPort } from "./port";
import type { EditorPort, Placement } from "./port";

export interface SessionOptions {
  defaults: FormatDefaults;
  engine?: FormulaEngine;
  makeId?: () => string;
}

export interface InsertAnchor {
  referenceBlockId?: string;
  placement?: Placement;
}

/**
 * One open notebook, seen through an editor port.
 *
 * `current()` is the notebook value every reader shares. `mutate()` runs a
 * change inside one editor transaction and reports what moved. `preview()`
 * runs the same change against an in-memory copy, which is all `dry_run` is.
 */
export class NotebookSession {
  readonly editor: EditorPort;
  readonly defaults: FormatDefaults;
  readonly makeId: () => string;
  private readonly engine: FormulaEngine | undefined;
  private cached: Notebook | undefined;

  constructor(editor: EditorPort, options: SessionOptions) {
    this.editor = editor;
    this.defaults = options.defaults;
    this.engine = options.engine;
    this.makeId = options.makeId ?? (() => crypto.randomUUID());
  }

  get document(): ModeloDocument {
    return this.editor.document;
  }

  /** The projected and evaluated notebook for the document as it is now. */
  current(): Notebook {
    const { document } = this.editor;
    if (this.cached?.document !== document) {
      this.cached = describeNotebook(document, this.defaults, this.engine);
    }
    return this.cached;
  }

  /** A detached copy of the document, safe to keep across a mutation. */
  snapshot(): ModeloDocument {
    return JSON.parse(JSON.stringify(this.editor.document)) as ModeloDocument;
  }

  /** Runs `change` in one transaction and reports what it altered. */
  mutate<T>(change: (session: NotebookSession) => T): T & MutationReport;
  mutate(change: (session: NotebookSession) => void): MutationReport;
  mutate(change: (session: NotebookSession) => unknown): MutationReport {
    const before = describeNotebook(
      this.snapshot(),
      this.defaults,
      this.engine
    );
    const extra = this.editor.transact(() => change(this));
    this.cached = undefined;
    const report = diffNotebooks(before, this.current());
    return typeof extra === "object" && extra !== null
      ? { ...extra, ...report }
      : report;
  }

  /** Runs `change` against an in-memory copy. The real document is untouched. */
  preview<T>(change: (session: NotebookSession) => T): T & MutationReport;
  preview(change: (session: NotebookSession) => void): MutationReport;
  preview(change: (session: NotebookSession) => unknown): MutationReport {
    const copy = new NotebookSession(
      createMemoryPort(this.snapshot(), this.makeId),
      { defaults: this.defaults, engine: this.engine, makeId: this.makeId }
    );
    return copy.mutate(change);
  }

  /**
   * Inserts blocks at an anchor, or appends them. A notebook that is still
   * its title plus the blank paragraph BlockNote starts with loses that
   * paragraph, so new content does not open with an empty line.
   */
  insert(blocks: ModeloDocument, anchor: InsertAnchor = {}): ModeloDocument {
    const { editor } = this;
    const placement = anchor.placement ?? "after";
    if (anchor.referenceBlockId) {
      const reference = this.requireBlock(anchor.referenceBlockId);
      if (placement === "before" && isTitleBlock(reference)) {
        fault("TITLE_BLOCK", "Nothing goes above the notebook title.");
      }
      return editor.insertBlocks(blocks, anchor.referenceBlockId, placement);
    }
    const last = editor.document.at(-1);
    if (!last) {
      fault("EMPTY_DOCUMENT", "The notebook has no blocks to append after.");
    }
    const body = isTitleBlock(editor.document[0])
      ? editor.document.slice(1)
      : editor.document;
    const blank = body.every(isBlankParagraph) ? body : [];
    const inserted = editor.insertBlocks(blocks, last.id, "after");
    if (blank.length) {
      editor.removeBlocks(blank.map((block) => block.id));
    }
    return inserted;
  }

  requireBlock(id: string): ModeloBlock {
    return (
      this.editor.getBlock(id) ?? fault("NOT_FOUND", `Block '${id}' not found.`)
    );
  }

  requireVariable(query: string | ReferenceQuery): ProjectedVariable {
    const variable = resolveVariable(this.current().projected, query);
    if (variable) {
      return variable;
    }
    const label =
      typeof query === "string" ? query : (query.name ?? query.varId ?? "");
    return fault("NOT_FOUND", `Variable '${label}' not found.`);
  }

  /** Rejects a name already taken by another variable, or repeated in `names`. */
  ensureUniqueNames(names: string[], exceptVarId?: string): void {
    const { idByName } = this.current().projected;
    const seen = new Set<string>();
    for (const name of names) {
      const owner = idByName[name];
      if ((owner && owner !== exceptVarId) || seen.has(name)) {
        fault("DUPLICATE_VARIABLE_NAME", `Variable '${name}' already exists.`);
      }
      seen.add(name);
    }
  }
}
