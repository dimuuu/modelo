import { describe, expect, it } from "vitest";

import {
  insertBlocksSchema,
  removeVariableSchema,
  toInputSchema,
  updateBlockSchema,
  variableSelectorSchema,
  writeSectionSchema,
} from "../src/webmcp/schemas";

describe("WebMCP argument schemas", () => {
  it("publishes a bare JSON Schema object, as the WebMCP registration expects", () => {
    const schema = toInputSchema(writeSectionSchema) as Record<string, unknown>;
    expect(schema.$schema).toBeUndefined();
    expect(schema.type).toBe("object");
  });

  it("accepts a well formed insert_blocks payload", () => {
    expect(
      insertBlocksSchema.safeParse({
        blocks: [
          { level: 2, text: "Assumptions", type: "heading" },
          { text: "Revenue is @arr.", type: "paragraph" },
          {
            currency: "EUR",
            format: "currency",
            name: "arr",
            type: "number",
            value: 1000,
          },
          { formula: "arr * 2", name: "doubled", type: "formula" },
        ],
      }).success
    ).toBe(true);
  });

  it("rejects unknown keys and invalid variable names", () => {
    expect(
      insertBlocksSchema.safeParse({
        blocks: [{ bogus: 1, text: "hi", type: "paragraph" }],
      }).success
    ).toBe(false);
    expect(
      insertBlocksSchema.safeParse({
        blocks: [{ name: "9bad", type: "number", value: 1 }],
      }).success
    ).toBe(false);
    expect(insertBlocksSchema.safeParse({ blocks: [] }).success).toBe(false);
  });

  it("rejects a blank formula expression", () => {
    expect(
      updateBlockSchema.safeParse({ formula: "1+1", id: "a" }).success
    ).toBe(true);
    expect(
      updateBlockSchema.safeParse({ formula: "   ", id: "a" }).success
    ).toBe(false);
  });

  it("addresses a variable by name or by id, never by both", () => {
    expect(variableSelectorSchema.safeParse({ name: "arr" }).success).toBe(
      true
    );
    expect(variableSelectorSchema.safeParse({ varId: "arr-id" }).success).toBe(
      true
    );
    expect(
      variableSelectorSchema.safeParse({ name: "arr", varId: "arr-id" }).success
    ).toBe(false);
    expect(variableSelectorSchema.safeParse({}).success).toBe(false);
  });

  it("keeps force optional on remove_variable", () => {
    expect(
      removeVariableSchema.safeParse({ force: true, name: "arr" }).success
    ).toBe(true);
    expect(removeVariableSchema.safeParse({ name: "arr" }).success).toBe(true);
  });

  it("constrains write_section inputs to curated units and currencies", () => {
    const base = { body: "Body", heading: "Heading" };
    expect(
      writeSectionSchema.safeParse({
        ...base,
        inputs: [
          {
            currency: "EUR",
            format: "currency",
            kind: "number",
            name: "a",
            value: 1,
          },
        ],
      }).success
    ).toBe(true);
    expect(
      writeSectionSchema.safeParse({
        ...base,
        inputs: [
          {
            currency: "XYZ",
            format: "currency",
            kind: "number",
            name: "a",
            value: 1,
          },
        ],
      }).success
    ).toBe(false);
  });
});
