import { isSymbolNode, SymbolNode } from "mathjs";

import type { ModeloDocument } from "../model";
import {
  isFormulaBlockType,
  isInlineRef,
  inlineRefVarId,
  mapBlocks,
} from "./document";
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

/**
 * Rewrites the name every inline reference to `varId` displays. The name is
 * stored on the chip so `blockText` stays a block-local walk.
 */
function rewriteRefs(
  content: unknown,
  varId: string,
  newName: string
): unknown {
  if (!Array.isArray(content)) {
    return content;
  }
  let changed = false;
  const next = content.map((node) => {
    if (isInlineRef(node) && inlineRefVarId(node) === varId) {
      changed = true;
      const ref = node as { props?: Record<string, unknown> };
      return { ...ref, props: { ...ref.props, name: newName } };
    }
    const nested = node as { content?: unknown };
    if (nested && typeof nested === "object" && Array.isArray(nested.content)) {
      const inner = rewriteRefs(nested.content, varId, newName);
      if (inner !== nested.content) {
        changed = true;
        return { ...nested, content: inner };
      }
    }
    return node;
  });
  return changed ? next : content;
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
    const { content } = block as { content?: unknown };
    const nextContent = rewriteRefs(content, varId, newName);
    const withRefs =
      nextContent === content ? block : { ...block, content: nextContent };
    const props = withRefs.props as Record<string, unknown> | undefined;
    if (!props) {
      return withRefs;
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
    return nextProps === props ? withRefs : { ...withRefs, props: nextProps };
  });

  projectDocument(renamed);
  return renamed;
}
