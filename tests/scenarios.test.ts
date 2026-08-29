import { describe, expect, it } from "vitest";

import {
  applyScenarioValues,
  matchingScenarioName,
  removeScenario,
  snapshotInputs,
  upsertScenario,
} from "../src/engine/scenarios";
import type { Scenario } from "../src/engine/scenarios";

const document = [
  { id: "n", props: { name: "n", value: 10, varId: "n-id" }, type: "number" },
  {
    id: "f",
    props: { formula: "n * 2", name: "f", varId: "f-id" },
    type: "formula",
  },
  {
    children: [
      {
        id: "b",
        props: { name: "b", value: 2, varId: "b-id" },
        type: "boolean",
      },
    ],
    id: "group",
    type: "paragraph",
  },
] as any;

describe("notebook scenarios", () => {
  it("snapshots only finite input values by stable varId, including nested blocks", () => {
    expect({ ...snapshotInputs(document) }).toEqual({ "b-id": 1, "n-id": 10 });
  });

  it("immutably applies known input values and ignores formulas and unknown ids", () => {
    const next = applyScenarioValues(document, {
      "b-id": 0,
      "f-id": 999,
      missing: 3,
      "n-id": 20,
    });
    expect((next[0] as any).props.value).toBe(20);
    expect((next[1] as any).props.value).toBeUndefined();
    expect((next[2] as any).children[0].props.value).toBe(0);
    expect((document[0] as any).props.value).toBe(10);
  });

  it("replaces same-name scenarios, removes by name, and caps new scenarios at eight", () => {
    const base: Scenario[] = Array.from({ length: 8 }, (_, index) => ({
      id: String(index),
      name: `S${index}`,
      values: {},
    }));
    const replacement = { id: "same", name: "S0", values: { "n-id": 3 } };
    expect(upsertScenario(base, replacement)[0]).toEqual(replacement);
    expect(() =>
      upsertScenario(base, { id: "9", name: "S9", values: {} })
    ).toThrow("at most 8");
    expect(removeScenario(base, "S3")).toHaveLength(7);
  });

  it("identifies the first matching non-empty scenario", () => {
    expect(
      matchingScenarioName(document, [
        { id: "empty", name: "Empty", values: {} },
        { id: "match", name: "Current", values: { "b-id": 1, "n-id": 10 } },
      ])
    ).toBe("Current");
  });
});
