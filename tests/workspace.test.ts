import { describe, expect, it } from "vitest";

import { toEditorBlocks } from "../src/engine/portable";
import { UNTITLED } from "../src/engine/title";
import {
  createNotebook,
  deleteNotebook,
  duplicateNotebook,
  importNotebook,
  loadWorkspace,
  notebookTitle,
  parseNotebook,
  renameNotebook,
  replaceNotebookBlocks,
  saveWorkspace,
  seededWorkspace,
  setNotebookScenarios,
  STORAGE_KEY,
} from "../src/workspace";
import type { NotebookRecord } from "../src/workspace";

describe("workspace persistence", () => {
  it("copies every seed only on first run", () => {
    const storage = { getItem: () => null } as Pick<Storage, "getItem">;
    const workspace = loadWorkspace(storage);
    expect(workspace.notebooks).toHaveLength(3);
    expect(workspace.notebooks.map((n) => n.id)).toContain(
      "sales-ae-comp-plan"
    );
    expect(workspace).toMatchObject({ currency: "EUR", locale: "es-ES" });
  });

  it("reloads latest save without resurrecting a deleted seed", () => {
    let value: string | null = null;
    const storage = {
      getItem: (key: string) => (key === STORAGE_KEY ? value : null),
      setItem: (_key: string, next: string) => {
        value = next;
      },
    } as Pick<Storage, "getItem" | "setItem">;
    const edited = seededWorkspace();
    edited.notebooks = edited.notebooks.filter(
      (n) => n.id !== "founders-runway-plan"
    );
    const renamed = renameNotebook(
      edited,
      edited.notebooks[0].id,
      "My changed model"
    );
    saveWorkspace(renamed, storage);
    const restored = loadWorkspace(storage);
    expect(restored.notebooks).toHaveLength(2);
    expect(notebookTitle(restored.notebooks[0])).toBe("My changed model");
    expect(
      restored.notebooks.some((n) => n.id === "founders-runway-plan")
    ).toBe(false);
  });

  it("falls back to the seeds when storage does not hold a valid workspace", () => {
    const storage = {
      getItem: () => JSON.stringify({ notebooks: [], version: 1 }),
    } as Pick<Storage, "getItem">;
    expect(loadWorkspace(storage).notebooks).toHaveLength(3);
  });

  it("converts typed flat blocks and parses known @names in paragraph text", () => {
    const blocks = toEditorBlocks(
      [
        { id: "heading", text: "Analysis", type: "heading" },
        {
          decimals: 2,
          id: "input",
          name: "revenue",
          type: "number",
          value: 19.298,
        },
        {
          id: "copy",
          text: "Revenue is @revenue; @missing stays literal.",
          type: "paragraph",
        },
      ],
      { revenue: "revenue-id" }
    ) as { props?: Record<string, unknown>; content?: unknown }[];
    expect(blocks[0].props?.level).toBe(2);
    expect(blocks[1].props).toMatchObject({
      decimals: 2,
      name: "revenue",
      value: 19.298,
    });
    expect(blocks[2].content).toEqual([
      { styles: {}, text: "Revenue is ", type: "text" },
      { props: { name: "revenue", varId: "revenue-id" }, type: "variableRef" },
      { styles: {}, text: "; ", type: "text" },
      { styles: {}, text: "@missing", type: "text" },
      { styles: {}, text: " stays literal.", type: "text" },
    ]);
  });
});

describe("workspace reducers", () => {
  it("create, duplicate, rename, and delete without touching other notebooks", () => {
    const base = seededWorkspace();
    const created = createNotebook(base, "  ", "new-id");
    expect(created.notebook).toMatchObject({ id: "new-id", scenarios: [] });
    expect(created.notebook.blocks).toEqual([
      { inline: [UNTITLED], level: 1, type: "heading" },
      { inline: [], type: "paragraph" },
    ]);
    expect(created.workspace.notebooks).toHaveLength(4);
    expect(base.notebooks).toHaveLength(3);

    const [source] = base.notebooks;
    const copied = duplicateNotebook(created.workspace, source, "copy-id");
    expect(notebookTitle(copied.notebook)).toBe(
      `${notebookTitle(source)} copy`
    );
    expect(copied.notebook.blocks.slice(1)).toEqual(source.blocks.slice(1));
    expect(copied.notebook.blocks).not.toBe(source.blocks);

    const renamed = renameNotebook(copied.workspace, "copy-id", "  ");
    const [kept] = renamed.notebooks.slice(-1);
    expect(notebookTitle(kept)).toBe(notebookTitle(copied.notebook));

    const deleted = deleteNotebook(renamed, "new-id");
    expect(deleted.notebooks.map((notebook) => notebook.id)).not.toContain(
      "new-id"
    );
  });

  it("stamps updatedAt only on the notebook that changed", () => {
    const base = seededWorkspace();
    const stale = "2000-01-01T00:00:00.000Z";
    const frozen = {
      ...base,
      notebooks: base.notebooks.map((notebook) => ({
        ...notebook,
        updatedAt: stale,
      })),
    };
    const [first, second] = frozen.notebooks;
    const withBlocks = replaceNotebookBlocks(frozen, first.id, [
      { id: "h", text: "Hi", type: "heading" },
    ]);
    expect(withBlocks.notebooks[0].updatedAt).not.toBe(stale);
    expect(withBlocks.notebooks[1].updatedAt).toBe(stale);

    const withScenarios = setNotebookScenarios(frozen, second.id, [
      { id: "s", name: "S", values: {} },
    ]);
    expect(withScenarios.notebooks[1].scenarios).toHaveLength(1);
    expect(withScenarios.notebooks[0].scenarios).toEqual(first.scenarios);
  });
});

describe("importing one notebook", () => {
  it("rejects a file that is not a notebook export", () => {
    expect(parseNotebook("not json")).toBeNull();
    expect(parseNotebook(JSON.stringify({ version: 1 }))).toBeNull();
  });

  it("adds an imported notebook under a fresh id", () => {
    const base = seededWorkspace();
    const [source] = base.notebooks;
    const exported = JSON.parse(JSON.stringify(source));
    const record = parseNotebook(JSON.stringify(exported));
    expect(record).not.toBeNull();

    const { workspace, notebook } = importNotebook(
      base,
      record as NotebookRecord,
      "fresh"
    );
    expect(workspace.notebooks).toHaveLength(base.notebooks.length + 1);
    expect(notebook.id).toBe("fresh");
    expect(notebookTitle(notebook)).toBe(notebookTitle(source));
    expect(workspace.notebooks[0]).toBe(source);
  });
});
