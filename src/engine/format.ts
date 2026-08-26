import type { FormatKind, NumberFormat, ProjectedVariable } from "../model";

type FormatInput = NumberFormat | FormatKind | Pick<ProjectedVariable, "format" | "currency" | "unit" | "locale" | "decimals">;
export interface FormatDefaults { currency?: string; locale?: string }

function normalize(input: FormatInput | undefined, defaults: FormatDefaults): NumberFormat {
  const currency = defaults.currency ?? "EUR";
  const locale = defaults.locale ?? "es-ES";
  if (!input) return { style: "number", locale };
  if (typeof input === "string") {
    if (input === "currency") return { style: "currency", currency, locale };
    if (input === "unit") return { style: "unit", unit: "", locale };
    if (input === "percent") return { style: "number", locale, maximumFractionDigits: 1 };
    return { style: "number", locale };
  }
  if ("format" in input) {
    if (typeof input.format === "object") return { ...input.format, locale: input.format.locale || locale };
    if (input.format === "currency") return { style: "currency", currency: input.currency || currency, locale: input.locale || locale };
    if (input.format === "unit") return { style: "unit", unit: input.unit ?? "", locale: input.locale || locale };
    return { style: "number", locale: input.locale || locale };
  }
  return { ...input, locale: input.locale || locale };
}

/** Formats successful numeric values with workspace defaults and optional fixed decimals. */
export function formatValue(value: number, input?: FormatInput, defaults: FormatDefaults = {}): string {
  if (!Number.isFinite(value)) return "Error: non-finite result";
  const format = normalize(input, defaults);
  const sourceFormat = typeof input === "string" ? input : input && "format" in input ? input.format : undefined;
  const decimals = typeof input === "object" && input && "decimals" in input && input.decimals !== undefined && input.decimals >= 0
    ? input.decimals
    : undefined;
  if (sourceFormat === "percent") return new Intl.NumberFormat(format.locale, { style: "percent", maximumFractionDigits: decimals ?? 1, minimumFractionDigits: decimals }).format(value);
  const currencyDigits = format.style === "currency" && decimals === undefined ? (Number.isInteger(value) ? 0 : 2) : undefined;
  const digitOptions = {
    minimumFractionDigits: decimals ?? currencyDigits ?? format.minimumFractionDigits,
    maximumFractionDigits: decimals ?? currencyDigits ?? format.maximumFractionDigits,
  };
  if (format.style === "currency") {
    return new Intl.NumberFormat(format.locale, { style: "currency", currency: format.currency, ...digitOptions }).format(value);
  }
  const rendered = new Intl.NumberFormat(format.locale, digitOptions).format(value);
  return format.style === "unit" && format.unit ? `${rendered} ${format.unit}` : rendered;
}
