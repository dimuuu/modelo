import { describe, expect, it } from "vitest";

import { clampSliderValue, parseSelectOptions } from "../src/engine/variable";

describe("model block config helpers", () => {
  it("parses only finite numeric select options", () => {
    expect(
      parseSelectOptions(
        '[{"label":"Low","value":1},{"label":"bad","value":"2"}]'
      )
    ).toEqual([{ label: "Low", value: 1 }]);
    expect(parseSelectOptions("not json")).toEqual([]);
  });

  it("clamps slider values even when bounds are reversed", () => {
    expect(clampSliderValue(15, 0, 10)).toBe(10);
    expect(clampSliderValue(-2, 0, 10)).toBe(0);
    expect(clampSliderValue(5, 10, 0)).toBe(5);
  });
});
