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
    fireEvent.click(screen.getByRole("button", { name: "New notebook" }));
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
            scenarios: [],
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

  it("keeps a stored currency the picker does not offer instead of resetting it", async () => {
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
            ],
            id: "formats",
            scenarios: [],
            title: "Formats",
            updatedAt: new Date().toISOString(),
          },
        ],
        version: 1,
      })
    );
    render(<App />);

    const currency = await screen.findByLabelText("Currency code");
    expect(currency.textContent).toContain("NOK");
    fireEvent.click(currency);
    const options = await screen.findAllByRole("option");
    const offered = options.map((option) => option.textContent);
    expect(offered).toContain("NOK");
    expect(offered).toContain("EUR");
  });

  it("groups the unit picker so long unit lists stay navigable", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        currency: "EUR",
        locale: "en-US",
        notebooks: [
          {
            blocks: [
              {
                format: "unit",
                id: "unit",
                label: "Distance",
                name: "distance",
                step: 1,
                type: "number",
                unit: "km",
                value: 5,
                varId: "unit-id",
              },
            ],
            id: "formats",
            scenarios: [],
            title: "Formats",
            updatedAt: new Date().toISOString(),
          },
        ],
        version: 1,
      })
    );
    render(<App />);

    const unit = await screen.findByRole("combobox", { name: "Unit" });
    expect(unit.textContent).toContain("km");
    fireEvent.click(unit);
    const groups = await screen.findAllByRole("group");
    expect(groups.length).toBeGreaterThan(1);
    const options = await screen.findAllByRole("option");
    expect(options.map((option) => option.textContent)).toContain("km");
  });

  it("leaves a number input without bounds unbounded", async () => {
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
            id: "bounds",
            scenarios: [],
            title: "Bounds",
            updatedAt: new Date().toISOString(),
          },
        ],
        version: 1,
      })
    );
    render(<App />);

    // A default of 0 here would silently clamp any value an agent sets.
    const input = await screen.findByRole("spinbutton", { name: "Price" });
    expect(input.getAttribute("min")).toBeNull();
    expect(input.getAttribute("max")).toBeNull();
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
                formula: "1 + 1",
                id: "result",
                label: "Result",
                name: "result",
                type: "formula",
                varId: "result-id",
              },
            ],
            id: "formula",
            scenarios: [],
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
