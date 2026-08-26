import type { FormatKind, NumberFormat, ProjectedVariable } from "../model";

type FormatInput = NumberFormat | FormatKind | Pick<ProjectedVariable, "format" | "currency" | "unit" | "locale">;

function normalize(input?: FormatInput): NumberFormat {
  if (!input) return { style: "number" };
  if (typeof input === "string") {
    if (input === "currency") return { style: "currency", currency: "USD" };
    if (input === "unit") return { style: "unit", unit: "" };
    if (input === "percent") return { style: "number", maximumFractionDigits: 1 };
    return { style: "number" };
  }
  if ("format" in input) {
    if (typeof input.format === "object") return input.format;
    if (input.format === "currency") {
      return { style: "currency", currency: input.currency ?? "USD", locale: input.locale };
    }
    if (input.format === "unit") {
      return { style: "unit", unit: input.unit ?? "", locale: input.locale };
    }
    return { style: "number", locale: input.locale };
  }
  return input;
}

/** Formats only successful numeric values. Missing/error labels are produced by the evaluator. */
export function formatValue(value: number, input?: FormatInput): string {
  if (!Number.isFinite(value)) return "Error: non-finite result";
  const format = normalize(input);
  const sourceFormat = typeof input === "string" ? input : input && "format" in input ? input.format : undefined;
  if (sourceFormat === "percent") return new Intl.NumberFormat((format as NumberFormat).locale ?? "en-US", { style: "percent", maximumFractionDigits: 1 }).format(value);
  const locale = format.locale ?? "en-US";
  const digitOptions = {
    minimumFractionDigits: format.minimumFractionDigits,
    maximumFractionDigits: format.maximumFractionDigits,
  };
  if (format.style === "currency") {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: format.currency,
      ...digitOptions,
    }).format(value);
  }
  const rendered = new Intl.NumberFormat(locale, digitOptions).format(value);
  return format.style === "unit" && format.unit ? `${rendered} ${format.unit}` : rendered;
}
