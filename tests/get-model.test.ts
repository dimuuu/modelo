import { describe, expect, it } from "vitest";

import { getModelSummary } from "../src/engine/model-summary";
import { findReferences } from "../src/engine/references";
import type { ModeloDocument } from "../src/model";

const referencedDocument: ModeloDocument = [
  {
    id: "number",
    props: {
      currency: "USD",
      format: "currency",
      name: "revenue",
      unit: "kg",
      value: 10,
      varId: "revenue-id",
    },
    type: "number",
  },
  {
    id: "formula",
    props: { formula: "revenue * 2", name: "double", varId: "double-id" },
    type: "formula",
  },
  {
    id: "prefix-formula",
    props: {
      formula: "revenue_growth * 2",
      name: "prefix",
      varId: "prefix-id",
    },
    type: "formula",
  },
  {
    id: "growth",
    props: {
      currency: "CAD",
      format: "unit",
      name: "revenue_growth",
      unit: "km",
      value: 2,
      varId: "growth-id",
    },
    type: "number",
  },
  {
    content: [
      { props: { name: "revenue", varId: "revenue-id" }, type: "variableRef" },
    ],
    id: "paragraph",
    type: "paragraph",
  },
  {
    children: [
      {
        id: "nested",
        inline: [{ name: "revenue", type: "ref", varId: "revenue-id" }],
        type: "paragraph",
      },
    ],
    id: "container",
    type: "bulletListItem",
  },
];

describe("get_model summary", () => {
  it("returns slim fields and only format-matching metadata by default", () => {
    const summary = getModelSummary(referencedDocument, {
      locale: "en-US",
    });
    expect(summary[0]).toEqual({
      blockId: "number",
      currency: "USD",
      error: null,
      format: "currency",
      formatted: "$10",
      kind: "input",
      name: "revenue",
      value: 10,
    });
    expect(summary[1]).toEqual({
      blockId: "formula",
      error: null,
      format: null,
      formatted: "$20",
      kind: "formula",
      name: "double",
      value: 20,
    });
    expect(
      summary.find((variable) => variable.name === "revenue")
    ).not.toHaveProperty("usedBy");
    expect(
      summary.find((variable) => variable.name === "revenue_growth")
    ).toMatchObject({ format: "unit", unit: "km" });
    expect(
      summary.find((variable) => variable.name === "revenue_growth")
    ).not.toHaveProperty("currency");
  });

  it("adds usedBy only when dependencies are requested", () => {
    const summary = getModelSummary(
      referencedDocument,
      {},
      { includeDependencies: true }
    );
    expect(
      summary.find((variable) => variable.name === "revenue")?.usedBy
    ).toEqual(["formula", "paragraph", "nested"]);
    expect(
      summary.find((variable) => variable.name === "revenue_growth")?.usedBy
    ).toEqual(["prefix-formula"]);
  });
});

describe("findReferences", () => {
  it("finds exact formula and nested paragraph block IDs by name or varId", () => {
    expect(findReferences(referencedDocument, { name: "revenue" })).toEqual({
      formulas: ["formula"],
      name: "revenue",
      paragraphs: ["paragraph", "nested"],
      varId: "revenue-id",
    });
    expect(findReferences(referencedDocument, { varId: "growth-id" })).toEqual({
      formulas: ["prefix-formula"],
      name: "revenue_growth",
      paragraphs: [],
      varId: "growth-id",
    });
  });

  it("rejects unknown variables", () => {
    expect(() =>
      findReferences(referencedDocument, { name: "missing" })
    ).toThrow(/Variable not found/u);
  });
});
