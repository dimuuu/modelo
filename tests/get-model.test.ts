import { describe, expect, it } from "vitest";
import { findReferences, getModelSummary } from "../src/engine";

const referencedDocument = [
  { id: "number", type: "number", props: { varId: "revenue-id", name: "revenue", value: 10, format: "currency", currency: "USD", unit: "kg" } },
  { id: "formula", type: "formula", props: { varId: "double-id", name: "double", formula: "revenue * 2" } },
  { id: "prefix-formula", type: "formula", props: { varId: "prefix-id", name: "prefix", formula: "revenue_growth * 2" } },
  { id: "growth", type: "number", props: { varId: "growth-id", name: "revenue_growth", value: 2, format: "unit", unit: "km", currency: "CAD" } },
  { id: "paragraph", type: "paragraph", content: [{ type: "variableRef", props: { varId: "revenue-id", label: "revenue" } }] },
  { id: "container", type: "bulletListItem", children: [{ id: "nested", type: "paragraph", inline: [{ type: "ref", varId: "revenue-id", label: "revenue" }] }] },
] as const;

describe("get_model summary", () => {
  it("returns slim fields and only format-matching metadata by default", () => {
    const summary = getModelSummary(referencedDocument as any, { locale: "en-US" });
    expect(summary[0]).toEqual({
      name: "revenue",
      kind: "input",
      value: 10,
      formatted: "$10",
      error: null,
      format: "currency",
      currency: "USD",
    });
    expect(summary[1]).toEqual({
      name: "double",
      kind: "formula",
      value: 20,
      formatted: "$20",
      error: null,
      format: null,
    });
    expect(summary.find((variable) => variable.name === "revenue")).not.toHaveProperty("usedBy");
    expect(summary.find((variable) => variable.name === "revenue_growth")).toMatchObject({ format: "unit", unit: "km" });
    expect(summary.find((variable) => variable.name === "revenue_growth")).not.toHaveProperty("currency");
  });

  it("adds usedBy only when dependencies are requested", () => {
    const summary = getModelSummary(referencedDocument as any, {}, { includeDependencies: true });
    expect(summary.find((variable) => variable.name === "revenue")?.usedBy).toEqual(["formula", "paragraph", "nested"]);
    expect(summary.find((variable) => variable.name === "revenue_growth")?.usedBy).toEqual(["prefix-formula"]);
  });
});

describe("findReferences", () => {
  it("finds exact formula and nested paragraph block IDs by name or varId", () => {
    expect(findReferences(referencedDocument as any, { name: "revenue" })).toEqual({
      name: "revenue",
      varId: "revenue-id",
      formulas: ["formula"],
      paragraphs: ["paragraph", "nested"],
    });
    expect(findReferences(referencedDocument as any, { varId: "growth-id" })).toEqual({
      name: "revenue_growth",
      varId: "growth-id",
      formulas: ["prefix-formula"],
      paragraphs: [],
    });
  });

  it("rejects unknown variables", () => {
    expect(() => findReferences(referencedDocument as any, { name: "missing" })).toThrow(/Variable not found/);
  });
});
