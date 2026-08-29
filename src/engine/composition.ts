import type { ModeloDocument } from "../model";

export interface Composition {
  prose: number;
  variables: number;
  inline_refs: number;
  reads_like: "story" | "calculator";
  hint: string;
}

const PROSE_TYPES = new Set([
  "heading",
  "paragraph",
  "bullet",
  "bulletListItem",
  "numberedListItem",
  "checkListItem",
]);
const VARIABLE_TYPES = new Set([
  "number",
  "slider",
  "select",
  "boolean",
  "formula",
  "modelVariable",
  "variable",
  "modelFormula",
]);

function countInlineRefs(value: unknown): number {
  if (Array.isArray(value)) {
    let total = 0;
    for (const item of value) {
      total += countInlineRefs(item);
    }
    return total;
  }
  if (!value || typeof value !== "object") {
    return 0;
  }
  const node = value as Record<string, unknown>;
  let total = node.type === "variableRef" || node.type === "ref" ? 1 : 0;
  for (const [key, item] of Object.entries(node)) {
    if (key !== "type") {
      total += countInlineRefs(item);
    }
  }
  return total;
}

export function getComposition(document: ModeloDocument): Composition {
  let prose = 0;
  let variables = 0;
  let inline_refs = 0;

  const visit = (blocks: ModeloDocument) => {
    for (const block of blocks) {
      if (PROSE_TYPES.has(block.type)) {
        prose += 1;
      }
      if (VARIABLE_TYPES.has(block.type)) {
        variables += 1;
      }
      const contentBlock = block as Record<string, unknown>;
      inline_refs +=
        countInlineRefs(contentBlock.content) +
        countInlineRefs(contentBlock.inline);
      if (Array.isArray(block.children)) {
        visit(block.children);
      }
    }
  };
  visit(document);

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
