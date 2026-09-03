import { z } from "zod";

import { inlineContentFromText } from "./portable";
import type { PortableBlock } from "./portable";
import { CURRENCIES, UNITS } from "./units";
import {
  coerceInputValue,
  expressionSchema,
  impliedFormat,
  inputFieldsSchema,
  percentRangeProblem,
  variableNameSchema,
} from "./variable";

const NON_BLANK = /\S/u;
const SECTION_HEADING_LEVEL = 2;

export const currencySchema = z.enum(CURRENCIES);
export const unitSchema = z.enum(UNITS);
export const placementSchema = z.enum(["before", "after"]);

const { locale: _locale, ...agentInputFields } = inputFieldsSchema;
export const inputFields = {
  ...agentInputFields,
  currency: currencySchema.optional(),
  format: agentInputFields.format.describe(
    "number, currency, percent, or unit. A percent input stores whole percents: 21 means 21 %, and formulas receive it as the ratio 0.21."
  ),
  max: agentInputFields.max.describe(
    "Slider upper bound, in the same scale as value. A percent slider runs 0 to 100, never 0 to 1."
  ),
  min: agentInputFields.min.describe(
    "Slider lower bound, in the same scale as value."
  ),
  unit: unitSchema.optional(),
  value: agentInputFields.value.describe(
    "The stored value. Whole percents for format percent: write 5 for 5 %, not 0.05."
  ),
};

/** Refuses a percent slider whose range is a ratio, on every write path. */
export function refinePercentRange(
  fields: { format?: unknown; min?: unknown; max?: unknown },
  context: z.RefinementCtx
): void {
  const message = percentRangeProblem(fields);
  if (message) {
    context.addIssue({ code: "custom", message, path: ["max"] });
  }
}

export const sectionInputSchema = z
  .strictObject({
    ...inputFields,
    kind: z.enum(["number", "slider", "select", "boolean"]),
  })
  .superRefine(refinePercentRange);

export const sectionFormulaSchema = z.strictObject({
  formula: expressionSchema,
  name: variableNameSchema,
});

export const sectionSchema = z.strictObject({
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
  placement: placementSchema
    .optional()
    .describe("Position relative to referenceBlockId; defaults to after."),
  referenceBlockId: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Existing block id used as the insertion anchor. Omit to append."
    ),
});

export type SectionInput = z.infer<typeof sectionInputSchema>;
export type SectionFormula = z.infer<typeof sectionFormulaSchema>;
export type Section = z.infer<typeof sectionSchema>;

/** Every variable name a section declares, in order. */
export function sectionVariableNames(section: Section): string[] {
  return [...(section.inputs ?? []), ...(section.formulas ?? [])].map(
    (item) => item.name
  );
}

function inputBlock(
  input: SectionInput,
  id: string,
  varId: string
): PortableBlock {
  const { kind, value, name, ...rest } = input;
  const format = impliedFormat(input);
  const block: Record<string, unknown> = {
    id,
    name,
    type: kind,
    value: coerceInputValue(kind, value),
    varId,
  };
  if (format !== "number") {
    block.format = format;
  }
  for (const [key, field] of Object.entries(rest)) {
    if (field !== undefined && key !== "format") {
      block[key] = field;
    }
  }
  return block as PortableBlock;
}

function formulaBlock(
  formula: SectionFormula,
  id: string,
  varId: string
): PortableBlock {
  return {
    formula: formula.formula,
    id,
    name: formula.name,
    type: "formula",
    varId,
  };
}

/**
 * Builds the portable blocks for one section: heading, then prose, then the
 * variables the prose mentions. Names declared here resolve inside the same
 * section, so a paragraph may mention a formula that follows it.
 */
export function buildSectionBlocks(
  section: Section,
  existingIdByName: Record<string, string>,
  makeId: () => string
): PortableBlock[] {
  const idByName = Object.assign(
    Object.create(null) as Record<string, string>,
    existingIdByName
  );
  const variables: PortableBlock[] = [];
  for (const input of section.inputs ?? []) {
    const varId = makeId();
    idByName[input.name] = varId;
    variables.push(inputBlock(input, makeId(), varId));
  }
  for (const formula of section.formulas ?? []) {
    const varId = makeId();
    idByName[formula.name] = varId;
    variables.push(formulaBlock(formula, makeId(), varId));
  }

  const paragraphs: PortableBlock[] = section.body
    .split(/\n+/u)
    .map((text) => text.trim())
    .filter(Boolean)
    .map((text) => ({
      id: makeId(),
      inline: inlineContentFromText(text, idByName),
      type: "paragraph",
    }));

  return [
    {
      id: makeId(),
      level: SECTION_HEADING_LEVEL,
      text: section.heading,
      type: "heading",
    },
    ...paragraphs,
    ...variables,
  ];
}
