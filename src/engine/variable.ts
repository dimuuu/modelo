import { z } from "zod";

import type { FormatKind, NumberFormat } from "../model";
import type { VariableBlockType } from "./document";

/**
 * The shape of one variable and the rules that keep it valid.
 *
 * The editor, the projector, the evaluator, the tools, and the summary all
 * import these helpers instead of carrying their own copy of "decimals go
 * from 0 to 8" or "a boolean stores 0 or 1".
 */

export const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/u;
/** `@name` tokens inside prose. Use with `matchAll`; the flag is global. */
export const REFERENCE_TOKEN = /@(?<name>[A-Za-z_][A-Za-z0-9_]*)/gu;

export const DECIMALS_AUTO = -1;
export const DECIMALS_MIN = 0;
export const DECIMALS_MAX = 8;

export const FORMAT_KINDS = ["number", "currency", "percent", "unit"] as const;

export const selectOptionSchema = z.strictObject({
  label: z.string(),
  value: z.number().finite(),
});
export type SelectOption = z.infer<typeof selectOptionSchema>;

export const variableNameSchema = z.string().regex(IDENTIFIER);
export const expressionSchema = z.string().min(1).regex(/\S/u);
export const decimalsSchema = z
  .number()
  .int()
  .min(DECIMALS_MIN)
  .max(DECIMALS_MAX);
export const formatSchema = z.enum(FORMAT_KINDS);

/**
 * The fields a stored input block may carry. Currency and unit are free
 * strings here, because a notebook may hold a code the picker does not offer;
 * the agent-facing schemas narrow them to the curated lists.
 */
export const inputFieldsSchema = {
  currency: z.string().optional(),
  decimals: decimalsSchema.optional(),
  format: formatSchema.optional(),
  locale: z.string().optional(),
  max: z.number().optional(),
  min: z.number().optional(),
  name: variableNameSchema,
  options: z.array(selectOptionSchema).optional(),
  step: z.number().optional(),
  unit: z.string().optional(),
  value: z.number(),
};

/** The BlockNote prop defaults every input block shares. */
export const INPUT_PROP_DEFAULTS = {
  currency: "EUR",
  decimals: DECIMALS_AUTO,
  format: "number",
  locale: "",
  name: "Variable",
  unit: "",
  value: 0,
  varId: "",
} as const;

export const FORMULA_PROP_DEFAULTS = {
  formula: "1 + 1",
  name: "Result",
  varId: "",
} as const;

export function isIdentifier(value: unknown): value is string {
  return typeof value === "string" && IDENTIFIER.test(value);
}

/**
 * Reads select options from the JSON prop or from an already parsed array.
 * Entries that are not well formed are dropped, never coerced.
 */
export function parseSelectOptions(value: unknown): SelectOption[] {
  let parsed: unknown = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) {
    return [];
  }
  return parsed.flatMap((option) => {
    const result = selectOptionSchema.safeParse(option);
    return result.success ? [result.data] : [];
  });
}

/** The editor stores options as a JSON string prop. */
export function serializeSelectOptions(options: SelectOption[]): string {
  return JSON.stringify(options);
}

export function clampSliderValue(
  value: number,
  min: number,
  max: number
): number {
  const low = Math.min(min, max);
  const high = Math.max(min, max);
  return Math.min(high, Math.max(low, value));
}

/**
 * The value an input block stores for a requested value. Booleans store 0 or
 * 1; sliders stay inside their bounds; everything else keeps its number.
 */
export function coerceInputValue(
  type: string,
  value: number,
  bounds: { min?: unknown; max?: unknown } = {}
): number {
  if (type === "boolean") {
    return value ? 1 : 0;
  }
  if (
    type === "slider" &&
    typeof bounds.min === "number" &&
    typeof bounds.max === "number"
  ) {
    return clampSliderValue(value, bounds.min, bounds.max);
  }
  return value;
}

/** `undefined` for automatic decimals, the integer when valid, `null` when not. */
export function normalizeDecimals(
  decimals: unknown
): number | undefined | null {
  if (
    decimals === undefined ||
    decimals === null ||
    decimals === DECIMALS_AUTO
  ) {
    return undefined;
  }
  if (
    typeof decimals !== "number" ||
    !Number.isInteger(decimals) ||
    decimals < DECIMALS_MIN ||
    decimals > DECIMALS_MAX
  ) {
    return null;
  }
  return decimals;
}

interface Formatted {
  format?: FormatKind | NumberFormat;
  currency?: string;
  unit?: string;
}

export function formatKindOf(variable: Formatted): FormatKind {
  if (typeof variable.format === "string") {
    return variable.format;
  }
  return variable.format?.style ?? "number";
}

function nestedFormat(variable: Formatted): NumberFormat | undefined {
  return typeof variable.format === "object" ? variable.format : undefined;
}

export function currencyOf(
  variable: Formatted,
  defaults: { currency?: string } = {}
): string {
  const nested = nestedFormat(variable);
  const fromNested = nested?.style === "currency" ? nested.currency : undefined;
  return (
    variable.currency ||
    fromNested ||
    defaults.currency ||
    INPUT_PROP_DEFAULTS.currency
  ).toUpperCase();
}

export function unitOf(variable: Formatted): string | undefined {
  const nested = nestedFormat(variable);
  return variable.unit || (nested?.style === "unit" ? nested.unit : undefined);
}

/** The format an input declares, or the one its currency or unit implies. */
export function impliedFormat(input: Formatted): FormatKind {
  if (input.format) {
    return formatKindOf(input);
  }
  if (input.currency) {
    return "currency";
  }
  if (input.unit) {
    return "unit";
  }
  return "number";
}

/** Props for a block the slash menu inserts. `makeId` supplies the varId. */
export function newVariableProps(
  kind: VariableBlockType,
  makeId: () => string = () => crypto.randomUUID()
): Record<string, unknown> {
  const id = makeId();
  const suffix = id.slice(0, 4);
  const base = {
    name: `Variable${suffix}`,
    varId: id,
  };
  switch (kind) {
    case "slider": {
      return { ...base, max: 100, min: 0, step: 1, value: 50 };
    }
    case "select": {
      return {
        ...base,
        options: serializeSelectOptions([
          { label: "No", value: 0 },
          { label: "Yes", value: 1 },
        ]),
        value: 0,
      };
    }
    case "boolean": {
      return { ...base, value: 0 };
    }
    case "formula": {
      return {
        ...base,
        formula: FORMULA_PROP_DEFAULTS.formula,
        name: `Result${suffix}`,
      };
    }
    default: {
      return { ...base, value: 0 };
    }
  }
}
