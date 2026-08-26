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
    props: { varId: "cost-id", name: "cost", value: 450, format: "currency", currency: "USD" },
  },
  {
    id: "profit-block",
    type: "modelFormula",
    props: { varId: "profit-id", name: "profit", formula: "revenue - cost" },
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

  it("evaluates explicit MathJS unit conversions", () => {
    const legal = evaluateModel(projectDocument([
      { id: "distance", type: "modelFormula", props: { varId: "distance-id", name: "distance", formula: "5 cm to mm" } },
    ])).byId["distance-id"];
    expect(legal).toMatchObject({ status: "ok", value: 50, formatted: "50 mm" });

    const hectares = evaluateModel(projectDocument([
      { id: "area", type: "number", props: { varId: "area-id", name: "area", value: 2, format: "unit", unit: "ha" } },
      { id: "converted", type: "formula", props: { varId: "converted-id", name: "converted", formula: "area to m2" } },
    ])).byId["converted-id"];
    expect(hectares).toMatchObject({ status: "ok", value: 20_000, formatted: "20.000 m2" });
  });

  it("infers compatible currency and physical units from inputs", () => {
    const result = evaluateModel(projectDocument([
      { id: "eur-a", type: "number", props: { varId: "eur-a-id", name: "eur_a", value: 70_000, format: "currency", currency: "EUR" } },
      { id: "eur-b", type: "number", props: { varId: "eur-b-id", name: "eur_b", value: 5_000, format: "currency", currency: "EUR" } },
      { id: "km", type: "number", props: { varId: "km-id", name: "kilometres", value: 5, format: "unit", unit: "km" } },
      { id: "m", type: "number", props: { varId: "m-id", name: "metres", value: 500, format: "unit", unit: "m" } },
      { id: "money", type: "formula", props: { varId: "money-id", name: "money", formula: "eur_a + eur_b" } },
      { id: "distance", type: "formula", props: { varId: "distance-id", name: "distance", formula: "kilometres + metres" } },
    ]), { locale: "en-US" });
    expect(result.byId["money-id"]).toMatchObject({ status: "ok", value: 75_000, formatted: "€75,000" });
    expect(result.byId["distance-id"]).toMatchObject({ status: "ok", value: 5.5, formatted: "5.5 km" });
  });

  it("cancels matching units in division and preserves scalar currency operations", () => {
    const result = evaluateModel(projectDocument([
      { id: "revenue", type: "number", props: { varId: "revenue-id", name: "revenue", value: 100, format: "currency", currency: "EUR" } },
      { id: "cost", type: "number", props: { varId: "cost-id", name: "cost", value: 55, format: "currency", currency: "EUR" } },
      { id: "distance-a", type: "number", props: { varId: "distance-a-id", name: "distance_a", value: 5, format: "unit", unit: "km" } },
      { id: "distance-b", type: "number", props: { varId: "distance-b-id", name: "distance_b", value: 2, format: "unit", unit: "km" } },
      { id: "margin", type: "formula", props: { varId: "margin-id", name: "margin", formula: "revenue / cost" } },
      { id: "pace", type: "formula", props: { varId: "pace-id", name: "pace", formula: "distance_a / distance_b" } },
      { id: "half", type: "formula", props: { varId: "half-id", name: "half", formula: "revenue / 2" } },
      { id: "double", type: "formula", props: { varId: "double-id", name: "double", formula: "revenue * 2" } },
    ]), { locale: "en-US" });

    expect(result.byId["margin-id"]).toMatchObject({ status: "ok", value: 100 / 55, formatted: "1.82" });
    expect(result.byId["pace-id"]).toMatchObject({ status: "ok", value: 2.5, formatted: "2.5" });
    expect(result.byId["half-id"]).toMatchObject({ status: "ok", value: 50, formatted: "€50" });
    expect(result.byId["double-id"]).toMatchObject({ status: "ok", value: 200, formatted: "€200" });
  });

  it("rejects squared and cross-currency money while preserving money per time", () => {
    const result = evaluateModel(projectDocument([
      { id: "eur", type: "number", props: { varId: "eur-id", name: "eur", value: 100, format: "currency", currency: "EUR" } },
      { id: "usd", type: "number", props: { varId: "usd-id", name: "usd", value: 50, format: "currency", currency: "USD" } },
      { id: "months", type: "number", props: { varId: "months-id", name: "months", value: 2, format: "unit", unit: "month" } },
      { id: "squared", type: "formula", props: { varId: "squared-id", name: "squared", formula: "eur * eur" } },
      { id: "cross", type: "formula", props: { varId: "cross-id", name: "cross", formula: "eur / usd" } },
      { id: "monthly", type: "formula", props: { varId: "monthly-id", name: "monthly", formula: "eur / months" } },
    ]), { locale: "en-US" });

    expect(result.byId["squared-id"]).toMatchObject({ status: "error" });
    expect(result.byId["cross-id"]).toMatchObject({ status: "error" });
    expect(result.byId["monthly-id"]).toMatchObject({ status: "ok", value: 50 });
    expect(result.byId["monthly-id"].formatted).toContain("EUR / month");
  });

  it("shows errors for incompatible currencies and physical units", () => {
    const result = evaluateModel(projectDocument([
      { id: "eur", type: "number", props: { varId: "eur-id", name: "eur", value: 70_000, format: "currency", currency: "EUR" } },
      { id: "usd", type: "number", props: { varId: "usd-id", name: "usd", value: 70_000, format: "currency", currency: "USD" } },
      { id: "km", type: "number", props: { varId: "km-id", name: "km", value: 5, format: "unit", unit: "km" } },
      { id: "kg", type: "number", props: { varId: "kg-id", name: "kg", value: 2, format: "unit", unit: "kg" } },
      { id: "currency", type: "formula", props: { varId: "currency-id", name: "currency_total", formula: "eur + usd" } },
      { id: "physical", type: "formula", props: { varId: "physical-id", name: "physical_total", formula: "km + kg" } },
      { id: "fx", type: "formula", props: { varId: "fx-id", name: "fx", formula: "usd to EUR" } },
    ]));
    expect(result.byId["currency-id"]).toMatchObject({ status: "error" });
    expect(result.byId["currency-id"].formatted).toContain("Error");
    expect(result.byId["physical-id"]).toMatchObject({ status: "error" });
    expect(result.byId["fx-id"]).toMatchObject({ status: "error" });
  });

  it("keeps percentages dimensionless while preserving percent and currency displays", () => {
    const result = evaluateModel(projectDocument([
      { id: "quota", type: "number", props: { varId: "quota-id", name: "quota", value: 70_000, format: "currency", currency: "EUR" } },
      { id: "rate", type: "number", props: { varId: "rate-id", name: "rate", value: 8, format: "percent" } },
      { id: "extra", type: "number", props: { varId: "extra-id", name: "extra", value: 2, format: "percent" } },
      { id: "commission", type: "formula", props: { varId: "commission-id", name: "commission", formula: "quota * rate" } },
      { id: "combined", type: "formula", props: { varId: "combined-id", name: "combined", formula: "rate + extra" } },
    ]), { locale: "en-US" });
    expect(result.byId["rate-id"]).toMatchObject({ status: "ok", value: 8, formatted: "8%" });
    expect(result.byId["commission-id"]).toMatchObject({ status: "ok", value: 5_600, formatted: "€5,600" });
    expect(result.byId["combined-id"]).toMatchObject({ status: "ok", value: 10, formatted: "10%" });
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

  it("projects boolean toggles as numeric inputs and formats Yes/No", () => {
    const off = evaluateModel(projectDocument([
      { id: "toggle", type: "boolean", props: { varId: "toggle-id", name: "hired", value: 0 } },
    ])).byId["toggle-id"];
    const on = evaluateModel(projectDocument([
      { id: "toggle", type: "boolean", props: { varId: "toggle-id", name: "hired", value: 2 } },
      { id: "cost", type: "formula", props: { varId: "cost-id", name: "cost", formula: "hired * 5000" } },
    ]));
    expect(off).toMatchObject({ kind: "input", inputType: "boolean", value: 0, formatted: "No" });
    expect(on.byId["toggle-id"]).toMatchObject({ value: 1, formatted: "Yes" });
    expect(on.byId["cost-id"]).toMatchObject({ status: "ok", value: 5000 });
  });
});
