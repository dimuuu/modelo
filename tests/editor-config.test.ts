import { en } from "@blocknote/core/locales";
import { blockTypeSelectItems } from "@blocknote/react";
import { describe, expect, it } from "vitest";

import { modeloSchema } from "../src/editor";
import { modeloBlockTypeItems, modeloToolbarItems } from "../src/editor-menus";
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

describe("editor surface", () => {
  const blockSchema = modeloSchema.blockSchema as Record<
    string,
    { propSchema: Record<string, unknown> }
  >;

  it("drops the block types a notebook has no use for", () => {
    for (const type of [
      "audio",
      "codeBlock",
      "file",
      "image",
      "quote",
      "toggleListItem",
      "video",
    ]) {
      expect(blockSchema).not.toHaveProperty(type);
    }
    expect(blockSchema.heading.propSchema).not.toHaveProperty("isToggleable");
    expect(modeloSchema.styleSchema).not.toHaveProperty("textColor");
    expect(modeloSchema.styleSchema).not.toHaveProperty("backgroundColor");
  });

  it("offers every heading level the engine accepts, and no other", () => {
    const levels = modeloBlockTypeItems(blockTypeSelectItems(en))
      .filter((item) => item.type === "heading")
      .map((item) => item.props?.level);
    expect(levels).toEqual([1, 2, 3]);
  });

  it("asks the block type select for props the schema really has", () => {
    // BlockNote silently drops an entry whose props are not in the schema.
    // That is what hid every heading when `isToggleable` was left in place.
    for (const item of modeloBlockTypeItems(blockTypeSelectItems(en))) {
      expect(blockSchema).toHaveProperty(item.type);
      for (const prop of Object.keys(item.props ?? {})) {
        expect(blockSchema[item.type].propSchema).toHaveProperty(prop);
      }
    }
  });

  it("removes the alignment and nesting buttons from the formatting toolbar", () => {
    const keys = modeloToolbarItems(blockTypeSelectItems(en)).map((item) =>
      String(item.key)
    );
    expect(keys.filter((key) => key.startsWith("textAlign"))).toEqual([]);
    expect(keys).not.toContain("nestBlockButton");
    expect(keys).not.toContain("unnestBlockButton");
    expect(keys).toContain("blockTypeSelect");
  });
});
