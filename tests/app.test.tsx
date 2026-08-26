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
});
