import { blockText } from "./document";
import type { PortableBlock, PortableProseBlock } from "./portable";

/**
 * The notebook title lives in the document.
 *
 * Every notebook starts with a level 1 heading, and that heading is the
 * title. There is no separate title field to drift from it: the sidebar, the
 * export filename, and `list_notebooks` all read this one block.
 *
 * The helpers below read both dialects. A portable heading carries `level`;
 * an editor heading carries `props.level`.
 */

export const TITLE_HEADING_LEVEL = 1;
export const UNTITLED = "Untitled notebook";

interface AnyBlock {
  type?: unknown;
  level?: unknown;
  props?: unknown;
}

function headingLevel(block: AnyBlock): number | undefined {
  const nested = (block.props as { level?: unknown } | undefined)?.level;
  const level = block.level ?? nested;
  return typeof level === "number" ? level : undefined;
}

/** True for the level 1 heading that carries the notebook title. */
export function isTitleBlock(block: unknown): boolean {
  if (!block || typeof block !== "object") {
    return false;
  }
  const candidate = block as AnyBlock;
  return (
    candidate.type === "heading" &&
    headingLevel(candidate) === TITLE_HEADING_LEVEL
  );
}

/** The portable title heading for `title`. */
export function titleBlock(title: string, id?: string): PortableProseBlock {
  return {
    ...(id ? { id } : {}),
    inline: [title.trim() || UNTITLED],
    level: TITLE_HEADING_LEVEL,
    type: "heading",
  };
}

/** The notebook title: the text of the leading title heading. */
export function readTitle(blocks: readonly unknown[]): string {
  const [first] = blocks;
  const text = isTitleBlock(first) ? blockText(first as never).trim() : "";
  return text || UNTITLED;
}

/** The same blocks, with a title heading guaranteed first. */
export function withTitleBlock(
  blocks: PortableBlock[],
  title = UNTITLED
): PortableBlock[] {
  return isTitleBlock(blocks[0]) ? blocks : [titleBlock(title), ...blocks];
}

/** The same blocks, with the title heading rewritten to `title`. */
export function setTitleIn(
  blocks: PortableBlock[],
  title: string
): PortableBlock[] {
  const [first, ...rest] = withTitleBlock(blocks, title);
  return [titleBlock(title, (first as { id?: string }).id), ...rest];
}
