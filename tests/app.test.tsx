import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import App from "../src/App";
import { STORAGE_KEY } from "../src/workspace";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

/**
 * A tab starts on home, so a test that wants the editor opens a notebook
 * first. The row is looked up inside the catalogue, because the tab strip and
 * the document heading carry the same title.
 */
async function openNotebook(name = "Untitled notebook") {
  const catalogue = await screen.findByRole("navigation", {
    name: "Notebooks",
  });
  fireEvent.click(within(catalogue).getByRole("button", { name }));
}

describe("Modelo app smoke", () => {
  it("starts on home and lists the seeded workspace", async () => {
    render(<App />);
    const catalogue = await screen.findByRole("navigation", {
      name: "Notebooks",
    });
    expect(
      within(catalogue).getByRole("button", {
        name: "AE compensation & accelerator",
      })
    ).toBeTruthy();
    expect(localStorage.getItem(STORAGE_KEY)).toContain("sales-ae-comp-plan");
  });

  it("opens a notebook into the home tab", async () => {
    render(<App />);
    await openNotebook("AE compensation & accelerator");
    expect(await screen.findByDisplayValue("closed_arr")).toBeTruthy();
    // The tab took the notebook, so home is no longer on screen.
    expect(screen.queryByRole("navigation", { name: "Notebooks" })).toBeNull();
  });

  it("opens a new notebook on its own title heading", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "New notebook" }));
    // The tab label and the document heading both read the same block.
    expect(await screen.findAllByText("Untitled notebook")).toHaveLength(2);
  });

  it("gives every new tab a home, and keeps one tab open", async () => {
    render(<App />);
    await openNotebook("AE compensation & accelerator");
    fireEvent.click(screen.getByRole("button", { name: "New tab" }));
    expect(
      await screen.findByRole("navigation", { name: "Notebooks" })
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Close Home" }));
    expect(await screen.findByDisplayValue("closed_arr")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Close AE compensation & accelerator",
      })
    );
    expect(
      await screen.findByRole("navigation", { name: "Notebooks" })
    ).toBeTruthy();
  });

  it("brings an open notebook forward instead of opening it twice", async () => {
    render(<App />);
    await openNotebook("AE compensation & accelerator");
    fireEvent.click(screen.getByRole("button", { name: "New tab" }));
    await openNotebook("AE compensation & accelerator");
    expect(
      screen.getAllByRole("button", {
        name: "Close AE compensation & accelerator",
      })
    ).toHaveLength(1);
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
                name: "price",
                step: 1,
                type: "number",
                value: 12,
                varId: "price-id",
              },
              {
                id: "slider",
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
                name: "hired",
                type: "boolean",
                value: 1,
                varId: "hired-id",
              },
            ],
            id: "config",
            scenarios: [],
            updatedAt: new Date().toISOString(),
          },
        ],
        version: 1,
      })
    );
    render(<App />);
    await openNotebook();
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
      screen.getByRole("switch", { name: "hired" }).getAttribute("aria-checked")
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
                name: "currency",
                step: 1,
                type: "number",
                value: 12,
                varId: "currency-id",
              },
            ],
            id: "formats",
            scenarios: [],
            updatedAt: new Date().toISOString(),
          },
        ],
        version: 1,
      })
    );
    render(<App />);
    await openNotebook();

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
            updatedAt: new Date().toISOString(),
          },
        ],
        version: 1,
      })
    );
    render(<App />);
    await openNotebook();

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
                name: "price",
                step: 1,
                type: "number",
                value: 10,
                varId: "price-id",
              },
            ],
            id: "bounds",
            scenarios: [],
            updatedAt: new Date().toISOString(),
          },
        ],
        version: 1,
      })
    );
    render(<App />);
    await openNotebook();

    // A default of 0 here would silently clamp any value an agent sets.
    const input = await screen.findByRole("spinbutton", { name: "price" });
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
                name: "result",
                type: "formula",
                varId: "result-id",
              },
            ],
            id: "formula",
            scenarios: [],
            updatedAt: new Date().toISOString(),
          },
        ],
        version: 1,
      })
    );
    render(<App />);
    await openNotebook();
    expect(await screen.findByLabelText("result expression")).toBeTruthy();
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
            updatedAt: new Date().toISOString(),
          },
        ],
        version: 1,
      })
    );
    render(<App />);
    await openNotebook();
    const chip = await screen.findByRole("button", { name: "Best case" });
    expect(chip.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(chip);
    expect(
      await screen.findByRole("spinbutton", { name: "price" })
    ).toHaveProperty("value", "25");
    expect(
      screen
        .getByRole("button", { name: "Best case" })
        .getAttribute("aria-pressed")
    ).toBe("true");
  });
});
