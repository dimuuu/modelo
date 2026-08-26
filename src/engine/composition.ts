import type { ModeloDocument } from "../model";

export interface Composition {
  prose: number;
  variables: number;
  inline_refs: number;
  reads_like: "story" | "calculator";
  hint: string;
}

const PROSE_TYPES = new Set(["heading", "paragraph", "bullet", "bulletListItem", "numberedListItem", "checkListItem"]);
const VARIABLE_TYPES = new Set(["number", "slider", "select", "boolean", "formula", "modelVariable", "variable", "modelFormula"]);

function countInlineRefs(value: unknown): number {
  if (Array.isArray(value)) return value.reduce((total, item) => total + countInlineRefs(item), 0);
  if (!value || typeof value !== "object") return 0;
  const node = value as Record<string, unknown>;
  return (node.type === "variableRef" || node.type === "ref" ? 1 : 0)
    + Object.entries(node).reduce((total, [key, item]) => key === "type" ? total : total + countInlineRefs(item), 0);
}

export function getComposition(document: ModeloDocument): Composition {
  let prose = 0;
  let variables = 0;
  let inline_refs = 0;

  const visit = (blocks: ModeloDocument) => {
    for (const block of blocks) {
      if (PROSE_TYPES.has(block.type)) prose += 1;
      if (VARIABLE_TYPES.has(block.type)) variables += 1;
      const contentBlock = block as Record<string, unknown>;
      inline_refs += countInlineRefs(contentBlock.content) + countInlineRefs(contentBlock.inline);
      if (Array.isArray(block.children)) visit(block.children);
    }
  };
  visit(document);

  const reads_like = variables > prose || (variables >= 4 && inline_refs === 0) ? "calculator" : "story";
  return {
    prose,
    variables,
    inline_refs,
    reads_like,
    hint: reads_like === "story"
      ? "Narrative and model are balanced."
      : "Add paragraphs that mention @names; keep blocks for assumptions the reader will change.",
  };
}
