import { describe, expect, it } from "vitest";
import type { ModeloDocument } from "../src/model";
import {
  DuplicateVariableNameError,
  evaluateModel,
  formatValue,
  projectDocument,
  renameVariable,
} from "../src/engine";

const document: ModeloDocument = [
  {
    id: "input-block",
    type: "modelVariable",
    props: { varId: "revenue-id", name: "revenue", value: 1200, format: "currency", currency: "USD" },
  },
  {
    id: "cost-block",
    type: "modelVariable",
    props: { varId: "cost-id", name: "cost", value: 450 },
  },
  {
    id: "profit-block",
    type: "modelFormula",
    props: { varId: "profit-id", name: "profit", formula: "revenue - cost", format: "currency", currency: "USD" },
  },
];

describe("Modelo deterministic engine", () => {
  it("registers projected variables and evaluates formulas", () => {
    const projected = projectDocument(document);
    expect(projected.variables.map(({ varId, name, kind }) => ({ varId, name, kind }))).toEqual([
      { varId: "revenue-id", name: "revenue", kind: "input" },
      { varId: "cost-id", name: "cost", kind: "input" },
      { varId: "profit-id", name: "profit", kind: "formula" },
    ]);

    const result = evaluateModel(projected);
    expect(result.byId["profit-id"]).toMatchObject({ status: "ok", value: 750 });
    expect(result.byId["profit-id"].formatted).toBe("750 US$");
  });

  it("evaluates forward formula references deterministically", () => {
    const projected = projectDocument([
      { id: "a", type: "modelFormula", props: { varId: "a-id", name: "a", formula: "b * 2" } },
      { id: "b", type: "modelVariable", props: { varId: "b-id", name: "b", value: 3 } },
    ]);
    expect(evaluateModel(projected).byId["a-id"]).toMatchObject({ status: "ok", value: 6 });
  });

  it("formats currencies and units", () => {
    expect(formatValue(1234.5, { style: "currency", currency: "USD" }, { locale: "en-US" })).toBe("$1,234.50");
    expect(formatValue(12.5, { style: "unit", unit: "kg" }, { locale: "en-US" })).toBe("12.5 kg");
    expect(formatValue(19.298, { format: "currency", decimals: 0 }, { currency: "EUR", locale: "es-ES" })).toBe("19 €");
    expect(formatValue(19.298, { format: "currency", decimals: 2 }, { currency: "EUR", locale: "es-ES" })).toBe("19,30 €");
  });

  it("renames by stable varId and safely rewrites formula identifiers", () => {
    const renamed = renameVariable(
      [
        ...document,
        { id: "other", type: "modelFormula", props: { varId: "other-id", name: "other", formula: "revenue_growth + revenue" } },
        { id: "growth", type: "modelVariable", props: { varId: "growth-id", name: "revenue_growth", value: 2 } },
      ],
      "revenue-id",
      "sales",
    );
    const projected = projectDocument(renamed);
    expect(projected.byId["revenue-id"].name).toBe("sales");
    expect(projected.byId["profit-id"]).toMatchObject({ formula: "sales - cost" });
    expect(projected.byId["other-id"]).toMatchObject({ formula: "revenue_growth + sales" });
    expect(evaluateModel(projected).byId["profit-id"]).toMatchObject({ status: "ok", value: 750 });
  });

  it("shows a missing reference after a variable is deleted rather than substituting zero", () => {
    const deleted = document.filter((block) => block.id !== "cost-block");
    const profit = evaluateModel(projectDocument(deleted)).byId["profit-id"];
    expect(profit.status).toBe("missing");
    expect(profit.value).toBeUndefined();
    expect(profit.formatted).toContain("Missing");
    expect(profit.missing).toEqual(["cost"]);
  });

  it("evaluates MathJS units and exposes illegal conversions", () => {
    const legal = evaluateModel(projectDocument([
      { id: "distance", type: "modelFormula", props: { varId: "distance-id", name: "distance", formula: "5 cm to mm", format: "unit", unit: "mm" } },
    ])).byId["distance-id"];
    expect(legal).toMatchObject({ status: "ok", value: 50, formatted: "50 mm" });

    const illegal = evaluateModel(projectDocument([
      { id: "bad-unit", type: "modelFormula", props: { varId: "bad-unit-id", name: "bad_unit", formula: "5 cm", format: "unit", unit: "kg" } },
    ])).byId["bad-unit-id"];
    expect(illegal.status).toBe("error");
    expect(illegal.formatted).toContain("Error");
  });

  it("keeps parse/runtime errors visible", () => {
    const result = evaluateModel(projectDocument([
      { id: "bad", type: "modelFormula", props: { varId: "bad-id", name: "bad", formula: "2 / 0" } },
    ])).byId["bad-id"];
    expect(result.status).toBe("error");
    expect(result.formatted).toContain("Error");
  });

  it("rejects duplicate names when projecting or renaming", () => {
    expect(() => projectDocument([
      { id: "one", type: "modelVariable", props: { varId: "one-id", name: "same", value: 1 } },
      { id: "two", type: "modelVariable", props: { varId: "two-id", name: "same", value: 2 } },
    ])).toThrow(DuplicateVariableNameError);
    expect(() => renameVariable(document, "cost-id", "revenue")).toThrow(DuplicateVariableNameError);
  });

  it("rejects decimals outside the 0-8 integer range", () => {
    expect(() => projectDocument([
      { id: "bad", type: "number", props: { varId: "bad-id", name: "bad", value: 1, decimals: 9 } },
    ])).toThrow(/decimals/);
  });
});
