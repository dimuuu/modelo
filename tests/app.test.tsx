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
});
