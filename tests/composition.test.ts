import { describe, expect, it } from "vitest";

import { getComposition } from "../src/engine/composition";
import { inlineContentFromText } from "../src/engine/portable";
import { buildSectionBlocks } from "../src/engine/section";

describe("document composition", () => {
  it("reports an empty document as a balanced story", () => {
    expect(getComposition([])).toMatchObject({
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
        content: [{ props: { name: "a", varId: "a-id" }, type: "variableRef" }],
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

type LooseBlock = Record<string, unknown>;

function unitEconomics(): LooseBlock[] {
  let next = 0;
  const blocks = buildSectionBlocks(
    {
      body: "Revenue is @revenue and cost is @cost.\n\nMargin is @margin.",
      formulas: [{ formula: "revenue - cost", name: "margin" }],
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
  return blocks as LooseBlock[];
}

describe("write_section block builder", () => {
  it("puts the heading and prose before the variables they mention", () => {
    expect(unitEconomics().map((block) => block.type)).toEqual([
      "heading",
      "paragraph",
      "paragraph",
      "slider",
      "formula",
    ]);
    expect(unitEconomics()[0]).toMatchObject({
      level: 2,
      text: "Unit economics",
    });
  });

  it("links @names to variables declared here and to ones already in the document", () => {
    const blocks = unitEconomics();
    expect(blocks[1].inline).toEqual([
      "Revenue is ",
      { name: "revenue", type: "ref", varId: blocks[3].varId },
      " and cost is ",
      { name: "cost", type: "ref", varId: "cost-id" },
      ".",
    ]);
    // `margin` is declared by this same call, so a forward reference still links.
    expect(blocks[2].inline).toEqual([
      "Margin is ",
      { name: "margin", type: "ref", varId: blocks[4].varId },
      ".",
    ]);
  });

  it("leaves an @name that matches no variable as literal text", () => {
    expect(inlineContentFromText("Keep @missing and @constructor", {})).toEqual(
      ["Keep ", "@missing", " and ", "@constructor"]
    );
  });

  it("infers currency format for inputs and gives formulas no display format", () => {
    const blocks = unitEconomics();
    expect(blocks[3]).toMatchObject({
      currency: "EUR",
      format: "currency",
      name: "revenue",
      value: 100,
    });
    expect(blocks[4]).not.toHaveProperty("format");
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
      name: "hired",
      type: "boolean",
      value: 1,
    });
  });
});
