import { describe, expect, it } from "vitest";

import { toEditorBlocks } from "../src/engine/portable";
import {
  readTitle,
  titleBlock,
  UNTITLED,
  withTitleBlock,
} from "../src/engine/title";
import { ensureTitleBlock, setNotebookTitle } from "../src/notebook/mutations";
import { createMemoryPort } from "../src/notebook/port";

/**
 * The notebook title is the document's first block. These tests hold the
 * invariant: the title heading is always there, and it is always level 1.
 */

const paragraph = (text: string, id: string) => ({
  content: [{ styles: {}, text, type: "text" }],
  id,
  props: {},
  type: "paragraph",
});

const heading = (text: string, level: number, id: string) => ({
  ...paragraph(text, id),
  props: { level },
  type: "heading",
});

describe("reading the title", () => {
  it("takes the text of a leading level 1 heading", () => {
    expect(readTitle([heading("Runway", 1, "h")])).toBe("Runway");
  });

  it("falls back when the first block is not a title heading", () => {
    expect(readTitle([])).toBe(UNTITLED);
    expect(readTitle([heading("Section", 2, "h")])).toBe(UNTITLED);
    expect(readTitle([paragraph("Prose", "p")])).toBe(UNTITLED);
  });

  it("reads the portable dialect, where the level is a flat field", () => {
    expect(readTitle([titleBlock("Rent vs mortgage")])).toBe(
      "Rent vs mortgage"
    );
  });

  it("adds a title heading only when one is missing", () => {
    const titled = [titleBlock("Runway")];
    expect(withTitleBlock(titled)).toBe(titled);
    expect(
      readTitle(withTitleBlock([{ text: "Prose", type: "paragraph" }]))
    ).toBe(UNTITLED);
  });
});

describe("keeping the title in the document", () => {
  it("leaves a document that already starts with its title", () => {
    const port = createMemoryPort([heading("Runway", 1, "h")]);
    expect(ensureTitleBlock(port)).toBe(false);
    expect(port.document).toHaveLength(1);
  });

  it("promotes a leading heading of the wrong level", () => {
    const port = createMemoryPort([heading("Runway", 2, "h")]);
    expect(ensureTitleBlock(port)).toBe(true);
    expect(readTitle(port.document)).toBe("Runway");
  });

  it("turns the empty paragraph BlockNote leaves behind into the title", () => {
    const port = createMemoryPort([paragraph("", "p")]);
    expect(ensureTitleBlock(port)).toBe(true);
    expect(port.document).toHaveLength(1);
    expect(readTitle(port.document)).toBe(UNTITLED);
  });

  it("keeps real prose in its own block and puts the title above it", () => {
    const port = createMemoryPort([paragraph("Prose", "p")]);
    expect(ensureTitleBlock(port)).toBe(true);
    expect(port.document).toHaveLength(2);
    expect(readTitle(port.document)).toBe(UNTITLED);
    expect(port.document[1].id).toBe("p");
  });

  it("gives an empty document a title", () => {
    const port = createMemoryPort([]);
    expect(ensureTitleBlock(port)).toBe(true);
    expect(readTitle(port.document)).toBe(UNTITLED);
  });

  it("retitles by rewriting the heading, not by adding one", () => {
    const port = createMemoryPort(toEditorBlocks([titleBlock("Runway")]));
    const [before] = port.document;
    setNotebookTitle(port, "Runway v2");
    expect(port.document).toHaveLength(1);
    expect(port.document[0].id).toBe(before.id);
    expect(readTitle(port.document)).toBe("Runway v2");
  });
});
