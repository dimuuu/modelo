import { describe, expect, it } from "vitest";
import { getModelSummary } from "../src/engine";

describe("get_model summary", () => {
  it("handles content-less custom blocks and reports formula and inline uses", () => {
    const summary = getModelSummary([
      { id: "number", type: "number", props: { varId: "revenue-id", name: "revenue", value: 10 } },
      { id: "formula", type: "formula", props: { varId: "double-id", name: "double", formula: "revenue * 2" } },
      { id: "paragraph", type: "paragraph", content: [{ type: "variableRef", props: { varId: "revenue-id", label: "revenue" } }] },
      { id: "container", type: "bulletListItem", children: [{ id: "nested", type: "paragraph", inline: [{ type: "ref", varId: "revenue-id", label: "revenue" }] }] },
    ]);

    expect(summary.find((variable) => variable.name === "revenue")?.usedBy).toEqual(["formula", "paragraph", "nested"]);
    expect(summary.find((variable) => variable.name === "double")?.value).toBe(20);
  });

  it("does not confuse names that only share a prefix", () => {
    const summary = getModelSummary([
      { id: "a", type: "number", props: { varId: "a-id", name: "revenue", value: 1 } },
      { id: "b", type: "number", props: { varId: "b-id", name: "revenue_growth", value: 2 } },
      { id: "formula", type: "formula", props: { varId: "f-id", name: "result", formula: "revenue_growth * 2" } },
    ]);
    expect(summary.find((variable) => variable.name === "revenue")?.usedBy).toEqual([]);
    expect(summary.find((variable) => variable.name === "revenue_growth")?.usedBy).toEqual(["formula"]);
  });
});
