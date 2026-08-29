import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import App from "../src/App";
import { STORAGE_KEY } from "../src/workspace";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("Modelo app smoke", () => {
  it("renders the seeded workspace and opens Sales", async () => {
    render(<App />);
    expect(
      await screen.findAllByText("AE compensation & accelerator")
    ).not.toHaveLength(0);
    expect(screen.getByText("Closed ARR")).toBeTruthy();
    expect(localStorage.getItem(STORAGE_KEY)).toContain("sales-ae-comp-plan");
  });

  it("opens a newly created empty notebook", async () => {
    render(<App />);
    fireEvent.click(screen.getByText("+ New notebook"));
    expect(await screen.findByDisplayValue("Untitled notebook")).toBeTruthy();
  });

  it("renders human config fields and the boolean toggle", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        currency: "EUR",
        locale: "es-ES",
        notebooks: [
          {
            blocks: [
              {
                currency: "EUR",
                format: "currency",
                id: "number",
                label: "Price",
                name: "price",
                step: 1,
                type: "number",
                value: 12,
                varId: "price-id",
              },
              {
                id: "slider",
                label: "Growth",
                max: 100,
                min: 0,
                name: "growth",
                step: 5,
                type: "slider",
                value: 25,
                varId: "growth-id",
              },
              {
                id: "select",
                label: "Tier",
                name: "tier",
                options: [
                  { label: "Basic", value: 1 },
                  { label: "Pro", value: 2 },
                ],
                type: "select",
                value: 1,
                varId: "tier-id",
              },
              {
                id: "boolean",
                label: "Hire now",
                name: "hired",
                type: "boolean",
                value: 1,
                varId: "hired-id",
              },
            ],
            id: "config",
            title: "Config",
            updatedAt: new Date().toISOString(),
          },
        ],
        version: 1,
      })
    );
    render(<App />);
    expect(await screen.findByDisplayValue("EUR")).toBeTruthy();
    expect(screen.getByLabelText("Slider minimum")).toHaveProperty(
      "value",
      "0"
    );
    expect(screen.getByLabelText("Slider maximum")).toHaveProperty(
      "value",
      "100"
    );
    expect(screen.getByLabelText("Option 1 label")).toHaveProperty(
      "value",
      "Basic"
    );
    expect(
      screen
        .getByRole("switch", { name: "Hire now" })
        .getAttribute("aria-checked")
    ).toBe("true");
  });

  it("uses curated currency and grouped unit selects while preserving unknown values", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        currency: "EUR",
        locale: "en-US",
        notebooks: [
          {
            blocks: [
              {
                currency: "NOK",
                format: "currency",
                id: "currency",
                label: "Currency",
                name: "currency",
                step: 1,
                type: "number",
                value: 12,
                varId: "currency-id",
              },
              {
                format: "unit",
                id: "unit",
                label: "Unit",
                name: "unit",
                step: 1,
                type: "number",
                unit: "km",
                value: 5,
                varId: "unit-id",
              },
            ],
            id: "formats",
            title: "Formats",
            updatedAt: new Date().toISOString(),
          },
        ],
        version: 1,
      })
    );
    render(<App />);

    const currency = await screen.findByLabelText("Currency code");
    expect(currency.tagName).toBe("SELECT");
    expect(currency).toHaveProperty("value", "NOK");
    expect(
      Array.from(
        (currency as HTMLSelectElement).options,
        (option) => option.value
      )
    ).toEqual(
      expect.arrayContaining([
        "EUR",
        "USD",
        "GBP",
        "UAH",
        "PLN",
        "CHF",
        "CAD",
        "AUD",
        "JPY",
        "NOK",
      ])
    );

    const unit = screen
      .getAllByLabelText("Unit")
      .find((element) => element.tagName === "SELECT") as HTMLSelectElement;
    expect(unit.tagName).toBe("SELECT");
    expect(unit.value).toBe("km");
    expect(
      Array.from(unit.querySelectorAll("optgroup"), (group) => group.label)
    ).toEqual(["Length", "Mass", "Time", "Area", "Volume"]);
  });

  it("does not render format controls on formula blocks", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        currency: "EUR",
        locale: "es-ES",
        notebooks: [
          {
            blocks: [
              {
                currency: "EUR",
                decimals: 2,
                format: "currency",
                formula: "1 + 1",
                id: "result",
                label: "Result",
                name: "result",
                type: "formula",
                varId: "result-id",
              },
            ],
            id: "formula",
            title: "Formula",
            updatedAt: new Date().toISOString(),
          },
        ],
        version: 1,
      })
    );
    render(<App />);
    expect(await screen.findByLabelText("Result expression")).toBeTruthy();
    expect(screen.queryByLabelText("Format")).toBeNull();
    expect(screen.queryByLabelText("Currency code")).toBeNull();
    expect(screen.queryByLabelText("Unit")).toBeNull();
    expect(screen.queryByLabelText("Decimals")).toBeNull();
  });

  it("renders, applies, and marks a saved scenario chip active", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        currency: "EUR",
        locale: "es-ES",
        notebooks: [
          {
            blocks: [
              {
                id: "price",
                label: "Price",
                name: "price",
                step: 1,
                type: "number",
                value: 10,
                varId: "price-id",
              },
            ],
            id: "scenarios",
            scenarios: [
              { id: "best", name: "Best case", values: { "price-id": 25 } },
            ],
            title: "Scenarios",
            updatedAt: new Date().toISOString(),
          },
        ],
        version: 1,
      })
    );
    render(<App />);
    const chip = await screen.findByRole("button", { name: "Best case" });
    expect(chip.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(chip);
    expect(
      await screen.findByRole("spinbutton", { name: "Price" })
    ).toHaveProperty("value", "25");
    expect(
      screen
        .getByRole("button", { name: "Best case" })
        .getAttribute("aria-pressed")
    ).toBe("true");
  });
});
