import { z } from "zod";

import { CURRENCIES, UNITS } from "../engine/units";

/**
 * Every WebMCP tool argument shape, declared once.
 *
 * These schemas are the single source of truth for three things: the JSON
 * Schema published to the agent, the TypeScript type the adapter receives, and
 * the runtime check that rejects malformed arguments before they reach the
 * BlockNote document.
 */

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/u;
const NON_BLANK = /\S/u;
const DECIMALS_MIN = 0;
const DECIMALS_MAX = 8;
const HEADING_LEVELS = [1, 2, 3] as const;

const variableName = z.string().regex(IDENTIFIER);
const blockId = z.string().min(1);
const label = z.string().min(1);
const decimals = z.number().int().min(DECIMALS_MIN).max(DECIMALS_MAX);
const expression = z.string().min(1).regex(NON_BLANK);
const headingLevel = z.union(HEADING_LEVELS.map((level) => z.literal(level)));
const format = z.enum(["number", "currency", "percent", "unit"]);
const currency = z.enum(CURRENCIES);
const unit = z.enum(UNITS);
const placement = z.enum(["before", "after"]);
const selectOption = z.strictObject({ label: z.string(), value: z.number() });

/** Display fields shared by every input block and by write_section inputs. */
const displayFields = {
  currency: currency.optional(),
  decimals: decimals.optional(),
  format: format.optional(),
  label: label.optional(),
  unit: unit.optional(),
};

/** Display fields plus the bounds and options an input block may carry. */
const inputFields = {
  ...displayFields,
  max: z.number().optional(),
  min: z.number().optional(),
  name: variableName,
  options: z.array(selectOption).optional(),
  step: z.number().optional(),
  value: z.number(),
};

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
  z.strictObject({ name: variableName }),
  z.strictObject({ varId: blockId }),
]);

export const removeVariableSchema = z.union([
  z.strictObject({ force: z.boolean().optional(), name: variableName }),
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

export const notebookBlockSchema = z.union([
  z.strictObject({
    id: z.string().optional(),
    level: headingLevel.optional(),
    text: z.string(),
    type: z.literal("heading"),
  }),
  z.strictObject({
    id: z.string().optional(),
    text: z.string(),
    type: z.literal("paragraph"),
  }),
  z.strictObject({
    id: z.string().optional(),
    text: z.string(),
    type: z.literal("bullet"),
  }),
  ...inputBlockSchemas,
  z.strictObject({
    formula: expression,
    id: z.string().optional(),
    label: label.optional(),
    name: variableName,
    type: z.literal("formula"),
  }),
]);

export const insertBlocksSchema = z.strictObject({
  blocks: z.array(notebookBlockSchema).min(1),
  placement: placement.optional(),
  referenceBlockId: blockId.optional(),
});

// --- write_section ---------------------------------------------------------

const sectionInputSchema = z.strictObject({
  ...displayFields,
  kind: z.enum(["number", "slider", "select", "boolean"]),
  max: z.number().optional(),
  min: z.number().optional(),
  name: variableName,
  options: z.array(selectOption).optional(),
  step: z.number().optional(),
  value: z.number(),
});

const sectionFormulaSchema = z.strictObject({
  formula: expression,
  label: label.optional(),
  name: variableName,
});

const sectionFields = {
  body: z
    .string()
    .min(1)
    .regex(NON_BLANK)
    .describe(
      "One to three short paragraphs. Newlines start paragraphs; @name inserts a live value."
    ),
  formulas: z
    .array(sectionFormulaSchema)
    .optional()
    .describe("Named formulas whose result is reused later."),
  heading: z.string().min(1).describe("Section title."),
  inputs: z
    .array(sectionInputSchema)
    .optional()
    .describe("Assumptions the reader will change."),
  placement: placement
    .optional()
    .describe("Position relative to referenceBlockId; defaults to after."),
  referenceBlockId: blockId
    .optional()
    .describe(
      "Existing block id used as the insertion anchor. Omit to append."
    ),
};

export const writeSectionSchema = z.strictObject({
  ...sectionFields,
  dry_run: z.boolean().optional().describe("Preview without writing."),
});

export const writeSectionsSchema = z.strictObject({
  dry_run: z.boolean().optional().describe("Preview without writing."),
  sections: z.array(z.strictObject(sectionFields)).min(1),
});

// --- update_block ----------------------------------------------------------

const namedValueFields = {
  id: blockId,
  label: label.optional(),
  name: variableName.optional(),
  value: z.number().optional(),
};

export const updateBlockSchema = z.union([
  z.strictObject({ formula: expression, id: blockId }),
  z.strictObject({
    id: blockId,
    level: headingLevel.optional(),
    text: z.string(),
  }),
  z.strictObject({ id: blockId, level: headingLevel }),
  z.strictObject({
    ...namedValueFields,
    currency: currency.optional(),
    decimals: decimals.optional(),
    format: format.optional(),
    max: z.number().optional(),
    min: z.number().optional(),
    step: z.number().optional(),
    unit: unit.optional(),
  }),
  z.strictObject({
    ...namedValueFields,
    options: z.array(selectOption).optional(),
  }),
  z.strictObject(namedValueFields),
]);

export const updateBlocksSchema = z.strictObject({
  blocks: z.array(updateBlockSchema).min(1),
});

// --- Remaining document tools ----------------------------------------------

export const removeBlocksSchema = z.strictObject({
  ids: z.array(blockId).min(1).describe("Block ids to remove."),
});

export const replaceParagraphSchema = z.strictObject({
  id: blockId.describe("Paragraph block id."),
  text: z.string().describe("Replacement plain text."),
});

export const insertInlineRefSchema = z.strictObject({
  blockId: blockId.describe("Paragraph block id."),
  label: label.optional().describe("Optional displayed label."),
  offset: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Optional UTF-16 insertion offset; omit to append."),
  variable: z.string().min(1).describe("Variable name to reference."),
});

export const setVariableSchema = z.strictObject({
  name: z.string().min(1).describe("Variable name."),
  value: z.number().describe("New finite numeric variable value."),
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

// --- Inferred argument types ------------------------------------------------

export type WorkspaceOpenArgs = z.infer<typeof workspaceOpenSchema>;
export type WorkspaceCreateArgs = z.infer<typeof workspaceCreateSchema>;
export type WorkspaceDuplicateArgs = z.infer<typeof workspaceDuplicateSchema>;
export type WorkspaceDeleteArgs = z.infer<typeof workspaceDeleteSchema>;
export type WorkspaceRenameArgs = z.infer<typeof workspaceRenameSchema>;

export type NotebookBlock = z.infer<typeof notebookBlockSchema>;
export type NotebookGetModelArgs = z.infer<typeof getModelSchema>;
export type NotebookInsertBlocksArgs = z.infer<typeof insertBlocksSchema>;
export type NotebookWriteSectionArgs = z.infer<typeof writeSectionSchema>;
export type NotebookWriteSectionsArgs = z.infer<typeof writeSectionsSchema>;
export type NotebookUpdateBlockArgs = z.infer<typeof updateBlockSchema>;
export type NotebookUpdateBlocksArgs = z.infer<typeof updateBlocksSchema>;
export type NotebookRemoveBlocksArgs = z.infer<typeof removeBlocksSchema>;
export type NotebookVariableSelector = z.infer<typeof variableSelectorSchema>;
export type NotebookFindReferencesArgs = NotebookVariableSelector;
export type NotebookRemoveVariableArgs = z.infer<typeof removeVariableSchema>;
export type NotebookReplaceParagraphArgs = z.infer<
  typeof replaceParagraphSchema
>;
export type NotebookInsertInlineRefArgs = z.infer<typeof insertInlineRefSchema>;
export type NotebookSetVariableArgs = z.infer<typeof setVariableSchema>;
export type NotebookSaveScenarioArgs = z.infer<typeof saveScenarioSchema>;
export type NotebookScenarioArgs = z.infer<typeof scenarioNameSchema>;

/** Renders a schema as the JSON Schema the WebMCP registration publishes. */
export function toInputSchema(schema: z.ZodType): object {
  const { $schema: _schema, ...rest } = z.toJSONSchema(schema, {
    io: "input",
    target: "draft-7",
    unrepresentable: "any",
  }) as Record<string, unknown>;
  return rest;
}
