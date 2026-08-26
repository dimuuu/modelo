import { describe, expect, it } from "vitest";
import { applyScenarioValues, matchingScenarioName, removeScenario, snapshotInputs, upsertScenario, type Scenario } from "../src/engine/scenarios";

const document = [
  { id: "n", type: "number", props: { varId: "n-id", name: "n", value: 10 } },
  { id: "f", type: "formula", props: { varId: "f-id", name: "f", formula: "n * 2" } },
  { id: "group", type: "paragraph", children: [
    { id: "b", type: "boolean", props: { varId: "b-id", name: "b", value: 2 } },
  ] },
] as any;

describe("notebook scenarios", () => {
  it("snapshots only finite input values by stable varId, including nested blocks", () => {
    expect({ ...snapshotInputs(document) }).toEqual({ "n-id": 10, "b-id": 1 });
  });

  it("immutably applies known input values and ignores formulas and unknown ids", () => {
    const next = applyScenarioValues(document, { "n-id": 20, "b-id": 0, "f-id": 999, missing: 3 });
    expect((next[0] as any).props.value).toBe(20);
    expect((next[1] as any).props.value).toBeUndefined();
    expect((next[2] as any).children[0].props.value).toBe(0);
    expect((document[0] as any).props.value).toBe(10);
  });

  it("replaces same-name scenarios, removes by name, and caps new scenarios at eight", () => {
    const base: Scenario[] = Array.from({ length: 8 }, (_, index) => ({ id: String(index), name: `S${index}`, values: {} }));
    const replacement = { id: "same", name: "S0", values: { "n-id": 3 } };
    expect(upsertScenario(base, replacement)[0]).toEqual(replacement);
    expect(() => upsertScenario(base, { id: "9", name: "S9", values: {} })).toThrow("at most 8");
    expect(removeScenario(base, "S3")).toHaveLength(7);
  });

  it("identifies the first matching non-empty scenario", () => {
    expect(matchingScenarioName(document, [
      { id: "empty", name: "Empty", values: {} },
      { id: "match", name: "Current", values: { "n-id": 10, "b-id": 1 } },
    ])).toBe("Current");
  });
});
