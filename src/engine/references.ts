import type {
  ModeloDocument,
  ProjectedModel,
  ProjectedVariable,
} from "../model";
import { inlineRefs, inlineRefVarId, walkBlocks } from "./document";
import { getFormulaDependencies } from "./evaluate";
import { ModelValidationError, projectDocument } from "./projector";

export interface ReferenceQuery {
  name?: string;
  varId?: string;
}

export interface VariableReferences {
  name: string;
  varId: string;
  formulas: string[];
  paragraphs: string[];
}

/** Resolves a name, a varId, or either, against a projected model. */
export function resolveVariable(
  model: ProjectedModel,
  query: string | ReferenceQuery
): ProjectedVariable | undefined {
  if (typeof query === "string") {
    return model.variables.find(
      (variable) => variable.name === query || variable.varId === query
    );
  }
  if (query.varId) {
    return model.byId[query.varId];
  }
  if (query.name) {
    return model.byId[model.idByName[query.name]];
  }
  return undefined;
}

/** Finds formula and paragraph block IDs that reference one variable. */
export function findReferences(
  document: ModeloDocument,
  query: string | ReferenceQuery,
  model: ProjectedModel = projectDocument(document)
): VariableReferences {
  const variable = resolveVariable(model, query);
  if (!variable) {
    const identifier =
      typeof query === "string" ? query : (query.varId ?? query.name ?? "");
    throw new ModelValidationError(
      identifier
        ? `Variable not found: ${identifier}`
        : "findReferences requires a variable name or varId"
    );
  }

  const formulas = model.variables
    .filter(
      (candidate) =>
        candidate.kind === "formula" &&
        getFormulaDependencies(candidate, model).includes(variable.name)
    )
    .map((candidate) => candidate.blockId);

  const paragraphs: string[] = [];
  walkBlocks(document, (block) => {
    const referenced = inlineRefs(block).some(
      (ref) => inlineRefVarId(ref) === variable.varId
    );
    if (referenced) {
      paragraphs.push(block.id);
    }
  });

  return {
    formulas: [...new Set(formulas)],
    name: variable.name,
    paragraphs: [...new Set(paragraphs)],
    varId: variable.varId,
  };
}
