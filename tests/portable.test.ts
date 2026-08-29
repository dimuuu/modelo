import { describe, expect, it } from "vitest";

import {
  fromEditorBlocks,
  portableBlockSchema,
  toEditorBlocks,
} from "../src/engine/portable";
import type { ModeloDocument } from "../src/model";
import { seededWorkspace } from "../src/workspace";

describe("the portable notebook format", () => {
  it("round-trips an editor document, including styled runs and nested blocks", () => {
    const editor: ModeloDocument = [
      {
        content: [{ styles: {}, text: "Plan", type: "text" }],
        id: "h",
        props: { level: 3 },
        type: "heading",
      },
      {
        children: [
          {
            content: [
              { styles: { bold: true }, text: "Bold ", type: "text" },
              {
                props: { label: "price", varId: "price-id" },
                type: "variableRef",
              },
            ],
            id: "nested",
            type: "paragraph",
          },
        ],
        content: [{ styles: {}, text: "Item", type: "text" }],
        id: "li",
        type: "bulletListItem",
      },
      {
        id: "tier",
        props: {
          name: "tier",
          options: '[{"label":"Basic","value":1}]',
          value: 1,
          varId: "tier-id",
        },
        type: "select",
      },
    ];
    expect(toEditorBlocks(fromEditorBlocks(editor))).toEqual(editor);
  });

  it("rejects a block shape it does not know and accepts a foreign BlockNote block", () => {
    expect(
      portableBlockSchema.safeParse({
        id: "x",
        name: "9bad",
        type: "number",
        value: 1,
      }).success
    ).toBe(false);
    expect(
      portableBlockSchema.safeParse({
        content: { rows: [] },
        id: "t",
        type: "table",
      }).success
    ).toBe(true);
  });

  it("accepts text as shorthand for inline and resolves @names on the way in", () => {
    const [heading, paragraph] = toEditorBlocks(
      [
        { id: "h", text: "Plan", type: "heading" },
        { id: "p", text: "Costs @price now.", type: "paragraph" },
      ],
      { price: "price-id" }
    ) as { props?: { level: number }; content: unknown[] }[];
    expect(heading.props?.level).toBe(2);
    expect(paragraph.content[1]).toEqual({
      props: { label: "price", varId: "price-id" },
      type: "variableRef",
    });
  });

  it("keeps every seed paragraph's prose and references", () => {
    for (const notebook of seededWorkspace().notebooks) {
      for (const block of toEditorBlocks(notebook.blocks)) {
        if (block.type === "paragraph") {
          expect(
            (block as { content: unknown[] }).content.length
          ).toBeGreaterThan(0);
        }
      }
    }
  });
});
