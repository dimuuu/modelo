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
      return { locale, maximumFractionDigits: 1, style: "number" };
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
  const sourceFormat =
    typeof input === "string"
      ? input
      : (input && "format" in input
        ? input.format
        : undefined);
  const decimals =
    typeof input === "object" &&
    input &&
    "decimals" in input &&
    input.decimals !== undefined &&
    input.decimals >= 0
      ? input.decimals
      : undefined;
  if (sourceFormat === "percent") {
    return new Intl.NumberFormat(format.locale, {
      maximumFractionDigits: decimals ?? 1,
      minimumFractionDigits: decimals,
      style: "percent",
    }).format(value);
  }
  const currencyDigits =
    format.style === "currency" && decimals === undefined
      ? (Number.isInteger(value)
        ? 0
        : 2)
      : undefined;
  const digitOptions = {
    maximumFractionDigits:
      decimals ?? currencyDigits ?? format.maximumFractionDigits,
    minimumFractionDigits:
      decimals ?? currencyDigits ?? format.minimumFractionDigits,
  };
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
