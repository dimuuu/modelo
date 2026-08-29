import { describe, expect, it } from "vitest";

import {
  DuplicateVariableNameError,
  evaluateModel,
  formatValue,
  projectDocument,
  renameVariable,
} from "../src/engine";
import type { ModeloDocument } from "../src/model";

const document: ModeloDocument = [
  {
    id: "input-block",
    props: {
      currency: "USD",
      format: "currency",
      name: "revenue",
      value: 1200,
      varId: "revenue-id",
    },
    type: "modelVariable",
  },
  {
    id: "cost-block",
    props: {
      currency: "USD",
      format: "currency",
      name: "cost",
      value: 450,
      varId: "cost-id",
    },
    type: "modelVariable",
  },
  {
    id: "profit-block",
    props: { formula: "revenue - cost", name: "profit", varId: "profit-id" },
    type: "modelFormula",
  },
];

describe("Modelo deterministic engine", () => {
  it("registers projected variables and evaluates formulas", () => {
    const result = evaluateModel(projectDocument(document));
    expect(result.byId["profit-id"]).toMatchObject({
      status: "ok",
      value: 750,
    });
    expect(result.byId["profit-id"].formatted).toBe("750 US$");
  });

  it("evaluates forward formula references deterministically", () => {
    const projected = projectDocument([
      {
        id: "a",
        props: { formula: "b * 2", name: "a", varId: "a-id" },
        type: "modelFormula",
      },
      {
        id: "b",
        props: { name: "b", value: 3, varId: "b-id" },
        type: "modelVariable",
      },
    ]);
    expect(evaluateModel(projected).byId["a-id"]).toMatchObject({
      status: "ok",
      value: 6,
    });
  });

  it("formats currencies and units", () => {
    expect(
      formatValue(
        1234.5,
        { currency: "USD", style: "currency" },
        { locale: "en-US" }
      )
    ).toBe("$1,234.50");
    expect(
      formatValue(12.5, { style: "unit", unit: "kg" }, { locale: "en-US" })
    ).toBe("12.5 kg");
    expect(
      formatValue(
        19.298,
        { decimals: 0, format: "currency" },
        { currency: "EUR", locale: "es-ES" }
      )
    ).toBe("19 €");
    expect(
      formatValue(
        19.298,
        { decimals: 2, format: "currency" },
        { currency: "EUR", locale: "es-ES" }
      )
    ).toBe("19,30 €");
  });

  it("renames by stable varId and safely rewrites formula identifiers", () => {
    const renamed = renameVariable(
      [
        ...document,
        {
          id: "other",
          props: {
            formula: "revenue_growth + revenue",
            name: "other",
            varId: "other-id",
          },
          type: "modelFormula",
        },
        {
          id: "growth",
          props: { name: "revenue_growth", value: 2, varId: "growth-id" },
          type: "modelVariable",
        },
      ],
      "revenue-id",
      "sales"
    );
    const projected = projectDocument(renamed);
    expect(projected.byId["revenue-id"].name).toBe("sales");
    expect(projected.byId["profit-id"]).toMatchObject({
      formula: "sales - cost",
    });
    expect(projected.byId["other-id"]).toMatchObject({
      formula: "revenue_growth + sales",
    });
    expect(evaluateModel(projected).byId["profit-id"]).toMatchObject({
      status: "ok",
      value: 750,
    });
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
    const legal = evaluateModel(
      projectDocument([
        {
          id: "distance",
          props: {
            formula: "5 cm to mm",
            name: "distance",
            varId: "distance-id",
          },
          type: "modelFormula",
        },
      ])
    ).byId["distance-id"];
    expect(legal).toMatchObject({
      formatted: "50 mm",
      status: "ok",
      value: 50,
    });

    const hectares = evaluateModel(
      projectDocument([
        {
          id: "area",
          props: {
            format: "unit",
            name: "area",
            unit: "ha",
            value: 2,
            varId: "area-id",
          },
          type: "number",
        },
        {
          id: "converted",
          props: {
            formula: "area to m2",
            name: "converted",
            varId: "converted-id",
          },
          type: "formula",
        },
      ])
    ).byId["converted-id"];
    expect(hectares).toMatchObject({
      formatted: "20.000 m2",
      status: "ok",
      value: 20_000,
    });
  });

  it("infers compatible currency and physical units from inputs", () => {
    const result = evaluateModel(
      projectDocument([
        {
          id: "eur-a",
          props: {
            currency: "EUR",
            format: "currency",
            name: "eur_a",
            value: 70_000,
            varId: "eur-a-id",
          },
          type: "number",
        },
        {
          id: "eur-b",
          props: {
            currency: "EUR",
            format: "currency",
            name: "eur_b",
            value: 5000,
            varId: "eur-b-id",
          },
          type: "number",
        },
        {
          id: "km",
          props: {
            format: "unit",
            name: "kilometres",
            unit: "km",
            value: 5,
            varId: "km-id",
          },
          type: "number",
        },
        {
          id: "m",
          props: {
            format: "unit",
            name: "metres",
            unit: "m",
            value: 500,
            varId: "m-id",
          },
          type: "number",
        },
        {
          id: "money",
          props: { formula: "eur_a + eur_b", name: "money", varId: "money-id" },
          type: "formula",
        },
        {
          id: "distance",
          props: {
            formula: "kilometres + metres",
            name: "distance",
            varId: "distance-id",
          },
          type: "formula",
        },
      ]),
      { locale: "en-US" }
    );
    expect(result.byId["money-id"]).toMatchObject({
      formatted: "€75,000",
      status: "ok",
      value: 75_000,
    });
    expect(result.byId["distance-id"]).toMatchObject({
      formatted: "5.5 km",
      status: "ok",
      value: 5.5,
    });
  });

  it("cancels matching units in division and preserves scalar currency operations", () => {
    const result = evaluateModel(
      projectDocument([
        {
          id: "revenue",
          props: {
            currency: "EUR",
            format: "currency",
            name: "revenue",
            value: 100,
            varId: "revenue-id",
          },
          type: "number",
        },
        {
          id: "cost",
          props: {
            currency: "EUR",
            format: "currency",
            name: "cost",
            value: 55,
            varId: "cost-id",
          },
          type: "number",
        },
        {
          id: "distance-a",
          props: {
            format: "unit",
            name: "distance_a",
            unit: "km",
            value: 5,
            varId: "distance-a-id",
          },
          type: "number",
        },
        {
          id: "distance-b",
          props: {
            format: "unit",
            name: "distance_b",
            unit: "km",
            value: 2,
            varId: "distance-b-id",
          },
          type: "number",
        },
        {
          id: "margin",
          props: {
            formula: "revenue / cost",
            name: "margin",
            varId: "margin-id",
          },
          type: "formula",
        },
        {
          id: "pace",
          props: {
            formula: "distance_a / distance_b",
            name: "pace",
            varId: "pace-id",
          },
          type: "formula",
        },
        {
          id: "half",
          props: { formula: "revenue / 2", name: "half", varId: "half-id" },
          type: "formula",
        },
        {
          id: "double",
          props: { formula: "revenue * 2", name: "double", varId: "double-id" },
          type: "formula",
        },
      ]),
      { locale: "en-US" }
    );

    expect(result.byId["margin-id"]).toMatchObject({
      formatted: "1.82",
      status: "ok",
      value: 100 / 55,
    });
    expect(result.byId["pace-id"]).toMatchObject({
      formatted: "2.5",
      status: "ok",
      value: 2.5,
    });
    expect(result.byId["half-id"]).toMatchObject({
      formatted: "€50",
      status: "ok",
      value: 50,
    });
    expect(result.byId["double-id"]).toMatchObject({
      formatted: "€200",
      status: "ok",
      value: 200,
    });
  });

  it("rejects squared and cross-currency money while preserving money per time", () => {
    const result = evaluateModel(
      projectDocument([
        {
          id: "eur",
          props: {
            currency: "EUR",
            format: "currency",
            name: "eur",
            value: 100,
            varId: "eur-id",
          },
          type: "number",
        },
        {
          id: "usd",
          props: {
            currency: "USD",
            format: "currency",
            name: "usd",
            value: 50,
            varId: "usd-id",
          },
          type: "number",
        },
        {
          id: "months",
          props: {
            format: "unit",
            name: "months",
            unit: "month",
            value: 2,
            varId: "months-id",
          },
          type: "number",
        },
        {
          id: "squared",
          props: { formula: "eur * eur", name: "squared", varId: "squared-id" },
          type: "formula",
        },
        {
          id: "cross",
          props: { formula: "eur / usd", name: "cross", varId: "cross-id" },
          type: "formula",
        },
        {
          id: "monthly",
          props: {
            formula: "eur / months",
            name: "monthly",
            varId: "monthly-id",
          },
          type: "formula",
        },
      ]),
      { locale: "en-US" }
    );

    expect(result.byId["squared-id"]).toMatchObject({ status: "error" });
    expect(result.byId["cross-id"]).toMatchObject({ status: "error" });
    expect(result.byId["monthly-id"]).toMatchObject({
      status: "ok",
      value: 50,
    });
    expect(result.byId["monthly-id"].formatted).toContain("EUR / month");
  });

  it("shows errors for incompatible currencies and physical units", () => {
    const result = evaluateModel(
      projectDocument([
        {
          id: "eur",
          props: {
            currency: "EUR",
            format: "currency",
            name: "eur",
            value: 70_000,
            varId: "eur-id",
          },
          type: "number",
        },
        {
          id: "usd",
          props: {
            currency: "USD",
            format: "currency",
            name: "usd",
            value: 70_000,
            varId: "usd-id",
          },
          type: "number",
        },
        {
          id: "km",
          props: {
            format: "unit",
            name: "km",
            unit: "km",
            value: 5,
            varId: "km-id",
          },
          type: "number",
        },
        {
          id: "kg",
          props: {
            format: "unit",
            name: "kg",
            unit: "kg",
            value: 2,
            varId: "kg-id",
          },
          type: "number",
        },
        {
          id: "currency",
          props: {
            formula: "eur + usd",
            name: "currency_total",
            varId: "currency-id",
          },
          type: "formula",
        },
        {
          id: "physical",
          props: {
            formula: "km + kg",
            name: "physical_total",
            varId: "physical-id",
          },
          type: "formula",
        },
        {
          id: "fx",
          props: { formula: "usd to EUR", name: "fx", varId: "fx-id" },
          type: "formula",
        },
      ])
    );
    expect(result.byId["currency-id"]).toMatchObject({ status: "error" });
    expect(result.byId["currency-id"].formatted).toContain("Error");
    expect(result.byId["physical-id"]).toMatchObject({ status: "error" });
    expect(result.byId["fx-id"]).toMatchObject({ status: "error" });
  });

  it("keeps percentages dimensionless while preserving percent and currency displays", () => {
    const result = evaluateModel(
      projectDocument([
        {
          id: "quota",
          props: {
            currency: "EUR",
            format: "currency",
            name: "quota",
            value: 70_000,
            varId: "quota-id",
          },
          type: "number",
        },
        {
          id: "rate",
          props: {
            format: "percent",
            name: "rate",
            value: 8,
            varId: "rate-id",
          },
          type: "number",
        },
        {
          id: "extra",
          props: {
            format: "percent",
            name: "extra",
            value: 2,
            varId: "extra-id",
          },
          type: "number",
        },
        {
          id: "commission",
          props: {
            formula: "quota * rate",
            name: "commission",
            varId: "commission-id",
          },
          type: "formula",
        },
        {
          id: "combined",
          props: {
            formula: "rate + extra",
            name: "combined",
            varId: "combined-id",
          },
          type: "formula",
        },
        {
          id: "uplift",
          props: { formula: "1 + rate", name: "uplift", varId: "uplift-id" },
          type: "formula",
        },
      ]),
      { locale: "en-US" }
    );
    expect(result.byId["rate-id"]).toMatchObject({
      formatted: "8%",
      status: "ok",
      value: 8,
    });
    expect(result.byId["commission-id"]).toMatchObject({
      formatted: "€5,600",
      status: "ok",
      value: 5600,
    });
    expect(result.byId["combined-id"]).toMatchObject({
      formatted: "0.1",
      status: "ok",
      value: 0.1,
    });
    expect(result.byId["uplift-id"]).toMatchObject({
      formatted: "1.08",
      status: "ok",
      value: 1.08,
    });
  });

  it("keeps parse/runtime errors visible", () => {
    const result = evaluateModel(
      projectDocument([
        {
          id: "bad",
          props: { formula: "2 / 0", name: "bad", varId: "bad-id" },
          type: "modelFormula",
        },
      ])
    ).byId["bad-id"];
    expect(result.status).toBe("error");
    expect(result.formatted).toContain("Error");
  });

  it("rejects duplicate names when projecting or renaming", () => {
    expect(() =>
      projectDocument([
        {
          id: "one",
          props: { name: "same", value: 1, varId: "one-id" },
          type: "modelVariable",
        },
        {
          id: "two",
          props: { name: "same", value: 2, varId: "two-id" },
          type: "modelVariable",
        },
      ])
    ).toThrow(DuplicateVariableNameError);
    expect(() => renameVariable(document, "cost-id", "revenue")).toThrow(
      DuplicateVariableNameError
    );
  });

  it("rejects decimals outside the 0-8 integer range", () => {
    expect(() =>
      projectDocument([
        {
          id: "bad",
          props: { decimals: 9, name: "bad", value: 1, varId: "bad-id" },
          type: "number",
        },
      ])
    ).toThrow(/decimals/u);
  });

  it("projects boolean toggles as numeric inputs and formats Yes/No", () => {
    const off = evaluateModel(
      projectDocument([
        {
          id: "toggle",
          props: { name: "hired", value: 0, varId: "toggle-id" },
          type: "boolean",
        },
      ])
    ).byId["toggle-id"];
    const on = evaluateModel(
      projectDocument([
        {
          id: "toggle",
          props: { name: "hired", value: 2, varId: "toggle-id" },
          type: "boolean",
        },
        {
          id: "cost",
          props: { formula: "hired * 5000", name: "cost", varId: "cost-id" },
          type: "formula",
        },
      ])
    );
    expect(off).toMatchObject({
      formatted: "No",
      inputType: "boolean",
      kind: "input",
      value: 0,
    });
    expect(on.byId["toggle-id"]).toMatchObject({ formatted: "Yes", value: 1 });
    expect(on.byId["cost-id"]).toMatchObject({ status: "ok", value: 5000 });
  });
});
