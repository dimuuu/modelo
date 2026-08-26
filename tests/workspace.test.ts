import { describe, expect, it } from "vitest";
import { loadWorkspace, portableToEditorBlocks, saveWorkspace, seededWorkspace, STORAGE_KEY } from "../src/workspace";

describe("workspace persistence", () => {
  it("copies three seeds only on first run", () => {
    const storage = { getItem: () => null } as Pick<Storage, "getItem">;
    const workspace = loadWorkspace(storage);
    expect(workspace.notebooks).toHaveLength(3);
    expect(workspace.notebooks.map((n) => n.id)).toContain("sales-ae-comp-plan");
    expect(workspace).toMatchObject({ currency: "EUR", locale: "es-ES" });
  });

  it("reloads latest save without resurrecting a deleted seed", () => {
    let value: string | null = null;
    const storage = { getItem: (key: string) => key === STORAGE_KEY ? value : null, setItem: (_key: string, next: string) => { value = next; } } as Pick<Storage, "getItem"|"setItem">;
    const edited = seededWorkspace();
    edited.notebooks = edited.notebooks.filter((n) => n.id !== "founders-runway-plan");
    edited.notebooks[0].title = "My changed model";
    saveWorkspace(edited, storage);
    const restored = loadWorkspace(storage);
    expect(restored.notebooks).toHaveLength(2);
    expect(restored.notebooks[0].title).toBe("My changed model");
    expect(restored.notebooks.some((n) => n.id === "founders-runway-plan")).toBe(false);
  });

  it("defaults currency and locale when loading an older v1 workspace", () => {
    const storage = { getItem: () => JSON.stringify({ version: 1, notebooks: [] }) } as Pick<Storage, "getItem">;
    expect(loadWorkspace(storage)).toEqual({ version: 1, notebooks: [], currency: "EUR", locale: "es-ES" });
  });

  it("converts typed flat blocks and parses known @names in paragraph text", () => {
    const blocks = portableToEditorBlocks([
      { id: "heading", type: "heading", text: "Analysis" },
      { id: "input", type: "number", name: "revenue", value: 19.298, decimals: 2 },
      { id: "copy", type: "paragraph", text: "Revenue is @revenue; @missing stays literal." },
    ], { revenue: "revenue-id" });
    expect(blocks[0].props.level).toBe(2);
    expect(blocks[1].props).toMatchObject({ name: "revenue", value: 19.298, decimals: 2 });
    expect(blocks[2].content).toEqual([
      { type: "text", text: "Revenue is ", styles: {} },
      { type: "variableRef", props: { varId: "revenue-id", label: "revenue" } },
      { type: "text", text: "; ", styles: {} },
      { type: "text", text: "@missing", styles: {} },
      { type: "text", text: " stays literal.", styles: {} },
    ]);
  });
});
