import { isSymbolNode, SymbolNode } from "mathjs";

import type { ModeloDocument } from "../model";
import { isFormulaBlockType, mapBlocks } from "./document";
import { defaultFormulaEngine } from "./evaluate";
import type { FormulaEngine } from "./evaluate";
import {
  DuplicateVariableNameError,
  ModelValidationError,
  projectDocument,
} from "./projector";

function rewriteFormula(
  formula: string,
  oldName: string,
  newName: string,
  engine: FormulaEngine
): string {
  try {
    return engine
      .parse(formula)
      .transform((node) =>
        isSymbolNode(node) && node.name === oldName
          ? new SymbolNode(newName)
          : node
      )
      .toString();
  } catch {
    // Invalid formulas remain visible to the evaluator; never risk a textual partial replacement.
    return formula;
  }
}

/** Renames a variable by stable id and immutably rewrites exact formula symbols. */
export function renameVariable(
  document: ModeloDocument,
  varId: string,
  newName: string,
  engine: FormulaEngine = defaultFormulaEngine
): ModeloDocument {
  const projected = projectDocument(document);
  const target = projected.byId[varId];
  if (!target) {
    throw new ModelValidationError(`Unknown variable id: ${varId}`);
  }
  const existingId = projected.idByName[newName];
  if (existingId && existingId !== varId) {
    throw new DuplicateVariableNameError(newName);
  }

  const renamed = mapBlocks(document, (block) => {
    const props = block.props as Record<string, unknown> | undefined;
    if (!props) {
      return block;
    }
    let nextProps = props;
    if (props.varId === varId) {
      nextProps = { ...nextProps, name: newName };
    }
    if (isFormulaBlockType(block.type) && typeof props.formula === "string") {
      nextProps = {
        ...nextProps,
        formula: rewriteFormula(props.formula, target.name, newName, engine),
      };
    }
    return nextProps === props ? block : { ...block, props: nextProps };
  });

  projectDocument(renamed);
  return renamed;
}
