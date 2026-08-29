import type {
  EvaluationResult,
  FormatKind,
  ModeloDocument,
  ProjectedModel,
} from "../model";
import { evaluateModel } from "./evaluate";
import type { FormatDefaults } from "./format";
import { projectDocument } from "./projector";
import { findReferences } from "./references";
import { currencyOf, formatKindOf, unitOf } from "./variable";

export interface ModelSummaryOptions {
  includeDependencies?: boolean;
}

export interface ModelSummaryVariable {
  blockId: string;
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

function summarize(document: ModeloDocument, defaults: FormatDefaults) {
  const projected = projectDocument(document);
  return { evaluated: evaluateModel(projected, defaults), projected };
}

/** Builds the slim, read-only get_model projection. */
export function getModelSummary(
  document: ModeloDocument,
  defaults: FormatDefaults = {},
  options: ModelSummaryOptions = {},
  model: { projected: ProjectedModel; evaluated: EvaluationResult } = summarize(
    document,
    defaults
  )
): ModelSummaryVariable[] {
  return model.evaluated.variables.map((variable) => {
    const format = variable.kind === "input" ? formatKindOf(variable) : null;
    const summary: ModelSummaryVariable = {
      blockId: variable.blockId,
      error: variable.error ?? null,
      format,
      formatted: variable.formatted,
      kind: variable.kind,
      name: variable.name,
      value: variable.value ?? null,
    };
    if (variable.kind === "input" && format === "currency") {
      summary.currency = currencyOf(variable, defaults);
    }
    if (variable.kind === "input" && format === "unit") {
      const unit = unitOf(variable);
      if (unit) {
        summary.unit = unit;
      }
    }
    if (options.includeDependencies) {
      const references = findReferences(
        document,
        { varId: variable.varId },
        model.projected
      );
      summary.usedBy = [...references.formulas, ...references.paragraphs];
    }
    return summary;
  });
}
