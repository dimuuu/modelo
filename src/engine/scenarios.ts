import { z } from "zod";

import type { ModeloBlock, ModeloDocument } from "../model";

/** Boolean inputs persist as 0 or 1, every other input keeps its number. */
function inputValue(type: string, value: number): number {
  if (type !== "boolean") {
    return value;
  }
  return value ? 1 : 0;
}

export const MAX_SCENARIOS = 8;
export const SCENARIO_INPUT_TYPES = new Set([
  "modelVariable",
  "variable",
  "number",
  "slider",
  "select",
  "boolean",
]);

export const scenarioSchema = z.object({
  id: z.string(),
  name: z.string(),
  values: z.record(z.string(), z.number()),
});

export type Scenario = z.infer<typeof scenarioSchema>;

function visitInputs(
  blocks: ModeloDocument,
  visitor: (block: ModeloBlock) => void
): void {
  for (const block of blocks) {
    if (SCENARIO_INPUT_TYPES.has(block.type)) {
      visitor(block);
    }
    if (Array.isArray(block.children)) {
      visitInputs(block.children as ModeloDocument, visitor);
    }
  }
}

/** Capture finite input values by stable varId. Formula blocks are never included. */
export function snapshotInputs(
  document: ModeloDocument
): Record<string, number> {
  const values: Record<string, number> = Object.create(null);
  visitInputs(document, (block) => {
    const props = block.props as Record<string, unknown> | undefined;
    const varId = props?.varId;
    const value = props?.value;
    if (
      typeof varId === "string" &&
      varId &&
      typeof value === "number" &&
      Number.isFinite(value)
    ) {
      values[varId] = inputValue(block.type, value);
    }
  });
  return values;
}

/** Return a cloned document with matching input values updated. Unknown varIds are ignored. */
export function applyScenarioValues(
  document: ModeloDocument,
  values: Record<string, number>
): ModeloDocument {
  const apply = (blocks: ModeloDocument): ModeloDocument =>
    blocks.map((block) => {
      const children = Array.isArray(block.children)
        ? apply(block.children as ModeloDocument)
        : block.children;
      const props = block.props as Record<string, unknown> | undefined;
      const varId = props?.varId;
      const requested = typeof varId === "string" ? values[varId] : undefined;
      if (
        !SCENARIO_INPUT_TYPES.has(block.type) ||
        typeof requested !== "number" ||
        !Number.isFinite(requested)
      ) {
        return {
          ...block,
          ...(Array.isArray(block.children) ? { children } : {}),
        } as ModeloBlock;
      }
      return {
        ...block,
        props: {
          ...block.props,
          value: inputValue(block.type, requested),
        },
        ...(Array.isArray(block.children) ? { children } : {}),
      } as ModeloBlock;
    });
  return apply(document);
}

/** Replace a same-named scenario, or append a new one while enforcing the notebook cap. */
export function upsertScenario(
  list: Scenario[],
  scenario: Scenario
): Scenario[] {
  const index = list.findIndex((item) => item.name === scenario.name);
  if (index !== -1) {
    return list.map((item, position) => (position === index ? scenario : item));
  }
  if (list.length >= MAX_SCENARIOS) {
    throw new Error(`A notebook can have at most ${MAX_SCENARIOS} scenarios.`);
  }
  return [...list, scenario];
}

export function removeScenario(list: Scenario[], name: string): Scenario[] {
  return list.filter((scenario) => scenario.name !== name);
}

export function matchingScenarioName(
  document: ModeloDocument,
  scenarios: Scenario[]
): string | null {
  const current = snapshotInputs(document);
  for (const scenario of scenarios) {
    const entries = Object.entries(scenario.values);
    if (
      entries.length > 0 &&
      entries.every(
        ([varId, value]) =>
          Object.hasOwn(current, varId) && Object.is(current[varId], value)
      )
    ) {
      return scenario.name;
    }
  }
  return null;
}
