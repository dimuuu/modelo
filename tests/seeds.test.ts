import { describe, expect, it } from "vitest";

import seeds from "../src/data/seeds.json";
import { getComposition } from "../src/engine/composition";
import { describeNotebook } from "../src/engine/notebook";
import { toEditorBlocks } from "../src/engine/portable";
import type { PortableBlock } from "../src/engine/portable";
import { matchingScenarioName } from "../src/engine/scenarios";
import type { Scenario } from "../src/engine/scenarios";
import { notebookRecordSchema } from "../src/workspace";

const documents = seeds.map((seed) => ({
  document: toEditorBlocks(seed.blocks as PortableBlock[]),
  id: seed.id,
  scenarios: seed.scenarios as Scenario[],
}));

function failures(document: (typeof documents)[number]["document"]) {
  const { evaluated } = describeNotebook(document, {
    currency: "EUR",
    locale: "es-ES",
  });
  return evaluated.variables
    .filter((variable) => variable.status !== "ok")
    .map((variable) => variable.name);
}

describe("the seed notebooks", () => {
  it.each(documents)("$id evaluates every variable", ({ document }) => {
    expect(failures(document)).toEqual([]);
  });

  it.each(documents)("$id reads like a story", ({ document }) => {
    expect(getComposition(document).reads_like).toBe("story");
  });

  it.each(documents)("$id is a valid notebook record", ({ id }) => {
    const seed = seeds.find((candidate) => candidate.id === id);
    expect(
      notebookRecordSchema.safeParse({ ...seed, updatedAt: "" }).success
    ).toBe(true);
  });

  it.each(documents)(
    "$id opens on its first scenario, and every scenario names real inputs",
    ({ document, scenarios }) => {
      expect(scenarios.length).toBeGreaterThan(1);
      expect(matchingScenarioName(document, scenarios)).toBe(scenarios[0].name);
      const { projected } = describeNotebook(document);
      for (const scenario of scenarios) {
        for (const varId of Object.keys(scenario.values)) {
          expect(projected.byId[varId]?.kind).toBe("input");
        }
      }
    }
  );
});
