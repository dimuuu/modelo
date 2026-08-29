import { z } from "zod";

import type { ModeloDocument } from "../model";
import { isInputBlockType, mapBlocks, walkBlocks } from "./document";
import { coerceInputValue } from "./variable";

export const MAX_SCENARIOS = 8;

export const scenarioSchema = z.object({
  id: z.string(),
  name: z.string(),
  values: z.record(z.string(), z.number()),
});

export type Scenario = z.infer<typeof scenarioSchema>;

/** Capture finite input values by stable varId. Formula blocks are never included. */
export function snapshotInputs(
  document: ModeloDocument
): Record<string, number> {
  const values: Record<string, number> = Object.create(null);
  walkBlocks(document, (block) => {
    if (!isInputBlockType(block.type)) {
      return;
    }
    const props = block.props as Record<string, unknown> | undefined;
    const varId = props?.varId;
    const value = props?.value;
    if (
      typeof varId === "string" &&
      varId &&
      typeof value === "number" &&
      Number.isFinite(value)
    ) {
      values[varId] = coerceInputValue(block.type, value);
    }
  });
  return values;
}

/** Return a cloned document with matching input values updated. Unknown varIds are ignored. */
export function applyScenarioValues(
  document: ModeloDocument,
  values: Record<string, number>
): ModeloDocument {
  return mapBlocks(document, (block) => {
    const props = block.props as Record<string, unknown> | undefined;
    const varId = props?.varId;
    const requested = typeof varId === "string" ? values[varId] : undefined;
    if (
      !isInputBlockType(block.type) ||
      typeof requested !== "number" ||
      !Number.isFinite(requested)
    ) {
      return block;
    }
    return {
      ...block,
      props: { ...props, value: coerceInputValue(block.type, requested) },
    };
  });
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
