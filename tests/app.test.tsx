import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import type { OnUrlUpdateFunction } from "nuqs/adapters/testing";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "../src/App";
import { STORAGE_KEY } from "../src/workspace";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

/**
 * The tab strip lives in the query string, so every render needs an adapter.
 * `hasMemory` makes the testing adapter read back what the app writes.
 * `resetUrlUpdateQueueOnMount` must be off: the testing adapter resets the
 * queue on every render, not only on mount, which drops a second update the
 * app makes while the first is still in flight.
 */
function renderApp(searchParams = "", onUrlUpdate?: OnUrlUpdateFunction) {
  return render(<App />, {
    wrapper: ({ children }) => (
      <NuqsTestingAdapter
        hasMemory
        onUrlUpdate={onUrlUpdate}
        resetUrlUpdateQueueOnMount={false}
        searchParams={searchParams}
      >
        {children}
      </NuqsTestingAdapter>
    ),
  });
}

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
    renderApp();
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
    renderApp();
    await openNotebook("AE compensation & accelerator");
    expect(await screen.findByDisplayValue("ClosedArr")).toBeTruthy();
    // The tab took the notebook, so home is no longer on screen.
    expect(screen.queryByRole("navigation", { name: "Notebooks" })).toBeNull();
  });

  it("opens a new notebook on its own title heading", async () => {
    renderApp();
    fireEvent.click(screen.getByRole("button", { name: "New notebook" }));
    // The tab label and the document heading both read the same block.
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Untitled notebook",
      })
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Close Untitled notebook" })
    ).toBeTruthy();
  });

  it("gives every new tab a home, and keeps one tab open", async () => {
    renderApp();
    await openNotebook("AE compensation & accelerator");
    expect(await screen.findByDisplayValue("ClosedArr")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "New tab" }));
    expect(
      await screen.findByRole("navigation", { name: "Notebooks" })
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Close Home" }));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Close Home" })).toBeNull()
    );

    // Closing the last tab leaves a home tab, not an empty window.
    fireEvent.click(
      screen.getByRole("button", {
        name: "Close AE compensation & accelerator",
      })
    );
    expect(
      await screen.findByRole("button", { name: "Close Home" })
    ).toBeTruthy();
  });

  it("offers export, duplicate, and delete in the notebook menu", async () => {
    renderApp();
    await openNotebook("AE compensation & accelerator");
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Actions for AE compensation & accelerator",
      })
    );
    expect(
      await screen.findByRole("menuitem", { name: "Export" })
    ).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Duplicate" })).toBeTruthy();
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(
      await screen.findByText("Delete 'AE compensation & accelerator'?")
    ).toBeTruthy();
  });

  it("restores the tabs named in the URL", async () => {
    renderApp("?tabs=home,sales-ae-comp-plan&tab=2");
    expect(await screen.findByDisplayValue("ClosedArr")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Close Home" })).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: "Notebooks" })).toBeNull();
  });

  it("writes the open tabs to the URL", async () => {
    const onUrlUpdate = vi.fn();
    renderApp("", onUrlUpdate);
    await openNotebook("AE compensation & accelerator");
    await waitFor(() => expect(onUrlUpdate).toHaveBeenCalled());
    const [event] = onUrlUpdate.mock.calls.at(-1) as [
      { searchParams: URLSearchParams },
    ];
    expect(event.searchParams.get("tabs")).toBe("sales-ae-comp-plan");
  });

  it("brings an open notebook forward instead of opening it twice", async () => {
    renderApp();
    await openNotebook("AE compensation & accelerator");
    fireEvent.click(screen.getByRole("button", { name: "New tab" }));
    await openNotebook("AE compensation & accelerator");
    expect(
      screen.getAllByRole("button", {
        name: "Close AE compensation & accelerator",
      })
    ).toHaveLength(1);
  });

  it("renders every model block as one line of name, control, and value", async () => {
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
    renderApp();
    await openNotebook();

    expect(
      await screen.findByRole("spinbutton", { name: "price" })
    ).toHaveProperty("value", "12");
    expect(screen.getByLabelText("growth")).toBeTruthy();
    expect(
      screen.getByRole("combobox", { name: "tier" }).textContent
    ).toContain("Basic");
    expect(
      screen.getByRole("switch", { name: "hired" }).getAttribute("aria-checked")
    ).toBe("true");

    // Configuration lives behind the six dots, never in the block itself.
    for (const label of [
      "Format",
      "Currency code",
      "Decimals",
      "Slider minimum",
      "Slider maximum",
      "Option 1 label",
    ]) {
      expect(screen.queryByLabelText(label)).toBeNull();
    }
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
    renderApp();
    await openNotebook();

    // A default of 0 here would silently clamp any value an agent sets.
    const input = await screen.findByRole("spinbutton", { name: "price" });
    expect(input.getAttribute("min")).toBeNull();
    expect(input.getAttribute("max")).toBeNull();
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
    renderApp();
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
