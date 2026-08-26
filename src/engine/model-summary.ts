import type { ModeloBlock, ModeloDocument } from "../model";
import { evaluateModel, getFormulaDependencies } from "./evaluate";
import { projectDocument } from "./projector";

function containsInlineRef(value: unknown, varId: string): boolean {
  if (Array.isArray(value)) return value.some((item) => containsInlineRef(item, varId));
  if (!value || typeof value !== "object") return false;
  const node = value as Record<string, unknown>;
  if ((node.type === "variableRef" && (node.props as Record<string, unknown> | undefined)?.varId === varId)
    || (node.type === "ref" && (node.varId === varId || (node.props as Record<string, unknown> | undefined)?.varId === varId))) return true;
  return Object.values(node).some((item) => containsInlineRef(item, varId));
}

function visitBlocks(blocks: ModeloDocument, visitor: (block: ModeloBlock) => void): void {
  for (const block of blocks) {
    visitor(block);
    if (Array.isArray(block.children)) visitBlocks(block.children, visitor);
  }
}

/** Builds the read-only get_model projection without assuming every block has content. */
export function getModelSummary(document: ModeloDocument, defaults?: { currency?: string; locale?: string }) {
  const projected = projectDocument(document);
  const evaluated = evaluateModel(projected, defaults);
  const formulaUsers = new Map<string, string[]>();
  for (const formula of projected.variables) {
    if (formula.kind !== "formula") continue;
    for (const name of getFormulaDependencies(formula, projected)) {
      const varId = projected.idByName[name];
      formulaUsers.set(varId, [...(formulaUsers.get(varId) ?? []), formula.blockId]);
    }
  }

  return evaluated.variables.map((variable) => {
    const usedBy = [...(formulaUsers.get(variable.varId) ?? [])];
    visitBlocks(document, (block) => {
      if (containsInlineRef((block as Record<string, unknown>).content, variable.varId)
        || containsInlineRef((block as Record<string, unknown>).inline, variable.varId)) usedBy.push(block.id);
    });
    return {
      id: variable.varId,
      name: variable.name,
      kind: variable.kind,
      value: variable.value,
      formatted: variable.formatted,
      unit: variable.unit || variable.currency,
      error: variable.error ?? null,
      usedBy: [...new Set(usedBy)],
    };
  });
}
