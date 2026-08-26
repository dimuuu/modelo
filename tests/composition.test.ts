import { describe, expect, it } from "vitest";
import { buildSectionBlocks, getComposition, inlineContentFromText } from "../src/engine";

describe("document composition", () => {
  it("reports an empty document as a balanced story", () => {
    expect(getComposition([])).toEqual({
      prose: 0,
      variables: 0,
      inline_refs: 0,
      reads_like: "story",
      hint: "Narrative and model are balanced.",
    });
  });

  it("classifies variable-heavy documents and counts inline references", () => {
    const composition = getComposition([
      { id: "heading", type: "heading", content: [] },
      ...["a", "b", "c", "d"].map((name) => ({ id: name, type: "number", props: { varId: `${name}-id`, name, value: 1 } })),
      { id: "summary", type: "paragraph", content: [{ type: "variableRef", props: { varId: "a-id", label: "a" } }] },
    ]);
    expect(composition).toMatchObject({ prose: 2, variables: 4, inline_refs: 1, reads_like: "story" });
  });

  it("only flags variable-heavy pages when prose or inline references are missing", () => {
    const variables = ["a", "b", "c"].map((name) => ({ id: name, type: "number", props: { varId: `${name}-id`, name, value: 1 } }));
    expect(getComposition([{ id: "heading", type: "heading" }, ...variables]).reads_like).toBe("calculator");
    expect(getComposition([
      { id: "copy", type: "paragraph", content: [{ type: "variableRef", props: { varId: "a-id" } }] },
      ...variables,
    ]).reads_like).toBe("calculator");
  });

  it("counts boolean toggles as variables", () => {
    expect(getComposition([{ id: "hire", type: "boolean", props: { varId: "hire-id", name: "hire", value: 1 } }]).variables).toBe(1);
  });
});

describe("write_section block builder", () => {
  it("creates ordered portable blocks, paragraphs, and known @refs while preserving unknown names", () => {
    let next = 0;
    const blocks = buildSectionBlocks({
      heading: "Unit economics",
      body: "Revenue is @revenue and cost is @cost.\n\nUnknown @margin stays literal.",
      inputs: [{ kind: "slider", name: "revenue", value: 100, min: 0, max: 200, step: 10, currency: "EUR" }],
      formulas: [{ name: "margin", formula: "revenue - cost", label: "Margin" }],
    }, { cost: "cost-id" }, () => `id-${++next}`);

    expect(blocks.map((block) => block.type)).toEqual(["heading", "paragraph", "paragraph", "slider", "formula"]);
    expect(blocks[0]).toMatchObject({ level: 2, text: "Unit economics" });
    expect(blocks[3].props).toMatchObject({ name: "revenue", value: 100, format: "currency", currency: "EUR" });
    expect(blocks[1].inline).toEqual([
      "Revenue is ",
      { type: "ref", varId: blocks[3].props.varId, label: "revenue" },
      " and cost is ",
      { type: "ref", varId: "cost-id", label: "cost" },
      ".",
    ]);
    expect(blocks[2].inline).toEqual([
      "Unknown ",
      { type: "ref", varId: blocks[4].props.varId, label: "margin" },
      " stays literal.",
    ]);
    expect(blocks[4].props).toEqual(expect.objectContaining({ name: "margin", formula: "revenue - cost", label: "Margin" }));
    expect(blocks[4].props).not.toHaveProperty("format");
    expect(inlineContentFromText("Keep @missing and @constructor", {})).toEqual(["Keep ", "@missing", " and ", "@constructor"]);
  });

  it("builds boolean inputs for write_section", () => {
    let next = 0;
    const blocks = buildSectionBlocks({ heading: "Hiring", body: "Hiring: @hired", inputs: [{ kind: "boolean", name: "hired", value: 2 }] }, {}, () => `bool-${++next}`);
    expect(blocks[2]).toMatchObject({ type: "boolean", props: { name: "hired", value: 1 } });
  });
});
