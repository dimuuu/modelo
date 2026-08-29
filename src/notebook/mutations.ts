import { blockText } from "../engine/document";
import type { FormulaEngine } from "../engine/evaluate";
import { toEditorBlocks } from "../engine/portable";
import type { PortableInline } from "../engine/portable";
import { renameVariable } from "../engine/rename";
import { coerceInputValue } from "../engine/variable";
import type { ModeloBlock } from "../model";
import type { EditorPort } from "./port";

/**
 * The mutations a notebook supports, written once.
 *
 * Block components call these from their controls; agent tools call them from
 * the tool table. Each runs inside `port.transact`, so the invariant "every
 * mutation goes through one transaction" is kept here and not by convention.
 */

export function setBlockProps(
  port: EditorPort,
  blockId: string,
  props: Record<string, unknown>
): void {
  port.transact(() => port.updateBlock(blockId, { props }));
}

/** Stores a value the way the block type requires: 0/1 for toggles, clamped for sliders. */
export function setInputValue(
  port: EditorPort,
  block: ModeloBlock,
  value: number
): number {
  const props = (block.props ?? {}) as { min?: unknown; max?: unknown };
  const stored = coerceInputValue(block.type, value, props);
  setBlockProps(port, block.id, { value: stored });
  return stored;
}

/** Renames by stable id and rewrites every formula that used the old symbol. */
export function renameVariableIn(
  port: EditorPort,
  varId: string,
  name: string,
  engine?: FormulaEngine
): void {
  const renamed = renameVariable(port.document, varId, name, engine);
  port.transact(() => port.replaceDocument(renamed));
}

/** Replaces a prose block's content and, for headings, its level. */
export function replaceProse(
  port: EditorPort,
  blockId: string,
  inline: PortableInline[] | undefined,
  level?: number
): void {
  const type = port.getBlock(blockId)?.type ?? "paragraph";
  const [converted] = inline ? toEditorBlocks([{ inline, type }]) : [undefined];
  port.transact(() =>
    port.updateBlock(blockId, {
      ...(converted
        ? { content: (converted as { content?: unknown }).content }
        : {}),
      ...(level === undefined ? {} : { props: { level } }),
    })
  );
}

interface TextRun {
  type: "text";
  text: string;
  styles?: Record<string, unknown>;
}

/**
 * Inserts a reference chip at a UTF-16 offset of the block's plain text, the
 * same text `get_document` reports. Omit the offset to append.
 */
export function insertReference(
  port: EditorPort,
  block: ModeloBlock,
  ref: { varId: string; label: string },
  offset?: number
): void {
  const chip = {
    props: { label: ref.label, varId: ref.varId },
    type: "variableRef",
  };
  const existing = (block as { content?: unknown }).content;
  const content: unknown[] = Array.isArray(existing) ? [...existing] : [];
  const at = offset === undefined ? Number.POSITIVE_INFINITY : offset;
  const next: unknown[] = [];
  let placed = false;
  let cursor = 0;
  for (const node of content) {
    const run = node as TextRun;
    const length =
      run.type === "text" && typeof run.text === "string"
        ? run.text.length
        : blockText({ content: [node], id: "", type: "paragraph" }).length;
    if (!placed && at <= cursor) {
      next.push(chip);
      placed = true;
    }
    const splitPoint = at - cursor;
    if (
      !placed &&
      run.type === "text" &&
      typeof run.text === "string" &&
      splitPoint > 0 &&
      splitPoint < length
    ) {
      next.push({ ...run, text: run.text.slice(0, splitPoint) }, chip, {
        ...run,
        text: run.text.slice(splitPoint),
      });
      placed = true;
    } else {
      next.push(node);
    }
    cursor += length;
  }
  if (!placed) {
    next.push(chip);
  }
  port.transact(() => port.updateBlock(block.id, { content: next }));
}
