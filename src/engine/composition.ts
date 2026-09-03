import type { ModeloDocument } from "../model";
import {
  inlineRefs,
  isProseBlockType,
  isVariableBlockType,
  walkBlocks,
} from "./document";

export interface Composition {
  prose: number;
  variables: number;
  inline_refs: number;
  reads_like: "story" | "calculator";
  hint: string;
}

export function getComposition(document: ModeloDocument): Composition {
  let prose = 0;
  let variables = 0;
  let inline_refs = 0;

  walkBlocks(document, (block) => {
    if (isProseBlockType(block.type)) {
      prose += 1;
    }
    if (isVariableBlockType(block.type)) {
      variables += 1;
    }
    inline_refs += inlineRefs(block).length;
  });

  const variableHeavy = variables > prose;
  const reads_like =
    variableHeavy && (inline_refs === 0 || prose < 2) ? "calculator" : "story";
  return {
    hint:
      reads_like === "story"
        ? "Narrative and model are balanced."
        : "Add paragraphs that mention @names; keep blocks for assumptions the reader will change.",
    inline_refs,
    prose,
    reads_like,
    variables,
  };
}
