import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import App from "../src/App";
import { STORAGE_KEY } from "../src/workspace";

afterEach(() => { cleanup(); localStorage.clear(); });

describe("Modelo app smoke", () => {
  it("renders the seeded workspace and opens Sales", async () => {
    render(<App />);
    expect(await screen.findAllByText("AE compensation & accelerator")).not.toHaveLength(0);
    expect(screen.getByText("Closed ARR")).toBeTruthy();
    expect(localStorage.getItem(STORAGE_KEY)).toContain("sales-ae-comp-plan");
  });

  it("opens a newly created empty notebook", async () => {
    render(<App />);
    fireEvent.click(screen.getByText("+ New notebook"));
    expect(await screen.findByDisplayValue("Untitled notebook")).toBeTruthy();
  });

  it("renders human config fields and the boolean toggle", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: 1,
      currency: "EUR",
      locale: "es-ES",
      notebooks: [{ id: "config", title: "Config", updatedAt: new Date().toISOString(), blocks: [
        { id: "number", type: "number", varId: "price-id", name: "price", label: "Price", value: 12, format: "currency", currency: "EUR", step: 1 },
        { id: "slider", type: "slider", varId: "growth-id", name: "growth", label: "Growth", value: 25, min: 0, max: 100, step: 5 },
        { id: "select", type: "select", varId: "tier-id", name: "tier", label: "Tier", value: 1, options: [{ label: "Basic", value: 1 }, { label: "Pro", value: 2 }] },
        { id: "boolean", type: "boolean", varId: "hired-id", name: "hired", label: "Hire now", value: 1 },
      ] }],
    }));
    render(<App />);
    expect(await screen.findByDisplayValue("EUR")).toBeTruthy();
    expect(screen.getByLabelText("Slider minimum")).toHaveProperty("value", "0");
    expect(screen.getByLabelText("Slider maximum")).toHaveProperty("value", "100");
    expect(screen.getByLabelText("Option 1 label")).toHaveProperty("value", "Basic");
    expect(screen.getByRole("switch", { name: "Hire now" }).getAttribute("aria-checked")).toBe("true");
  });

  it("uses curated currency and grouped unit selects while preserving unknown values", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: 1,
      currency: "EUR",
      locale: "en-US",
      notebooks: [{ id: "formats", title: "Formats", updatedAt: new Date().toISOString(), blocks: [
        { id: "currency", type: "number", varId: "currency-id", name: "currency", label: "Currency", value: 12, format: "currency", currency: "NOK", step: 1 },
        { id: "unit", type: "number", varId: "unit-id", name: "unit", label: "Unit", value: 5, format: "unit", unit: "km", step: 1 },
      ] }],
    }));
    render(<App />);

    const currency = await screen.findByLabelText("Currency code");
    expect(currency.tagName).toBe("SELECT");
    expect(currency).toHaveProperty("value", "NOK");
    expect(Array.from((currency as HTMLSelectElement).options, (option) => option.value)).toEqual(expect.arrayContaining(["EUR", "USD", "GBP", "UAH", "PLN", "CHF", "CAD", "AUD", "JPY", "NOK"]));

    const unit = screen.getAllByLabelText("Unit").find((element) => element.tagName === "SELECT") as HTMLSelectElement;
    expect(unit.tagName).toBe("SELECT");
    expect(unit.value).toBe("km");
    expect(Array.from(unit.querySelectorAll("optgroup"), (group) => group.label)).toEqual(["Length", "Mass", "Time", "Area", "Volume"]);
  });

  it("does not render format controls on formula blocks", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: 1,
      currency: "EUR",
      locale: "es-ES",
      notebooks: [{ id: "formula", title: "Formula", updatedAt: new Date().toISOString(), blocks: [
        { id: "result", type: "formula", varId: "result-id", name: "result", label: "Result", formula: "1 + 1", format: "currency", currency: "EUR", decimals: 2 },
      ] }],
    }));
    render(<App />);
    expect(await screen.findByLabelText("Result expression")).toBeTruthy();
    expect(screen.queryByLabelText("Format")).toBeNull();
    expect(screen.queryByLabelText("Currency code")).toBeNull();
    expect(screen.queryByLabelText("Unit")).toBeNull();
    expect(screen.queryByLabelText("Decimals")).toBeNull();
  });
});
