import type { FormatKind, NumberFormat, ProjectedInput } from "../model";

type FormatInput =
  | NumberFormat
  | FormatKind
  | Pick<
      ProjectedInput,
      "format" | "currency" | "unit" | "locale" | "decimals"
    >;
export interface FormatDefaults {
  currency?: string;
  locale?: string;
}

const PERCENT_DECIMALS = 2;

function normalize(
  input: FormatInput | undefined,
  defaults: FormatDefaults
): NumberFormat {
  const currency = defaults.currency ?? "EUR";
  const locale = defaults.locale ?? "es-ES";
  if (!input) {
    return { locale, style: "number" };
  }
  if (typeof input === "string") {
    if (input === "currency") {
      return { currency, locale, style: "currency" };
    }
    if (input === "unit") {
      return { locale, style: "unit", unit: "" };
    }
    if (input === "percent") {
      return {
        locale,
        maximumFractionDigits: PERCENT_DECIMALS,
        style: "number",
      };
    }
    return { locale, style: "number" };
  }
  if ("format" in input) {
    if (typeof input.format === "object") {
      return { ...input.format, locale: input.format.locale || locale };
    }
    if (input.format === "currency") {
      return {
        currency: input.currency || currency,
        locale: input.locale || locale,
        style: "currency",
      };
    }
    if (input.format === "unit") {
      return {
        locale: input.locale || locale,
        style: "unit",
        unit: input.unit ?? "",
      };
    }
    return { locale: input.locale || locale, style: "number" };
  }
  return { ...input, locale: input.locale || locale };
}

function sourceFormatOf(
  input: FormatInput | undefined
): FormatKind | NumberFormat | undefined {
  if (typeof input === "string") {
    return input;
  }
  if (input && "format" in input) {
    return input.format;
  }
  return undefined;
}

function fixedDecimals(input: FormatInput | undefined): number | undefined {
  if (
    typeof input === "object" &&
    "decimals" in input &&
    input.decimals !== undefined &&
    input.decimals >= 0
  ) {
    return input.decimals;
  }
  return undefined;
}

function digitOptionsFor(
  value: number,
  format: NumberFormat,
  decimals: number | undefined
): Pick<
  Intl.NumberFormatOptions,
  "maximumFractionDigits" | "minimumFractionDigits"
> {
  const defaultCurrencyDigits = Number.isInteger(value) ? 0 : 2;
  const currencyDigits =
    format.style === "currency" && decimals === undefined
      ? defaultCurrencyDigits
      : undefined;
  return {
    maximumFractionDigits:
      decimals ?? currencyDigits ?? format.maximumFractionDigits,
    minimumFractionDigits:
      decimals ?? currencyDigits ?? format.minimumFractionDigits,
  };
}

/** Formats successful numeric values with workspace defaults and optional fixed decimals. */
export function formatValue(
  value: number,
  input?: FormatInput,
  defaults: FormatDefaults = {}
): string {
  if (!Number.isFinite(value)) {
    return "Error: non-finite result";
  }
  const format = normalize(input, defaults);
  const decimals = fixedDecimals(input);
  if (sourceFormatOf(input) === "percent") {
    return new Intl.NumberFormat(format.locale, {
      maximumFractionDigits: decimals ?? PERCENT_DECIMALS,
      minimumFractionDigits: decimals,
      style: "percent",
    }).format(value);
  }
  const digitOptions = digitOptionsFor(value, format, decimals);
  if (format.style === "currency") {
    return new Intl.NumberFormat(format.locale, {
      currency: format.currency,
      style: "currency",
      ...digitOptions,
    }).format(value);
  }
  const rendered = new Intl.NumberFormat(format.locale, digitOptions).format(
    value
  );
  return format.style === "unit" && format.unit
    ? `${rendered} ${format.unit}`
    : rendered;
}
