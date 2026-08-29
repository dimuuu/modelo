import { z } from "zod";

import type { ModeloBlock, ProjectedModel } from "../model";
import { isProseBlockType } from "./document";
import { currencySchema, unitSchema } from "./section";
import {
  clampSliderValue,
  DECIMALS_MAX,
  DECIMALS_MIN,
  decimalsSchema,
  expressionSchema,
  formatSchema,
  normalizeDecimals,
  selectOptionSchema,
  serializeSelectOptions,
  variableNameSchema,
} from "./variable";

/**
 * The `update_block` policy, in one place.
 *
 * The zod schema below says which field shapes exist. The table says which
 * fields each block type accepts. `planBlockUpdate` applies both, plus the
 * numeric rules, and returns either a plan the editor can apply or the
 * reason it cannot.
 */

const HEADING_LEVELS = [1, 2, 3] as const;
const headingLevel = z.union(HEADING_LEVELS.map((level) => z.literal(level)));
const blockId = z.string().min(1);

const namedValueFields = {
  id: blockId,
  name: variableNameSchema.optional(),
  value: z.number().optional(),
};

export const updateBlockSchema = z.union([
  z.strictObject({ formula: expressionSchema, id: blockId }),
  z.strictObject({
    id: blockId,
    level: headingLevel.optional(),
    text: z.string(),
  }),
  z.strictObject({ id: blockId, level: headingLevel }),
  z.strictObject({
    ...namedValueFields,
    currency: currencySchema.optional(),
    decimals: decimalsSchema.optional(),
    format: formatSchema.optional(),
    max: z.number().optional(),
    min: z.number().optional(),
    step: z.number().optional(),
    unit: unitSchema.optional(),
  }),
  z.strictObject({
    ...namedValueFields,
    options: z.array(selectOptionSchema).optional(),
  }),
  z.strictObject(namedValueFields),
]);

export type UpdateBlockArgs = z.infer<typeof updateBlockSchema>;

const IDENTITY = ["name", "value"] as const;
const DISPLAY = [
  "format",
  "currency",
  "unit",
  "decimals",
  "min",
  "max",
  "step",
] as const;

/** Which fields each block type accepts. Adding a type is adding a row. */
const ALLOWED_FIELDS: Record<string, ReadonlySet<string>> = {
  boolean: new Set(IDENTITY),
  bulletListItem: new Set(["text"]),
  checkListItem: new Set(["text"]),
  formula: new Set(["formula"]),
  heading: new Set(["text", "level"]),
  number: new Set([...IDENTITY, ...DISPLAY]),
  numberedListItem: new Set(["text"]),
  paragraph: new Set(["text"]),
  select: new Set([...IDENTITY, "options"]),
  slider: new Set([...IDENTITY, ...DISPLAY]),
};

const NUMERIC_FIELDS = ["value", "min", "max", "step", "decimals"] as const;

export type UpdateProblemCode =
  | "NOT_FOUND"
  | "INVALID_UPDATE"
  | "INVALID_VALUE"
  | "DUPLICATE_VARIABLE_NAME";

export interface UpdateProblem {
  ok: false;
  code: UpdateProblemCode;
  message: string;
}

export interface UpdatePlan {
  ok: true;
  block: ModeloBlock;
  /** Set when the variable name changes; formulas must be rewritten too. */
  rename?: { varId: string; name: string };
  /** Prop changes for variable blocks. */
  props?: Record<string, unknown>;
  /** Replacement prose for text blocks. */
  text?: string;
  level?: number;
}

function problem(code: UpdateProblemCode, message: string): UpdateProblem {
  return { code, message, ok: false };
}

type Fields = Record<string, unknown>;

function checkNumericRules(
  block: ModeloBlock,
  fields: Fields
): UpdateProblem | undefined {
  const props = (block.props ?? {}) as Fields;
  for (const key of NUMERIC_FIELDS) {
    if (fields[key] !== undefined && !Number.isFinite(fields[key])) {
      return problem("INVALID_VALUE", `${key} must be finite.`);
    }
  }
  if (typeof fields.step === "number" && fields.step <= 0) {
    return problem("INVALID_VALUE", "step must be positive.");
  }
  if (
    fields.decimals !== undefined &&
    normalizeDecimals(fields.decimals) === null
  ) {
    return problem(
      "INVALID_VALUE",
      `decimals must be an integer from ${DECIMALS_MIN} to ${DECIMALS_MAX}.`
    );
  }
  const min = fields.min ?? props.min;
  const max = fields.max ?? props.max;
  if (typeof min === "number" && typeof max === "number" && min > max) {
    return problem("INVALID_VALUE", "min must not exceed max.");
  }
  const format = fields.format ?? props.format;
  if (format === "unit" && !(fields.unit ?? props.unit)) {
    return problem("INVALID_VALUE", "unit format requires a unit.");
  }
  return undefined;
}

function variableProps(block: ModeloBlock, fields: Fields): Fields {
  const props = (block.props ?? {}) as Fields;
  const next: Fields = { ...fields };
  if (block.type === "slider") {
    const min = (fields.min ?? props.min) as number;
    const max = (fields.max ?? props.max) as number;
    const value = (fields.value ?? props.value) as number;
    next.value = clampSliderValue(value, min, max);
  }
  if (Array.isArray(next.options)) {
    next.options = serializeSelectOptions(
      next.options as { label: string; value: number }[]
    );
  }
  return next;
}

/**
 * Decides what one `update_block` call does to one block, without touching
 * the editor. `model` is the current projection, used for name uniqueness.
 */
export function planBlockUpdate(
  model: ProjectedModel,
  block: ModeloBlock | undefined,
  args: UpdateBlockArgs
): UpdatePlan | UpdateProblem {
  const { id, ...fields } = args as Fields & { id: string };
  if (!block) {
    return problem("NOT_FOUND", `Block '${id}' not found.`);
  }
  const allowed = ALLOWED_FIELDS[block.type];
  if (!allowed) {
    return problem(
      "INVALID_UPDATE",
      `Block type '${block.type}' is not supported by update_block.`
    );
  }
  const keys = Object.keys(fields);
  if (keys.length === 0 || keys.some((key) => !allowed.has(key))) {
    return block.type === "formula"
      ? problem(
          "INVALID_UPDATE",
          "Formula updates require exactly { id, formula }."
        )
      : problem("INVALID_UPDATE", `Fields are not valid for ${block.type}.`);
  }

  if (isProseBlockType(block.type)) {
    return {
      block,
      ok: true,
      ...(typeof fields.text === "string" ? { text: fields.text } : {}),
      ...(typeof fields.level === "number" ? { level: fields.level } : {}),
    };
  }

  const props = (block.props ?? {}) as Fields;
  if (block.type !== "formula") {
    const failed = checkNumericRules(block, fields);
    if (failed) {
      return failed;
    }
  }
  const plan: UpdatePlan = {
    block,
    ok: true,
    props: variableProps(block, fields),
  };
  const nextName = fields.name;
  if (typeof nextName === "string" && nextName !== props.name) {
    const taken = model.idByName[nextName];
    if (taken && taken !== props.varId) {
      return problem(
        "DUPLICATE_VARIABLE_NAME",
        `Variable '${nextName}' already exists.`
      );
    }
    plan.rename = { name: nextName, varId: props.varId as string };
    delete plan.props?.name;
  }
  return plan;
}
