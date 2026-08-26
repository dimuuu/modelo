import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
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
});
