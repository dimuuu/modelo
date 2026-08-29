import { z } from "zod";

import type { ModeloBlock, ModeloDocument } from "../model";
import {
  HEADING_LEVELS,
  INPUT_BLOCK_TYPES,
  inlineRefName,
  inlineRefVarId,
  isInlineRef,
  isProseBlockType,
  isVariableBlockType,
  PROSE_BLOCK_TYPES,
} from "./document";
import type { ProseBlockType } from "./document";
import {
  expressionSchema,
  INPUT_PROP_DEFAULTS,
  inputFieldsSchema,
  parseSelectOptions,
  REFERENCE_TOKEN,
  serializeSelectOptions,
  variableNameSchema,
} from "./variable";

/**
 * The portable notebook format.
 *
 * This is the one shape a notebook takes outside the editor: in seeds, in
 * `localStorage`, in an export file, in an agent's `insert_blocks` payload,
 * and in what `get_document` returns. `toEditorBlocks` and `fromEditorBlocks`
 * are inverses; everything that used to know both dialects now calls one of
 * them.
 *
 * A prose block carries `inline`: strings, `{ type: "ref" }` references, and
 * styled `{ type: "text" }` runs. On the way in, `text` with `@name` tokens
 * is accepted as a shorthand for `inline`. A variable block carries its
 * fields flat. Any other BlockNote block (a table, say) passes through.
 */

export const inlineSchema = z.union([
  z.string(),
  z.strictObject({
    name: z.string().min(1),
    type: z.literal("ref"),
    varId: z.string().min(1),
  }),
  // Styled text runs and other BlockNote inline nodes, such as links.
  z.looseObject({ type: z.string() }),
]);

const blockIdentity = { id: z.string().optional() };

export const inputBlockSchema = z.strictObject({
  ...blockIdentity,
  ...inputFieldsSchema,
  type: z.enum(INPUT_BLOCK_TYPES),
  varId: z.string().min(1).optional(),
});

export const formulaBlockSchema = z.strictObject({
  ...blockIdentity,
  formula: expressionSchema,
  name: variableNameSchema,
  type: z.literal("formula"),
  varId: z.string().min(1).optional(),
});

export type PortableInline = z.infer<typeof inlineSchema>;

export interface PortableProseBlock {
  id?: string;
  type: ProseBlockType;
  text?: string;
  inline?: PortableInline[];
  level?: number;
  props?: Record<string, unknown>;
  children?: PortableBlock[];
}

/** A BlockNote block Modelo does not model. It is stored as it came. */
export type ForeignBlock = { id?: string; type: string } & Record<
  string,
  unknown
>;

export type PortableBlock =
  | z.infer<typeof inputBlockSchema>
  | z.infer<typeof formulaBlockSchema>
  | PortableProseBlock
  | ForeignBlock;

export const proseBlockSchema: z.ZodType<PortableProseBlock> = z.strictObject({
  ...blockIdentity,
  get children(): z.ZodOptional<z.ZodArray<z.ZodType<PortableBlock>>> {
    // oxlint-disable-next-line no-use-before-define -- the getter is lazy; recursion needs the later const.
    return z.array(portableBlockSchema).optional();
  },
  inline: z.array(inlineSchema).optional(),
  level: z.union(HEADING_LEVELS.map((level) => z.literal(level))).optional(),
  props: z.record(z.string(), z.unknown()).optional(),
  text: z.string().optional(),
  type: z.enum(PROSE_BLOCK_TYPES),
});

const foreignBlockSchema: z.ZodType<ForeignBlock> = z.looseObject({
  ...blockIdentity,
  type: z
    .string()
    .refine(
      (type) => !(isVariableBlockType(type) || isProseBlockType(type)),
      "Known block types must match their own schema."
    ),
});

export const portableBlockSchema: z.ZodType<PortableBlock> = z.union([
  inputBlockSchema,
  formulaBlockSchema,
  proseBlockSchema,
  foreignBlockSchema,
]);

/** The loose view the converters work on; the schema has already been applied. */
type AnyBlock = Record<string, unknown> & { id?: string; type: string };

const VARIABLE_KEYS = [
  "varId",
  "name",
  "value",
  "formula",
  "format",
  "currency",
  "unit",
  "decimals",
  "min",
  "max",
  "step",
  "options",
  "locale",
] as const;

const EDITOR_PROSE_DEFAULTS: Record<string, unknown> = {
  backgroundColor: "default",
  textAlignment: "left",
  textColor: "default",
};

/** Splits prose into text runs and references to variables that exist. */
export function inlineContentFromText(
  text: string,
  idByName: Record<string, string>
): PortableInline[] {
  const inline: PortableInline[] = [];
  let start = 0;
  for (const match of text.matchAll(REFERENCE_TOKEN)) {
    const [, name] = match;
    if (match.index > start) {
      inline.push(text.slice(start, match.index));
    }
    inline.push(
      Object.hasOwn(idByName, name)
        ? { name, type: "ref", varId: idByName[name] }
        : match[0]
    );
    start = match.index + match[0].length;
  }
  if (start < text.length) {
    inline.push(text.slice(start));
  }
  return inline;
}

/** `@name` tokens in prose that resolve to no variable. */
export function unresolvedReferences(
  text: string,
  idByName: Record<string, string>
): string[] {
  const names = [...text.matchAll(REFERENCE_TOKEN)].map((match) => match[1]);
  return [...new Set(names)].filter((name) => !Object.hasOwn(idByName, name));
}

// --- Portable -> editor ------------------------------------------------------

function toEditorInline(item: PortableInline): unknown {
  if (typeof item === "string") {
    return { styles: {}, text: item, type: "text" };
  }
  if (item.type === "ref") {
    const ref = item as { varId: string; name: string };
    return {
      props: { name: ref.name, varId: ref.varId },
      type: "variableRef",
    };
  }
  if (item.type === "text") {
    return { ...item, styles: item.styles ?? {} };
  }
  return item;
}

function toEditorVariable(block: AnyBlock): ModeloBlock {
  const props: Record<string, unknown> = {};
  for (const key of VARIABLE_KEYS) {
    if (block[key] !== undefined) {
      props[key] = block[key];
    }
  }
  if (Array.isArray(props.options)) {
    props.options = serializeSelectOptions(parseSelectOptions(props.options));
  }
  return {
    ...(block.id ? { id: block.id } : {}),
    props,
    type: block.type,
  } as ModeloBlock;
}

type BlockConverter = (blocks: PortableBlock[]) => ModeloDocument;

function toEditorProse(
  block: AnyBlock,
  idByName: Record<string, string>,
  convert: BlockConverter
): ModeloBlock {
  const inline = Array.isArray(block.inline)
    ? (block.inline as PortableInline[])
    : inlineContentFromText(
        typeof block.text === "string" ? block.text : "",
        idByName
      );
  const level = block.type === "heading" ? Number(block.level ?? 2) : undefined;
  const props = {
    ...(block.props as Record<string, unknown> | undefined),
    ...(level ? { level } : {}),
  };
  return {
    ...(block.id ? { id: block.id } : {}),
    type: block.type,
    ...(Object.keys(props).length ? { props } : {}),
    content: inline.map(toEditorInline),
    ...(Array.isArray(block.children)
      ? { children: convert(block.children as PortableBlock[]) }
      : {}),
  } as ModeloBlock;
}

/** Portable blocks to the shape BlockNote accepts. `idByName` resolves `@name` in text. */
export function toEditorBlocks(
  blocks: PortableBlock[],
  idByName: Record<string, string> = {}
): ModeloDocument {
  const convert: BlockConverter = (list) =>
    list.map((raw) => {
      const block = raw as AnyBlock;
      if (isVariableBlockType(block.type)) {
        return toEditorVariable(block);
      }
      if (isProseBlockType(block.type)) {
        return toEditorProse(block, idByName, convert);
      }
      return block as ModeloBlock;
    });
  return convert(blocks);
}

// --- Editor -> portable ------------------------------------------------------

function fromEditorInline(node: unknown): PortableInline {
  if (typeof node === "string") {
    return node;
  }
  if (!node || typeof node !== "object") {
    return "";
  }
  if (isInlineRef(node)) {
    return {
      name: inlineRefName(node) ?? "",
      type: "ref",
      varId: inlineRefVarId(node) ?? "",
    };
  }
  const inline = node as { type?: unknown; text?: unknown; styles?: unknown };
  if (inline.type === "text" && typeof inline.text === "string") {
    const styles = (inline.styles ?? {}) as Record<string, unknown>;
    return Object.keys(styles).length === 0
      ? inline.text
      : { styles, text: inline.text, type: "text" };
  }
  return inline as PortableInline;
}

const ALWAYS_KEPT = new Set(["varId", "name", "value"]);

/**
 * A prop equal to its BlockNote default carries no information, unless the
 * format makes it meaningful: a currency block keeps `EUR` even though `EUR`
 * is the default.
 */
function isDefaultProp(key: string, value: unknown, format: unknown): boolean {
  if (ALWAYS_KEPT.has(key)) {
    return false;
  }
  if (
    (key === "currency" && format === "currency") ||
    (key === "unit" && format === "unit")
  ) {
    return false;
  }
  return (
    Object.hasOwn(INPUT_PROP_DEFAULTS, key) &&
    INPUT_PROP_DEFAULTS[key as keyof typeof INPUT_PROP_DEFAULTS] === value
  );
}

function fromEditorVariable(block: ModeloBlock): PortableBlock {
  const props = (block.props ?? {}) as Record<string, unknown>;
  const portable: AnyBlock = { id: block.id, type: block.type };
  for (const key of VARIABLE_KEYS) {
    const value = props[key];
    if (value === undefined || value === null) {
      continue;
    }
    if (isDefaultProp(key, value, props.format)) {
      continue;
    }
    portable[key] = key === "options" ? parseSelectOptions(value) : value;
  }
  return portable as PortableBlock;
}

/** Prose props worth keeping: not the level, not a BlockNote default. */
function notableProps(props: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(props).filter(
      ([key, value]) => key !== "level" && EDITOR_PROSE_DEFAULTS[key] !== value
    )
  );
}

type DocumentConverter = (document: ModeloDocument) => PortableBlock[];

function fromEditorProse(
  block: ModeloBlock,
  convert: DocumentConverter
): PortableProseBlock {
  const { level, ...rest } = (block.props ?? {}) as Record<string, unknown>;
  const props = notableProps(rest);
  const { content } = block as { content?: unknown };
  const inline = Array.isArray(content) ? content.map(fromEditorInline) : [];
  const children = Array.isArray(block.children)
    ? convert(block.children as ModeloDocument)
    : [];
  return {
    id: block.id,
    type: block.type as PortableProseBlock["type"],
    ...(block.type === "heading" ? { level: Number(level ?? 2) } : {}),
    inline,
    ...(Object.keys(props).length ? { props } : {}),
    ...(children.length ? { children } : {}),
  };
}

/** Editor blocks to portable blocks. The inverse of `toEditorBlocks`. */
export function fromEditorBlocks(document: ModeloDocument): PortableBlock[] {
  const convert: DocumentConverter = (blocks) =>
    blocks.map((block) => {
      if (isVariableBlockType(block.type)) {
        return fromEditorVariable(block);
      }
      if (isProseBlockType(block.type)) {
        return fromEditorProse(block, convert);
      }
      return JSON.parse(JSON.stringify(block)) as PortableBlock;
    });
  return convert(document);
}
