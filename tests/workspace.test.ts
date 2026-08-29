import { describe, expect, it } from "vitest";

import { toEditorBlocks } from "../src/engine/portable";
import {
  createNotebook,
  deleteNotebook,
  duplicateNotebook,
  loadWorkspace,
  renameNotebook,
  replaceNotebookBlocks,
  saveWorkspace,
  seededWorkspace,
  setNotebookScenarios,
  STORAGE_KEY,
} from "../src/workspace";

describe("workspace persistence", () => {
  it("copies three seeds only on first run", () => {
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
    edited.notebooks[0].title = "My changed model";
    saveWorkspace(edited, storage);
    const restored = loadWorkspace(storage);
    expect(restored.notebooks).toHaveLength(2);
    expect(restored.notebooks[0].title).toBe("My changed model");
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
      { props: { label: "revenue", varId: "revenue-id" }, type: "variableRef" },
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
    expect(created.notebook).toMatchObject({
      blocks: [],
      id: "new-id",
      title: "Untitled",
    });
    expect(created.workspace.notebooks).toHaveLength(4);
    expect(base.notebooks).toHaveLength(3);

    const copied = duplicateNotebook(
      created.workspace,
      base.notebooks[0],
      "copy-id"
    );
    expect(copied.notebook.title).toBe(`${base.notebooks[0].title} copy`);
    expect(copied.notebook.blocks).toEqual(base.notebooks[0].blocks);
    expect(copied.notebook.blocks).not.toBe(base.notebooks[0].blocks);

    const renamed = renameNotebook(copied.workspace, "copy-id", "  ");
    expect(renamed.notebooks.at(-1)?.title).toBe(copied.notebook.title);

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
    expect(withScenarios.notebooks[0].scenarios).toEqual([]);
  });
});
