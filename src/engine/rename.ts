import { isSymbolNode, parse, SymbolNode } from "mathjs";
import type { ModeloBlock, ModeloDocument } from "../model";
import { DuplicateVariableNameError, ModelValidationError, projectDocument } from "./projector";

function rewriteFormula(formula: string, oldName: string, newName: string): string {
  try {
    return parse(formula)
      .transform((node) => isSymbolNode(node) && node.name === oldName ? new SymbolNode(newName) : node)
      .toString();
  } catch {
    // Invalid formulas remain visible to the evaluator; never risk a textual partial replacement.
    return formula;
  }
}

/** Renames a variable by stable id and immutably rewrites exact formula symbols. */
export function renameVariable(document: ModeloDocument, varId: string, newName: string): ModeloDocument {
  const projected = projectDocument(document);
  const target = projected.byId[varId];
  if (!target) throw new ModelValidationError(`Unknown variable id: ${varId}`);
  const existingId = projected.idByName[newName];
  if (existingId && existingId !== varId) throw new DuplicateVariableNameError(newName);

  const renameBlocks = (blocks: ModeloDocument): ModeloDocument => blocks.map((block) => {
    const props = block.props as Record<string, unknown> | undefined;
    let nextProps = props ? { ...props } : undefined;
    if (props?.varId === varId) nextProps = { ...props, name: newName };
    if ((block.type === "modelFormula" || block.type === "formula") && typeof props?.formula === "string") {
      nextProps = { ...props, formula: rewriteFormula(props.formula, target.name, newName) };
    }
    const next: ModeloBlock = { ...block };
    if (nextProps) next.props = nextProps;
    if (Array.isArray(block.children)) next.children = renameBlocks(block.children as ModeloDocument);
    return next;
  });

  const renamed = renameBlocks(document);
  projectDocument(renamed);
  return renamed;
}
