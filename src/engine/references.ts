import type { ModeloBlock, ModeloDocument, ProjectedVariable } from "../model";
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

function containsInlineRef(value: unknown, varId: string): boolean {
  if (Array.isArray(value)) {
    return value.some((item) => containsInlineRef(item, varId));
  }
  if (!value || typeof value !== "object") {
    return false;
  }
  const node = value as Record<string, unknown>;
  const props = node.props as Record<string, unknown> | undefined;
  if (
    (node.type === "variableRef" && props?.varId === varId) ||
    (node.type === "ref" && (node.varId === varId || props?.varId === varId))
  ) {
    return true;
  }
  return Object.entries(node).some(
    ([key, item]) => key !== "children" && containsInlineRef(item, varId)
  );
}

/** Resolves a name, a varId, or either, against a projected model. */
function findCandidate(
  model: ReturnType<typeof projectDocument>,
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

function resolveVariable(
  document: ModeloDocument,
  query: string | ReferenceQuery
): {
  variable: ProjectedVariable;
  model: ReturnType<typeof projectDocument>;
} {
  const model = projectDocument(document);
  const candidate = findCandidate(model, query);
  if (!candidate) {
    const identifier =
      typeof query === "string" ? query : (query.varId ?? query.name ?? "");
    throw new ModelValidationError(
      identifier
        ? `Variable not found: ${identifier}`
        : "findReferences requires a variable name or varId"
    );
  }
  return { model, variable: candidate };
}

/** Finds formula and paragraph block IDs that reference one variable. */
export function findReferences(
  document: ModeloDocument,
  query: string | ReferenceQuery
): VariableReferences {
  const { variable, model } = resolveVariable(document, query);
  const formulas = model.variables
    .filter(
      (candidate) =>
        candidate.kind === "formula" &&
        getFormulaDependencies(candidate, model).includes(variable.name)
    )
    .map((candidate) => candidate.blockId);
  const paragraphs: string[] = [];

  const visit = (blocks: ModeloDocument): void => {
    for (const block of blocks) {
      if (block.type === "paragraph") {
        const contentBlock = block as Record<string, unknown>;
        if (
          containsInlineRef(contentBlock.content, variable.varId) ||
          containsInlineRef(contentBlock.inline, variable.varId)
        ) {
          paragraphs.push(block.id);
        }
      }
      if (Array.isArray(block.children)) {
        visit(block.children as ModeloBlock[]);
      }
    }
  };
  visit(document);

  return {
    formulas: [...new Set(formulas)],
    name: variable.name,
    paragraphs: [...new Set(paragraphs)],
    varId: variable.varId,
  };
}
