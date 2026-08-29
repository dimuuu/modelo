import { z } from "zod";

import { updateBlockSchema } from "../engine/block-update";
import { PROSE_BLOCK_TYPES } from "../engine/document";
import { inputFields, placementSchema, sectionSchema } from "../engine/section";
import { expressionSchema, variableNameSchema } from "../engine/variable";

/**
 * Every WebMCP tool argument shape, composed here from the engine's own
 * schemas and published as JSON Schema. The tool table in `tools.ts` pairs
 * each schema with its implementation; `z.infer` gives the handler its type.
 */

const HEADING_LEVELS = [1, 2, 3] as const;
const blockId = z.string().min(1);
const headingLevel = z.union(HEADING_LEVELS.map((level) => z.literal(level)));

// --- Workspace tools -------------------------------------------------------

export const workspaceOpenSchema = z.strictObject({
  id: blockId.describe("Workspace notebook id."),
});

export const workspaceCreateSchema = z.strictObject({
  name: z.string().min(1).describe("Name for the new notebook."),
});

export const workspaceDuplicateSchema = z.strictObject({
  id: blockId.describe("Notebook id to duplicate."),
  name: z.string().min(1).optional().describe("Optional name for the copy."),
});

export const workspaceDeleteSchema = z.strictObject({
  id: blockId.describe("Notebook id to delete."),
});

export const workspaceRenameSchema = z.strictObject({
  id: blockId.describe("Notebook id to rename."),
  name: z.string().min(1).describe("New notebook name."),
});

// --- Notebook reads --------------------------------------------------------

export const emptySchema = z.strictObject({});

export const getModelSchema = z.strictObject({
  includeDependencies: z
    .boolean()
    .optional()
    .describe(
      "Include formula and paragraph block ids that use each variable."
    ),
});

/** A variable is addressed by name or by stable id, never by both. */
export const variableSelectorSchema = z.union([
  z.strictObject({ name: variableNameSchema }),
  z.strictObject({ varId: blockId }),
]);

export const removeVariableSchema = z.union([
  z.strictObject({ force: z.boolean().optional(), name: variableNameSchema }),
  z.strictObject({ force: z.boolean().optional(), varId: blockId }),
]);

// --- insert_blocks ---------------------------------------------------------

const inputBlockSchemas = (
  ["number", "slider", "select", "boolean"] as const
).map((type) =>
  z.strictObject({
    ...inputFields,
    id: z.string().optional(),
    type: z.literal(type),
  })
);

const proseTypes = PROSE_BLOCK_TYPES.filter((type) => type !== "heading");

export const notebookBlockSchema = z.union([
  z.strictObject({
    id: z.string().optional(),
    level: headingLevel.optional(),
    text: z.string(),
    type: z.literal("heading"),
  }),
  z.strictObject({
    id: z.string().optional(),
    text: z.string().describe("Plain text. @name inserts a live value."),
    type: z.enum(proseTypes as [string, ...string[]]),
  }),
  ...inputBlockSchemas,
  z.strictObject({
    formula: expressionSchema,
    id: z.string().optional(),
    name: variableNameSchema,
    type: z.literal("formula"),
  }),
]);

export const insertBlocksSchema = z.strictObject({
  blocks: z.array(notebookBlockSchema).min(1),
  placement: placementSchema.optional(),
  referenceBlockId: blockId.optional(),
});

// --- write_section ---------------------------------------------------------

const dryRun = z.boolean().optional().describe("Preview without writing.");

export const writeSectionSchema = sectionSchema.extend({ dry_run: dryRun });

export const writeSectionsSchema = z.strictObject({
  dry_run: dryRun,
  sections: z.array(sectionSchema).min(1),
});

// --- update_block ----------------------------------------------------------

export { updateBlockSchema } from "../engine/block-update";

export const updateBlocksSchema = z.strictObject({
  blocks: z.array(updateBlockSchema).min(1),
});

// --- Remaining document tools ----------------------------------------------

export const removeBlocksSchema = z.strictObject({
  ids: z.array(blockId).min(1).describe("Block ids to remove."),
});

export const replaceParagraphSchema = z.strictObject({
  id: blockId.describe("Paragraph block id."),
  text: z
    .string()
    .describe("Replacement plain text. @name inserts a live value."),
});

export const insertInlineRefSchema = z.strictObject({
  blockId: blockId.describe("Paragraph block id."),
  offset: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe(
      "Optional UTF-16 offset into the block's plain text, as get_document reports it; omit to append."
    ),
  variable: z.string().min(1).describe("Variable name to reference."),
});

export const setVariableSchema = z.strictObject({
  name: z.string().min(1).describe("Variable name."),
  value: z.number().finite().describe("New finite numeric variable value."),
});

// --- Scenario tools --------------------------------------------------------

export const scenarioNameSchema = z.strictObject({
  name: z.string().min(1).describe("Scenario name."),
});

export const saveScenarioSchema = z.strictObject({
  name: z.string().min(1).describe("Scenario name."),
  values: z
    .record(z.string(), z.number())
    .optional()
    .describe("Optional values keyed by input name."),
});

export type NotebookBlock = z.infer<typeof notebookBlockSchema>;
export type NotebookVariableSelector = z.infer<typeof variableSelectorSchema>;

/** Renders a schema as the JSON Schema the WebMCP registration publishes. */
export function toInputSchema(schema: z.ZodType): object {
  const { $schema: _schema, ...rest } = z.toJSONSchema(schema, {
    io: "input",
    target: "draft-7",
    unrepresentable: "any",
  }) as Record<string, unknown>;
  return rest;
}
