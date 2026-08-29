import type {
  EvaluationResult,
  ModeloDocument,
  ProjectedModel,
} from "../model";
import { getComposition } from "./composition";
import type { Composition } from "./composition";
import { defaultFormulaEngine, evaluateModel } from "./evaluate";
import type { FormulaEngine } from "./evaluate";
import type { FormatDefaults } from "./format";
import { inspectDocument } from "./projector";

/**
 * A notebook is a document together with everything derived from it. It is
 * computed once per document version, and every reader takes it from here
 * instead of projecting and evaluating on its own.
 */
export interface Notebook {
  document: ModeloDocument;
  projected: ProjectedModel;
  evaluated: EvaluationResult;
}

export function describeNotebook(
  document: ModeloDocument,
  defaults: FormatDefaults = {},
  engine: FormulaEngine = defaultFormulaEngine
): Notebook {
  // Lenient projection: one invalid block becomes one error row, not an
  // empty model with every chip reading `missing`.
  const projected = inspectDocument(document);
  return {
    document,
    evaluated: evaluateModel(projected, defaults, engine),
    projected,
  };
}

export interface VariableProblem {
  name: string;
  status: "missing" | "error";
  error: string | undefined;
}

/** What a mutation changed, as the agent sees it. */
export interface MutationReport {
  changed: Record<string, string>;
  errors: VariableProblem[];
  composition: Composition;
}

/** Variables whose evaluation differs between two notebook versions. */
export function diffNotebooks(
  before: Notebook,
  after: Notebook
): MutationReport {
  const changed: Record<string, string> = Object.create(null);
  for (const variable of after.evaluated.variables) {
    const old = before.evaluated.byId[variable.varId];
    const differs =
      !old ||
      variable.status !== "ok" ||
      old.status !== variable.status ||
      old.value !== variable.value ||
      old.formatted !== variable.formatted ||
      old.error !== variable.error;
    if (differs) {
      changed[variable.name] = variable.formatted;
    }
  }
  return {
    changed,
    composition: getComposition(after.document),
    errors: after.evaluated.variables
      .filter((variable) => variable.status !== "ok")
      .map((variable) => ({
        error: variable.error,
        name: variable.name,
        status: variable.status as "missing" | "error",
      })),
  };
}
