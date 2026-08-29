import { describe, expect, it } from "vitest";

import {
  buildSectionBlocks,
  getComposition,
  inlineContentFromText,
} from "../src/engine";

describe("document composition", () => {
  it("reports an empty document as a balanced story", () => {
    expect(getComposition([])).toEqual({
      hint: "Narrative and model are balanced.",
      inline_refs: 0,
      prose: 0,
      reads_like: "story",
      variables: 0,
    });
  });

  it("classifies variable-heavy documents and counts inline references", () => {
    const composition = getComposition([
      { content: [], id: "heading", type: "heading" },
      ...["a", "b", "c", "d"].map((name) => ({
        id: name,
        props: { name, value: 1, varId: `${name}-id` },
        type: "number",
      })),
      {
        content: [
          { props: { label: "a", varId: "a-id" }, type: "variableRef" },
        ],
        id: "summary",
        type: "paragraph",
      },
    ]);
    expect(composition).toMatchObject({
      inline_refs: 1,
      prose: 2,
      reads_like: "story",
      variables: 4,
    });
  });

  it("only flags variable-heavy pages when prose or inline references are missing", () => {
    const variables = ["a", "b", "c"].map((name) => ({
      id: name,
      props: { name, value: 1, varId: `${name}-id` },
      type: "number",
    }));
    expect(
      getComposition([{ id: "heading", type: "heading" }, ...variables])
        .reads_like
    ).toBe("calculator");
    expect(
      getComposition([
        {
          content: [{ props: { varId: "a-id" }, type: "variableRef" }],
          id: "copy",
          type: "paragraph",
        },
        ...variables,
      ]).reads_like
    ).toBe("calculator");
  });

  it("counts boolean toggles as variables", () => {
    expect(
      getComposition([
        {
          id: "hire",
          props: { name: "hire", value: 1, varId: "hire-id" },
          type: "boolean",
        },
      ]).variables
    ).toBe(1);
  });
});

describe("write_section block builder", () => {
  it("creates ordered portable blocks, paragraphs, and known @refs while preserving unknown names", () => {
    let next = 0;
    const blocks = buildSectionBlocks(
      {
        body: "Revenue is @revenue and cost is @cost.\n\nUnknown @margin stays literal.",
        formulas: [
          { formula: "revenue - cost", label: "Margin", name: "margin" },
        ],
        heading: "Unit economics",
        inputs: [
          {
            currency: "EUR",
            kind: "slider",
            max: 200,
            min: 0,
            name: "revenue",
            step: 10,
            value: 100,
          },
        ],
      },
      { cost: "cost-id" },
      () => `id-${(next += 1)}`
    );

    expect(blocks.map((block) => block.type)).toEqual([
      "heading",
      "paragraph",
      "paragraph",
      "slider",
      "formula",
    ]);
    expect(blocks[0]).toMatchObject({ level: 2, text: "Unit economics" });
    expect(blocks[3].props).toMatchObject({
      currency: "EUR",
      format: "currency",
      name: "revenue",
      value: 100,
    });
    expect(blocks[1].inline).toEqual([
      "Revenue is ",
      { label: "revenue", type: "ref", varId: blocks[3].props.varId },
      " and cost is ",
      { label: "cost", type: "ref", varId: "cost-id" },
      ".",
    ]);
    expect(blocks[2].inline).toEqual([
      "Unknown ",
      { label: "margin", type: "ref", varId: blocks[4].props.varId },
      " stays literal.",
    ]);
    expect(blocks[4].props).toEqual(
      expect.objectContaining({
        formula: "revenue - cost",
        label: "Margin",
        name: "margin",
      })
    );
    expect(blocks[4].props).not.toHaveProperty("format");
    expect(inlineContentFromText("Keep @missing and @constructor", {})).toEqual(
      ["Keep ", "@missing", " and ", "@constructor"]
    );
  });

  it("builds boolean inputs for write_section", () => {
    let next = 0;
    const blocks = buildSectionBlocks(
      {
        body: "Hiring: @hired",
        heading: "Hiring",
        inputs: [{ kind: "boolean", name: "hired", value: 2 }],
      },
      {},
      () => `bool-${(next += 1)}`
    );
    expect(blocks[2]).toMatchObject({
      props: { name: "hired", value: 1 },
      type: "boolean",
    });
  });
});
