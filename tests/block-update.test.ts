import { describe, expect, it } from "vitest";

import { planBlockUpdate } from "../src/engine/block-update";
import { projectDocument } from "../src/engine/projector";
import type { ModeloBlock, ModeloDocument } from "../src/model";

const blocks: Record<string, ModeloBlock> = {
  formula: {
    id: "formula",
    props: { formula: "1 + 1", name: "result", varId: "result-id" },
    type: "formula",
  },
  heading: { content: [], id: "heading", props: { level: 2 }, type: "heading" },
  number: {
    id: "number",
    props: { name: "price", value: 10, varId: "price-id" },
    type: "number",
  },
  select: {
    id: "select",
    props: { name: "tier", options: "[]", value: 1, varId: "tier-id" },
    type: "select",
  },
  slider: {
    id: "slider",
    props: { max: 10, min: 0, name: "growth", value: 5, varId: "growth-id" },
    type: "slider",
  },
  toggle: {
    id: "toggle",
    props: { name: "hired", value: 0, varId: "hired-id" },
    type: "boolean",
  },
};
const document: ModeloDocument = Object.values(blocks);
const model = projectDocument(document);

const plan = (block: string, fields: Record<string, unknown>) =>
  planBlockUpdate(model, blocks[block], { id: block, ...fields } as never);

describe("planBlockUpdate", () => {
  it.each([
    ["toggle", { format: "currency" }],
    ["select", { min: 1 }],
    ["formula", { name: "other" }],
    ["heading", { value: 1 }],
    ["number", {}],
  ])("rejects fields the %s block does not accept", (block, fields) => {
    expect(plan(block, fields)).toMatchObject({
      code: "INVALID_UPDATE",
      ok: false,
    });
  });

  it("rejects unknown blocks and unsupported block types", () => {
    expect(
      planBlockUpdate(model, undefined, { id: "nope", value: 1 })
    ).toMatchObject({
      code: "NOT_FOUND",
    });
    expect(
      planBlockUpdate(
        model,
        { content: {}, id: "t", type: "table" },
        { id: "t", text: "x" }
      )
    ).toMatchObject({ code: "INVALID_UPDATE" });
  });

  it.each([
    [{ decimals: 9 }, "decimals must be an integer from 0 to 8."],
    [{ max: 1, min: 5 }, "min must not exceed max."],
    [{ format: "unit" }, "unit format requires a unit."],
  ])("applies the numeric rules: %o", (fields, message) => {
    expect(plan("number", fields)).toEqual({
      code: "INVALID_VALUE",
      message,
      ok: false,
    });
  });

  it("takes a step from a slider and refuses one on a number", () => {
    expect(plan("slider", { step: 0 })).toEqual({
      code: "INVALID_VALUE",
      message: "step must be positive.",
      ok: false,
    });
    expect(plan("number", { step: 5 })).toMatchObject({
      code: "INVALID_UPDATE",
    });
  });

  it("refuses a percent slider whose range is a ratio", () => {
    const refused = plan("slider", { format: "percent", max: 1, min: 0 });
    expect(refused).toMatchObject({ code: "INVALID_VALUE", ok: false });
    expect(plan("slider", { format: "percent", max: 100, min: 0 }).ok).toBe(
      true
    );
  });

  it("clamps a slider into the bounds the update leaves in place", () => {
    expect(plan("slider", { value: 50 })).toMatchObject({
      props: { value: 10 },
    });
    expect(plan("slider", { max: 3 })).toMatchObject({
      props: { max: 3, value: 3 },
    });
  });

  it("serialises select options for the editor prop", () => {
    expect(
      plan("select", { options: [{ label: "A", value: 1 }] })
    ).toMatchObject({
      props: { options: '[{"label":"A","value":1}]' },
    });
  });

  it("plans a rename separately from the prop change and refuses a taken name", () => {
    expect(plan("number", { name: "cost", value: 12 })).toMatchObject({
      props: { value: 12 },
      rename: { name: "cost", varId: "price-id" },
    });
    expect(plan("number", { name: "growth" })).toMatchObject({
      code: "DUPLICATE_VARIABLE_NAME",
    });
    expect(plan("number", { name: "price" })).not.toHaveProperty("rename");
  });

  it("plans prose replacements as text and level", () => {
    expect(plan("heading", { level: 1, text: "Title" })).toMatchObject({
      level: 1,
      ok: true,
      text: "Title",
    });
  });
});
