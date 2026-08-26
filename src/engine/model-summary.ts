import type { FormatKind, ModeloDocument, NumberFormat, ProjectedInput } from "../model";
import { evaluateModel } from "./evaluate";
import { projectDocument } from "./projector";
import { findReferences } from "./references";

export interface ModelSummaryOptions {
  includeDependencies?: boolean;
}

export interface ModelSummaryVariable {
  name: string;
  kind: "input" | "formula";
  value: number | null;
  formatted: string;
  error: string | null;
  format: FormatKind | null;
  currency?: string;
  unit?: string;
  usedBy?: string[];
}

function formatKind(variable: ProjectedInput): FormatKind {
  if (typeof variable.format === "string") return variable.format;
  return variable.format?.style ?? "number";
}

function nestedFormat(variable: ProjectedInput): NumberFormat | undefined {
  return typeof variable.format === "object" ? variable.format : undefined;
}

/** Builds the slim, read-only get_model projection. */
export function getModelSummary(
  document: ModeloDocument,
  defaults: { currency?: string; locale?: string } = {},
  options: ModelSummaryOptions = {},
): ModelSummaryVariable[] {
  const projected = projectDocument(document);
  const evaluated = evaluateModel(projected, defaults);

  return evaluated.variables.map((variable) => {
    const format = variable.kind === "input" ? formatKind(variable) : null;
    const nested = variable.kind === "input" ? nestedFormat(variable) : undefined;
    const summary: ModelSummaryVariable = {
      name: variable.name,
      kind: variable.kind,
      value: variable.value ?? null,
      formatted: variable.formatted,
      error: variable.error ?? null,
      format,
    };
    if (variable.kind === "input" && format === "currency") {
      summary.currency = variable.currency
        || (nested?.style === "currency" ? nested.currency : undefined)
        || defaults.currency
        || "EUR";
    }
    if (variable.kind === "input" && format === "unit") {
      const unit = variable.unit || (nested?.style === "unit" ? nested.unit : undefined);
      if (unit) summary.unit = unit;
    }
    if (options.includeDependencies) {
      const references = findReferences(document, { varId: variable.varId });
      summary.usedBy = [...references.formulas, ...references.paragraphs];
    }
    return summary;
  });
}
